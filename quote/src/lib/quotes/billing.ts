import "server-only";
import { customerUrl } from "@/lib/accept/settings";
import { createRecord, listByIds, updateRecord } from "@/lib/airtable/client";
import { INVOICE, QUOTE, RECEIPT, T } from "@/lib/airtable/fields";
import { requireQuoterPerson } from "@/lib/auth";
import {
  billingFile,
  billingKind,
  billingLogWhat,
  billingTotals,
  cleanPayments,
  contractCopy,
  isBillingNumber,
  kindReason,
  kindTitle,
  parseSnapshot,
  serializeSnapshot,
  type BillingKind,
  type BillingSnapshot,
  type Payment,
} from "@/lib/billing/doc";
import { sendMessage } from "@/lib/make/client";
import { paymentsReaderOn, projectPayments } from "@/lib/notion/payments";
import { torontoToday, type CustomerCopy } from "@/lib/send/copy";
import { billingEmailMessage, customerLinks, emailFromFor, isToken } from "@/lib/send/plan";
import { appendLog, authorFields, firstNameOf, logLine } from "./history";
import { loadContract } from "./contract";
import { getQuote } from "./load";
import { refreshFromGhl } from "./refresh";
import type { Quote } from "./types";
import { ids, str } from "./values";

/**
 * Invoices and receipts (Albert, 2026-10-30), carried out. Rules in src/lib/billing/doc.ts. One document per won
 * project, on its contract version (the accepted one, or the change that replaced it):
 *
 * - **Export** creates the project's Invoices or Receipts row the first time (Airtable's autonumber issues the
 *   number, so two people can never get the same one, and none is reused), then refreshes its Snapshot: the
 *   contract, the payments read from Notion today, the HST number. The PDF is drawn from the Snapshot.
 * - **Email** exports, then sends the customer an email through Make with the PDF attached, served from their link
 *   on the customer deployment, which reads only the Snapshot.
 *
 * Writes Invoices / Receipts and one Edit Log line on the version. Nothing posts to QuickBooks or Lightspeed.
 */

const TABLE = { invoice: T.invoices, receipt: T.receipts } as const;
const FIELDS = { invoice: INVOICE, receipt: RECEIPT } as const;

export type BillingState = {
  kind: BillingKind;
  title: string;
  reason: string;
  number: string | null;
  issuedAt: string | null;
  lastSentAt: string | null;
  sentTo: string | null;
  /** Read live from Notion; null when they couldn't be read (see `paymentsProblem`). */
  payments: Payment[] | null;
  paymentsProblem: string | null;
  total: number;
  paid: number | null;
  balance: number | null;
  credit: number | null;
  email: string | null;
  /** Another document exists on the other table (the contract's HST changed after one was issued). */
  conflict: string | null;
};

type Contract = { quote: Quote; copy: CustomerCopy; kind: BillingKind };

/** The contract this version is, or why it can't be billed. */
async function contract(versionId: string): Promise<Contract | string> {
  const loaded = await getQuote(versionId);
  if (!loaded) return "This version no longer exists.";
  if (!loaded.link || loaded.link.contractVersionId !== loaded.id) return "Only the version that is the contract (accepted, or its latest change) has an invoice or receipt.";
  const c = await loadContract(loaded.link.quoteRecordId);
  if (!c) return "This project's contract couldn't be read (or its acceptance was cancelled).";
  const copy = contractCopy(c.view);
  return { quote: loaded, copy, kind: billingKind(copy) };
}

type Doc = { kind: BillingKind; id: string; fields: Record<string, unknown> };

/** The project's existing invoice and receipt rows, if any. */
async function docs(quoteRecordId: string): Promise<Doc[]> {
  const q = (await listByIds(T.quotes, [quoteRecordId], [QUOTE.invoices, QUOTE.receipts]))[0];
  const out: Doc[] = [];
  for (const kind of ["invoice", "receipt"] as const) {
    const rowIds = ids(q?.fields[kind === "invoice" ? QUOTE.invoices : QUOTE.receipts]);
    if (rowIds.length) for (const r of await listByIds(TABLE[kind], rowIds)) out.push({ kind, id: r.id, fields: r.fields });
  }
  return out;
}

const hstNumber = () => process.env.QUOTE_COMPANY_HST?.trim() || null;

/** For the quote page's card. Null when this version isn't a contract. */
export async function billingState(versionId: string): Promise<BillingState | null> {
  await requireQuoterPerson();
  const c = await contract(versionId);
  if (typeof c === "string") return null;
  const found = await docs(c.quote.link!.quoteRecordId);
  const mine = found.find((d) => d.kind === c.kind);
  const other = found.find((d) => d.kind !== c.kind);
  const F = FIELDS[c.kind];
  let payments: Payment[] | null = null;
  let paymentsProblem: string | null = null;
  if (!paymentsReaderOn()) paymentsProblem = "Reading payments from Notion isn't set up yet.";
  else {
    try {
      payments = cleanPayments(await projectPayments(c.quote.link?.notionProjectUrl));
    } catch (e) {
      paymentsProblem = e instanceof Error ? e.message : "The payments couldn't be read.";
    }
  }
  const t = payments ? billingTotals({ copy: c.copy, payments }) : null;
  return {
    kind: c.kind,
    title: kindTitle(c.kind),
    reason: kindReason(c.kind, c.copy),
    number: mine && isBillingNumber(c.kind, mine.fields[F.number]) ? (mine.fields[F.number] as string) : null,
    issuedAt: mine ? str(mine.fields[F.issuedAt]) : null,
    lastSentAt: mine ? str(mine.fields[F.lastSentAt]) : null,
    sentTo: mine ? str(mine.fields[F.sentTo]) : null,
    payments,
    paymentsProblem,
    total: c.copy.options[0]?.totals.total ?? 0,
    paid: t?.paid ?? null,
    balance: t?.balance ?? null,
    credit: t?.credit ?? null,
    email: c.quote.link?.email ?? null,
    conflict: other && !mine ? `This project already has ${other.kind === "invoice" ? "an invoice" : "a receipt"} (${str(other.fields[FIELDS[other.kind].number]) ?? "no number"}), but its contract now makes it ${c.kind === "invoice" ? "an invoice" : "a receipt"}. Ask Albert before issuing a second number.` : null,
  };
}

export type BillingResult = { ok: true; number: string; title: string; payments: number; warning: string | null } | { ok: false; message: string };

/** Issue (the first time) and refresh the project's document. Returns its snapshot, or why not. */
async function exportDoc(versionId: string, who: string, did: "exported" | "emailed"): Promise<{ snap: BillingSnapshot; c: Contract; row: Doc } | string> {
  const c = await contract(versionId);
  if (typeof c === "string") return c;
  if (!paymentsReaderOn()) return "Reading payments from Notion isn't set up yet, so the document can't list them.";
  let payments: Payment[];
  try {
    payments = cleanPayments(await projectPayments(c.quote.link?.notionProjectUrl));
  } catch (e) {
    return e instanceof Error ? e.message : "The payments couldn't be read.";
  }
  const quoteRecordId = c.quote.link!.quoteRecordId;
  const found = await docs(quoteRecordId);
  if (found.some((d) => d.kind !== c.kind) && !found.some((d) => d.kind === c.kind)) {
    return `This project already has ${c.kind === "invoice" ? "a receipt" : "an invoice"}, and its contract now makes it ${c.kind === "invoice" ? "an invoice" : "a receipt"}. Ask Albert before issuing a second number.`;
  }
  const F = FIELDS[c.kind];
  const now = new Date();
  let row = found.find((d) => d.kind === c.kind);
  if (!row) {
    // The autonumber is assigned here, by Airtable: the number exists from this moment and is never reused.
    const made = await createRecord(TABLE[c.kind], { [F.quote]: [quoteRecordId], [F.contractVersion]: [c.quote.id], [F.issuedAt]: now.toISOString(), [F.issuedBy]: who });
    row = { kind: c.kind, id: made.id, fields: made.fields };
  }
  // The create normally returns the formula's value; if not, read the row back once.
  if (!isBillingNumber(c.kind, row.fields[F.number])) row = { ...row, fields: (await listByIds(TABLE[c.kind], [row.id]))[0]?.fields ?? row.fields };
  const number = row.fields[F.number];
  if (!isBillingNumber(c.kind, number)) return "Airtable didn't give the document a number. Check the Number formula on the table.";
  const issuedAt = str(row.fields[F.issuedAt]);
  const snap: BillingSnapshot = {
    v: 1,
    kind: c.kind,
    number,
    issuedOn: torontoToday(issuedAt ? new Date(issuedAt) : now),
    asOf: torontoToday(now),
    copy: c.copy,
    payments,
    hstNumber: hstNumber(),
    project: c.quote.link?.projectNumber ?? null,
  };
  await updateRecord(TABLE[c.kind], row.id, {
    [F.snapshot]: serializeSnapshot(snap),
    [F.contractVersion]: [c.quote.id],
    [F.log]: appendLog(str(row.fields[F.log]), logLine(now, who, billingLogWhat(snap, did))),
  });
  return { snap, c, row };
}

/** Export: issue the number the first time, refresh the payments every time. The PDF is then at /q/<id>/billing. */
export async function issueBilling(versionId: string): Promise<BillingResult> {
  const person = await requireQuoterPerson();
  const r = await exportDoc(versionId, person.email, "exported");
  if (typeof r === "string") return { ok: false, message: r };
  let warning: string | null = null;
  try {
    await updateRecord(T.versions, r.c.quote.id, authorFields(person, new Date(), billingLogWhat(r.snap, "exported"), r.c.quote.editLog));
  } catch {
    warning = "Airtable didn't record it in the version's history.";
  }
  return { ok: true, number: r.snap.number, title: kindTitle(r.snap.kind), payments: r.snap.payments.length, warning };
}

/** Email the customer the document, the PDF attached. */
export async function emailBilling(versionId: string): Promise<BillingResult> {
  const person = await requireQuoterPerson();
  const base = customerUrl();
  if (!base) return { ok: false, message: "The customer link address (QUOTE_CUSTOMER_URL) isn't set for this deployment." };
  const loaded = await getQuote(versionId);
  if (!loaded) return { ok: false, message: "This version no longer exists." };
  const fresh = await refreshFromGhl(loaded);
  const contactId = fresh.link?.ghlContactId;
  if (!contactId || !fresh.link?.email) return { ok: false, message: "The GHL contact has no email." };
  if (!isToken(fresh.customerToken)) return { ok: false, message: "This version has no customer link, so the PDF can't be attached." };
  const r = await exportDoc(versionId, person.email, "emailed");
  if (typeof r === "string") return { ok: false, message: r };
  const t = billingTotals(r.snap);
  const { pdfUrl } = customerLinks(base, fresh.customerToken, billingFile(r.snap.kind, r.snap.number));
  const from = { email: person.email, firstName: firstNameOf(person) };
  const doc = { title: kindTitle(r.snap.kind) as "Invoice" | "Receipt", number: r.snap.number, ...t };
  const to = { contactId, firstName: fresh.link.firstName ?? null, pdfUrl };
  // From the quoter, named, then bare, then GHL's default, as a quote is sent.
  const attempts = [...new Set([emailFromFor(from, r.snap.copy.company.email, true), emailFromFor(from, r.snap.copy.company.email, false), null])];
  let last: unknown = null;
  let sentFrom: string | null = null;
  for (const emailFrom of attempts) {
    try {
      await sendMessage(billingEmailMessage(r.snap.copy, doc, to, from, { emailFrom }));
      sentFrom = emailFrom;
      last = null;
      break;
    } catch (e) {
      last = e;
    }
  }
  if (last) return { ok: false, message: `The ${doc.title.toLowerCase()} is ${r.snap.number}, but the email didn't go: ${last instanceof Error ? last.message : String(last)}` };
  const notes: string[] = [];
  if (sentFrom === null && attempts[0] !== null) notes.push(`GHL would not send from ${person.email}, so the email went out from the location's default address.`);
  try {
    const F = FIELDS[r.snap.kind];
    await updateRecord(TABLE[r.snap.kind], r.row.id, { [F.lastSentAt]: new Date().toISOString(), [F.sentTo]: fresh.link.email });
    await updateRecord(T.versions, fresh.id, authorFields(person, new Date(), billingLogWhat(r.snap, "emailed"), fresh.editLog));
  } catch {
    notes.push("Airtable didn't record that it was emailed.");
  }
  return { ok: true, number: r.snap.number, title: doc.title, payments: r.snap.payments.length, warning: notes.join(" ") || null };
}

/** The frozen document for the staff download, or null when none has been exported. */
export async function billingSnapshot(versionId: string): Promise<BillingSnapshot | null> {
  await requireQuoterPerson();
  const loaded = await getQuote(versionId);
  if (!loaded?.link) return null;
  for (const d of await docs(loaded.link.quoteRecordId)) {
    const s = parseSnapshot(str(d.fields[FIELDS[d.kind].snapshot]));
    if (s) return s;
  }
  return null;
}
