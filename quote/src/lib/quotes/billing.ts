import "server-only";
import { customerUrl } from "@/lib/accept/settings";
import { createRecord, listByIds, updateRecord } from "@/lib/airtable/client";
import { INVOICE, QUOTE, RECEIPT, T } from "@/lib/airtable/fields";
import { requireQuoterPerson } from "@/lib/auth";
import {
  billingFile,
  billingKind,
  billingLogWhat,
  billingPlan,
  billingTotals,
  cleanPayments,
  contractCopy,
  isBillingNumber,
  kindReason,
  kindTitle,
  parseSnapshot,
  serializeSnapshot,
  shownTotals,
  unvoidLogWhat,
  voidLogWhat,
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
 * - **The HST flipped** (2026-10-31), back and forth: each kind keeps its number on file and the contract decides
 *   which is current. Exporting marks void the other kind's document if the customer was emailed it (Snapshot kept,
 *   Log says by what, row never deleted); one never emailed stays in the background untouched.
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
  /** Whether the PDF shows an overpayment as a credit; false shows Paid in full (2026-10-31). */
  creditShown: boolean;
  /** Emailed documents of the other kind that exporting this one will mark void (the contract's HST changed). */
  willVoid: string[];
  /** Documents of the other kind never emailed: on file, in the background, left alone. */
  background: string[];
  /** This kind's document is void now and exporting brings it back (the HST changed back). */
  willRestore: boolean;
  /** Documents already void, and what replaced them. */
  voided: { number: string; replacedBy: string; on: string }[];
};

/** How the next export is drawn (2026-10-31). */
export type BillingChoice = { showCredit: boolean };

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

type Doc = { kind: BillingKind; id: string; fields: Record<string, unknown>; snap: BillingSnapshot | null; voided: boolean; emailed: boolean };

const docOf = (kind: BillingKind, id: string, fields: Record<string, unknown>): Doc => {
  const snap = parseSnapshot(str(fields[FIELDS[kind].snapshot]));
  return { kind, id, fields, snap, voided: Boolean(snap?.voided), emailed: Boolean(str(fields[FIELDS[kind].lastSentAt])) };
};

/** The project's existing invoice and receipt rows, if any, oldest first. */
async function docs(quoteRecordId: string): Promise<Doc[]> {
  const q = (await listByIds(T.quotes, [quoteRecordId], [QUOTE.invoices, QUOTE.receipts]))[0];
  const out: Doc[] = [];
  for (const kind of ["invoice", "receipt"] as const) {
    const rowIds = ids(q?.fields[kind === "invoice" ? QUOTE.invoices : QUOTE.receipts]);
    if (rowIds.length) for (const r of await listByIds(TABLE[kind], rowIds)) out.push(docOf(kind, r.id, r.fields));
  }
  return out.sort((a, b) => (str(a.fields[FIELDS[a.kind].issuedAt]) ?? "").localeCompare(str(b.fields[FIELDS[b.kind].issuedAt]) ?? ""));
}

const numberOf = (d: Doc) => str(d.fields[FIELDS[d.kind].number]);

const hstNumber = () => process.env.QUOTE_COMPANY_HST?.trim() || null;

/** For the quote page's card. Null when this version isn't a contract. */
export async function billingState(versionId: string): Promise<BillingState | null> {
  await requireQuoterPerson();
  const c = await contract(versionId);
  if (typeof c === "string") return null;
  const found = await docs(c.quote.link!.quoteRecordId);
  const { live: mine, toVoid } = billingPlan(c.kind, found);
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
    // Hidden unless chosen otherwise: an overpaid project reads as Paid in full (Albert, 2026-10-31).
    creditShown: mine?.snap?.creditShown ?? false,
    willVoid: toVoid.map((d) => numberOf(d) ?? "a document with no number"),
    background: found.filter((d) => d.kind !== c.kind && !d.emailed).map((d) => numberOf(d) ?? "a document with no number"),
    willRestore: Boolean(mine?.voided),
    voided: found.flatMap((d) => (d.snap?.voided ? [{ number: d.snap.number, replacedBy: d.snap.voided.replacedBy, on: d.snap.voided.on }] : [])),
  };
}

export type BillingResult = { ok: true; number: string; title: string; payments: number; voided: string[]; warning: string | null } | { ok: false; message: string };

/** Issue (the first time) and refresh the project's document. Returns its snapshot, or why not. */
async function exportDoc(versionId: string, who: string, did: "exported" | "emailed", choice: BillingChoice): Promise<{ snap: BillingSnapshot; c: Contract; row: Doc; voided: string[]; warning: string | null } | string> {
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
  // The contract's HST changed after a document was issued (2026-10-31): this kind's number is reused if it has one;
  // an emailed one of the other kind is voided below, once this one has its number, and this one names it.
  const { live, replaces, toVoid } = billingPlan(c.kind, found);
  const F = FIELDS[c.kind];
  const now = new Date();
  let row = live;
  if (!row) {
    // The autonumber is assigned here, by Airtable: the number exists from this moment and is never reused.
    const made = await createRecord(TABLE[c.kind], { [F.quote]: [quoteRecordId], [F.contractVersion]: [c.quote.id], [F.issuedAt]: now.toISOString(), [F.issuedBy]: who });
    row = docOf(c.kind, made.id, made.fields);
  }
  // The create normally returns the formula's value; if not, read the row back once.
  if (!isBillingNumber(c.kind, row.fields[F.number])) row = { ...row, fields: (await listByIds(TABLE[c.kind], [row.id]))[0]?.fields ?? row.fields };
  const number = row.fields[F.number];
  if (!isBillingNumber(c.kind, number)) return "Airtable didn't give the document a number. Check the Number formula on the table.";
  const issuedAt = str(row.fields[F.issuedAt]);
  const voiding = toVoid.map(numberOf).filter((n): n is string => Boolean(n));
  const restored = Boolean(row.voided);
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
    creditShown: choice.showCredit,
    replaces: replaces.map(numberOf).filter((n): n is string => Boolean(n)),
    // Current again if it had been voided: the switch goes both ways.
    voided: null,
  };
  let log = str(row.fields[F.log]);
  if (restored) log = appendLog(log, logLine(now, who, unvoidLogWhat(c.kind, number)));
  await updateRecord(TABLE[c.kind], row.id, {
    [F.snapshot]: serializeSnapshot(snap),
    [F.contractVersion]: [c.quote.id],
    [F.log]: appendLog(log, logLine(now, who, billingLogWhat(snap, did, voiding))),
  });
  // Void the emailed documents of the other kind. Their Snapshot is kept (the customer's old link then shows it marked
  // void) and their row stays, never deleted. One that fails is voided by the next export.
  const voided: string[] = [];
  for (const d of toVoid) {
    const n = numberOf(d);
    if (!n || !isBillingNumber(d.kind, n)) continue;
    const old: BillingSnapshot = d.snap ?? { ...snap, kind: d.kind, number: n, payments: [], replaces: [], issuedOn: torontoToday(new Date(str(d.fields[FIELDS[d.kind].issuedAt]) ?? now)) };
    try {
      await updateRecord(TABLE[d.kind], d.id, {
        [FIELDS[d.kind].snapshot]: serializeSnapshot({ ...old, voided: { on: torontoToday(now), by: who, replacedBy: number } }),
        [FIELDS[d.kind].log]: appendLog(str(d.fields[FIELDS[d.kind].log]), logLine(now, who, voidLogWhat(d.kind, n, number))),
      });
      voided.push(n);
    } catch {
      /* reported below */
    }
  }
  const missed = voiding.filter((n) => !voided.includes(n));
  const warning = missed.length ? `Airtable didn't mark ${missed.join(", ")} void; exporting again will.` : null;
  return { snap, c, row, voided, warning };
}

/** Export: issue the number the first time, refresh the payments every time. The PDF is then at /q/<id>/billing. */
export async function issueBilling(versionId: string, choice: BillingChoice): Promise<BillingResult> {
  const person = await requireQuoterPerson();
  const r = await exportDoc(versionId, person.email, "exported", choice);
  if (typeof r === "string") return { ok: false, message: r };
  const notes = r.warning ? [r.warning] : [];
  try {
    await updateRecord(T.versions, r.c.quote.id, authorFields(person, new Date(), billingLogWhat(r.snap, "exported", r.voided), r.c.quote.editLog));
  } catch {
    notes.push("Airtable didn't record it in the version's history.");
  }
  return { ok: true, number: r.snap.number, title: kindTitle(r.snap.kind), payments: r.snap.payments.length, voided: r.voided, warning: notes.join(" ") || null };
}

/** Email the customer the document, the PDF attached. */
export async function emailBilling(versionId: string, choice: BillingChoice): Promise<BillingResult> {
  const person = await requireQuoterPerson();
  const base = customerUrl();
  if (!base) return { ok: false, message: "The customer link address (QUOTE_CUSTOMER_URL) isn't set for this deployment." };
  const loaded = await getQuote(versionId);
  if (!loaded) return { ok: false, message: "This version no longer exists." };
  const fresh = await refreshFromGhl(loaded);
  const contactId = fresh.link?.ghlContactId;
  if (!contactId || !fresh.link?.email) return { ok: false, message: "The GHL contact has no email." };
  if (!isToken(fresh.customerToken)) return { ok: false, message: "This version has no customer link, so the PDF can't be attached." };
  const r = await exportDoc(versionId, person.email, "emailed", choice);
  if (typeof r === "string") return { ok: false, message: r };
  const t = shownTotals(r.snap);
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
  const notes: string[] = r.warning ? [r.warning] : [];
  if (sentFrom === null && attempts[0] !== null) notes.push(`GHL would not send from ${person.email}, so the email went out from the location's default address.`);
  try {
    const F = FIELDS[r.snap.kind];
    await updateRecord(TABLE[r.snap.kind], r.row.id, { [F.lastSentAt]: new Date().toISOString(), [F.sentTo]: fresh.link.email });
    await updateRecord(T.versions, fresh.id, authorFields(person, new Date(), billingLogWhat(r.snap, "emailed", r.voided), fresh.editLog));
  } catch {
    notes.push("Airtable didn't record that it was emailed.");
  }
  return { ok: true, number: r.snap.number, title: doc.title, payments: r.snap.payments.length, voided: r.voided, warning: notes.join(" ") || null };
}

/** The frozen document for the staff download: the contract's current kind, as last exported; null when none. */
export async function billingSnapshot(versionId: string): Promise<BillingSnapshot | null> {
  await requireQuoterPerson();
  const c = await contract(versionId);
  if (typeof c === "string") return null;
  return billingPlan(c.kind, await docs(c.quote.link!.quoteRecordId)).live?.snap ?? null;
}
