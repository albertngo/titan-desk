import "server-only";
import { customerUrl, etransferEmail } from "@/lib/accept/settings";
import { listByIds, listRecords, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { paidTotal, planProgress } from "@/lib/calc";
import { getContact, locationUsers, searchContacts } from "@/lib/ghl/client";
import { sendMessage } from "@/lib/make/client";
import { paymentsForProjects, paymentsReaderOn, projectPayments } from "@/lib/notion/payments";
import { notionPageId } from "@/lib/notion/rows";
import { addRequest, OFFICE, parseRequests, reminderFor, reminderWindow, requestAmount, requestLogWhat, requestProblem, stageFor, type PaymentRequest, type RequestKind } from "@/lib/projects/request";
import { cleanPayments, contractCopy } from "@/lib/billing/doc";
import { requireQuoterPerson } from "@/lib/auth";
import { money } from "@/lib/format";
import { settings } from "@/lib/settings/settings";
import { customerLinks, fromAttempts, fromTheirNumber, isToken, noNumberWords, noSenderWords, officeFromAttempts, paymentRequestEmailMessage, paymentRequestSmsMessage, textFromFor, type PaymentAsk } from "@/lib/send/plan";
import { billingForRequest } from "./billing";
import { loadContract } from "./contract";
import { authorFields, firstNameOf } from "./history";
import type { CustomerCopy } from "@/lib/send/copy";
import { getQuote } from "./load";
import { refreshFromGhl } from "./refresh";
import { officeEmail, pickSender } from "./send";
import { projectPm, projectRowsSince, projectStatusOn } from "@/lib/notion/projectStatus";
import { followUpKeyOk } from "./followup";
import { torontoDay } from "./group";
import { ids, str } from "./values";

/**
 * Payment requests from All quotes (Albert, 2026-11-27; vault 05_decisions/2026-11-27-quote-payment-request-buttons-and-
 * auto-second, -payment-requests-test-switch-and-field). Rules in src/lib/projects/request.ts.
 *
 * - The amount is worked out here from the contract's payment plan and the payments read from Notion this moment;
 *   nothing the browser sends about money is used. A final request refreshes the invoice or receipt (as Export does)
 *   and attaches it.
 * - **Test until Albert flips it:** while Settings' "Payment requests go to customers" is off, the email and the text go
 *   to the sender's own GHL contact (found by their sign-in email, exact match), marked Test.
 * - Writes Quotes → Payment Requests (the log) and one Edit Log line on the contract version; the invoice or receipt only
 *   through billing.ts. Sends through Make's message route, the email from the sender, the text from their own number.
 */

/** `as` (2026-11-27): "office" (the default) or the email of someone the person may send as. */
export type RequestInput = { kind: RequestKind; email: boolean; text: boolean; as?: string | null };
export type RequestResult = { ok: true; test: boolean; amount: number; sent: string[]; warning: string | null } | { ok: false; message: string };

export async function requestPayment(versionId: string, input: RequestInput): Promise<RequestResult> {
  const actor = await requireQuoterPerson();
  const kind: RequestKind = input.kind === "second" ? "second" : "final";
  const channels = { email: input.email === true, text: input.text === true };
  // Who it goes out as (Albert, 2026-11-27: "default is office, cc'd the PM. But able to select who to send it out as").
  const asOffice = !input.as || input.as === OFFICE;
  let sender: { email: string; name: string | null };
  let asWho: string | null;
  if (asOffice) {
    const office = officeEmail();
    if (!office) return { ok: false, message: "The office email (QUOTE_COMPANY_EMAIL) isn't set for this deployment, so it can't go as the office. Pick a person instead." };
    sender = { email: office, name: null };
    asWho = OFFICE;
  } else {
    const picked = await pickSender(input.as);
    if (!picked.ok) return { ok: false, message: picked.message };
    sender = picked.sender;
    asWho = picked.as ? sender.email : null;
  }
  const etransfer = etransferEmail();
  if (!etransfer) return { ok: false, message: "The e-transfer address (QUOTE_ETRANSFER_EMAIL) isn't set for this deployment." };
  if (!paymentsReaderOn()) return { ok: false, message: "Reading payments from Notion isn't set up, so the amount isn't known." };

  const any = await getQuote(versionId);
  const contractId = any?.link?.contractVersionId;
  if (!any || !contractId) return { ok: false, message: "This quote has no contract yet." };
  const loaded = contractId === any.id ? any : await getQuote(contractId);
  if (!loaded?.link) return { ok: false, message: "The contract version couldn't be read." };
  const fresh = await refreshFromGhl(loaded);
  const link = fresh.link!;
  const c = await loadContract(link.quoteRecordId);
  if (!c) return { ok: false, message: "This project's contract couldn't be read (or its acceptance was cancelled)." };
  const copy = contractCopy(c.view);

  let paid: number;
  try {
    paid = paidTotal(cleanPayments(await projectPayments(link.notionProjectUrl)).map((p) => p.amount));
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The payments couldn't be read." };
  }
  const plan = planProgress(c.contract.stages.map((s) => ({ label: s.label, when: s.when, pay: s.pay, amount: s.amount })), c.contract.totals.total, paid);
  const problem = requestProblem(kind, plan, channels);
  if (problem) return { ok: false, message: problem };
  const amount = requestAmount(kind, plan);

  // Who it goes to: the customer once the switch is on; until then the sender's own GHL contact, marked Test.
  const live = (await settings()).paymentRequestsLive;
  let to: { contactId: string; firstName: string | null; email: string | null; phone: string | null };
  if (live) {
    if (!link.ghlContactId) return { ok: false, message: "This quote has no GHL contact." };
    to = { contactId: link.ghlContactId, firstName: link.firstName, email: link.email, phone: link.phone };
  } else {
    const me = (await searchContacts(actor.email, 8).catch(() => [])).find((x) => (x.email ?? "").trim().toLowerCase() === actor.email.trim().toLowerCase());
    if (!me) return { ok: false, message: `Payment requests are in test (Settings), so they go to your own GHL contact, and none has the email ${actor.email}. Add yourself as a contact in GHL with that email, then try again.` };
    to = { contactId: me.id, firstName: me.firstName, email: me.email, phone: me.phone };
  }
  if (channels.email && !to.email) return { ok: false, message: "The GHL contact has no email. Untick email, or add one in GHL." };
  if (channels.text && !to.phone) return { ok: false, message: "The GHL contact has no phone. Untick text, or add one in GHL." };

  // The final request carries the invoice or receipt, refreshed with today's payments.
  let doc: PaymentAsk["doc"] = null;
  if (kind === "final") {
    const base = customerUrl();
    if (!base) return { ok: false, message: "The customer link address (QUOTE_CUSTOMER_URL) isn't set for this deployment." };
    if (!isToken(fresh.customerToken)) return { ok: false, message: "The contract version has no customer link, so the invoice can't be attached." };
    const d = await billingForRequest(fresh.id, actor.email);
    if (typeof d === "string") return { ok: false, message: d };
    doc = { title: d.title, number: d.number, pdfUrl: customerLinks(base, fresh.customerToken, d.file).pdfUrl };
  }

  // The project's PM, cc'd on the email (2026-11-27); not on a test, and not when they are the one sending.
  const pm = await projectPm(link.notionProjectUrl).catch(() => null);
  const cc = live && pm && pm.email !== sender.email.toLowerCase() && channels.email ? pm.email : null;

  const stage = stageFor(kind, plan);
  const ask: PaymentAsk = { kind, due: amount, total: plan.total, paid: plan.paid, pay: stage?.pay ?? null, doc, testFor: live ? null : `${link.displayName ?? ([link.firstName, link.lastName].filter(Boolean).join(" ") || link.quoteNumber || "the customer")}${pm && channels.email ? `, would cc ${pm.name}` : ""}` };
  // The office signs as the company; a person signs with their first name.
  const { sent, failed } = await deliverAsk({ copy, ask, to, sender, asOffice, cc, channels, etransfer });
  if (sent.length === 0) return { ok: false, message: failed.join(" ") || "Nothing went." };

  const r: PaymentRequest = { at: new Date().toISOString(), by: actor.email, as: asWho, cc, kind, amount, email: sent.includes("email"), text: sent.includes("text"), test: !live };
  const notes = [...failed];
  try {
    const q = (await listByIds(T.quotes, [link.quoteRecordId], [QUOTE.paymentRequests]))[0];
    await updateRecord(T.quotes, link.quoteRecordId, { [QUOTE.paymentRequests]: addRequest(str(q?.fields[QUOTE.paymentRequests]), r) });
    await updateRecord(T.versions, fresh.id, authorFields(actor, new Date(), requestLogWhat(r, money), fresh.editLog));
  } catch {
    notes.push("It went, but Airtable didn't record it.");
  }
  return { ok: true, test: !live, amount, sent, warning: notes.join(" ") || null };
}

/** Sends one request's email and text (2026-11-27), from the office or a person; each channel on its own. */
async function deliverAsk(a: { copy: CustomerCopy; ask: PaymentAsk; to: { contactId: string; firstName: string | null }; sender: { email: string; name: string | null }; asOffice: boolean; cc: string | null; channels: { email: boolean; text: boolean }; etransfer: string }): Promise<{ sent: string[]; failed: string[] }> {
  const { copy, ask, to, sender, asOffice, cc, channels, etransfer } = a;
  const from = { email: sender.email, firstName: asOffice ? null : firstNameOf(sender) };
  const sent: string[] = [];
  const failed: string[] = [];
  if (channels.email) {
    const attempts = asOffice ? officeFromAttempts(sender.email) : fromAttempts(from, copy.company.email);
    let last: unknown = attempts.length ? null : new Error(noSenderWords(from.email));
    for (const emailFrom of attempts) {
      try {
        await sendMessage(paymentRequestEmailMessage(copy, ask, to, { etransfer }, from, { emailFrom, cc: cc ? [cc] : [] }));
        last = null;
        break;
      } catch (e) {
        last = e;
      }
    }
    if (last) failed.push(`The email didn't go: ${last instanceof Error ? last.message : String(last)}`);
    else sent.push("email");
  }
  if (channels.text) {
    try {
      // A text goes only from the sender's own GHL number, the office's included (2026-11-05); none means it doesn't go.
      const number = textFromFor(sender.email, await locationUsers().catch(() => []));
      if (!number) throw new Error(noNumberWords(sender.email));
      await sendMessage(fromTheirNumber(paymentRequestSmsMessage(copy, ask, to, { etransfer }, from), number));
      sent.push("text");
    } catch (e) {
      failed.push(`The text didn't go: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { sent, failed };
}

/** Reminders sent in one run, at most. */
const REMINDERS_PER_RUN = 10;

export type ReminderRunResult = { ok: true; sent: number; notes: string[] } | { ok: false; status: number; message: string };

/**
 * The automatic payment reminder (step 2b, Albert 2026-11-27; vault 05_decisions/2026-11-27-quote-payment-request-buttons-
 * and-auto-second). Called hourly by .github/workflows/quote-followups.yml at /api/followups/payments, with the follow-ups'
 * key (QUOTE_FOLLOWUP_KEY, checked first). Rules in `reminderFor()` and `reminderWindow()` (src/lib/projects/request.ts):
 * from the first day on site, the second payment on a plan of 3+ installments, or on a 2-installment plan a reminder that
 * the final is due when the project finishes; once per project; 9 am to 7 pm, Monday to Saturday, Toronto.
 *
 * Always as the office, email and text, the PM cc'd, exactly as the button does. Under the same switch: while "Payment
 * requests go to customers" is off, each goes to the office's own GHL contact, marked Test. Settings' "Automatic payment
 * reminders" turns the run off altogether. Writes only Quotes → Payment Requests and the contract version's history.
 */
export async function runPaymentReminders(key: string | null): Promise<ReminderRunResult> {
  if (!followUpKeyOk(key)) return { ok: false, status: 401, message: "Wrong or missing key." };
  const now = new Date();
  const st = await settings();
  if (!st.autoPaymentReminders) return { ok: true, sent: 0, notes: ["Automatic payment reminders are off (Settings)."] };
  if (!reminderWindow(now)) return { ok: true, sent: 0, notes: ["Outside 9 am to 7 pm, Monday to Saturday (Toronto)."] };
  const office = officeEmail();
  const etransfer = etransferEmail();
  if (!office || !etransfer) return { ok: true, sent: 0, notes: ["The office email or the e-transfer address isn't set, so reminders can't go."] };
  if (!paymentsReaderOn() || !projectStatusOn()) return { ok: true, sent: 0, notes: ["Notion projects or payments aren't readable here."] };
  const live = st.paymentRequestsLive;
  const today = torontoDay(now);

  const quotes = await listRecords(T.quotes, { fields: [QUOTE.notionProjectUrl, QUOTE.paymentRequests, QUOTE.projectNumber, QUOTE.ghlContactId, QUOTE.firstName, QUOTE.lastName, QUOTE.displayName, QUOTE.quoteNumber, QUOTE.contractVersion] });
  const linked = quotes.flatMap((q) => {
    const page = notionPageId(str(q.fields[QUOTE.notionProjectUrl]));
    return page && str(q.fields[QUOTE.projectNumber]) && ids(q.fields[QUOTE.contractVersion])[0] ? [{ q, page }] : [];
  });
  if (linked.length === 0) return { ok: true, sent: 0, notes: ["No won projects linked to Notion."] };
  const oldest = linked.map((l) => l.q.createdTime).sort()[0];
  const back = (days: number) => torontoDay(new Date(Date.parse(oldest) - days * 86_400_000));
  const rows = await projectRowsSince(back(30));
  // Only projects on site or starting can be due a reminder: their payments are read, one project at a time.
  const due = linked.filter(({ page }) => {
    const r = rows.get(page);
    return Boolean(r?.start && r.start <= today && !(r.end && r.end < today));
  });
  const payments = await paymentsForProjects(due.map((l) => l.page));

  // In test the office's own GHL contact receives each one, as a person's own contact does for a button.
  let testTo: { contactId: string; firstName: string | null; email: string | null; phone: string | null } | null = null;
  if (!live) {
    const me = (await searchContacts(office, 8).catch(() => [])).find((x) => (x.email ?? "").trim().toLowerCase() === office);
    if (!me) return { ok: true, sent: 0, notes: [`Reminders are in test (Settings), so they go to the office's own GHL contact, and none has the email ${office}.`] };
    testTo = { contactId: me.id, firstName: me.firstName, email: me.email, phone: me.phone };
  }

  const notes: string[] = [];
  let sent = 0;
  for (const { q, page } of due) {
    if (sent >= REMINDERS_PER_RUN) break;
    const row = rows.get(page);
    if (!row) continue;
    const c = await loadContract(q.id).catch(() => null);
    if (!c) continue;
    const paid = paidTotal(cleanPayments(payments.get(page) ?? []).map((p) => p.amount));
    const plan = planProgress(c.contract.stages.map((x) => ({ label: x.label, when: x.when, pay: x.pay, amount: x.amount })), c.contract.totals.total, paid);
    const list = parseRequests(str(q.fields[QUOTE.paymentRequests]));
    const kind = reminderFor(row, plan, list, today, live);
    if (!kind) continue;
    const name = str(q.fields[QUOTE.displayName]) ?? ([str(q.fields[QUOTE.firstName]), str(q.fields[QUOTE.lastName])].filter(Boolean).join(" ") || str(q.fields[QUOTE.quoteNumber]) || "a customer");
    const contactId = str(q.fields[QUOTE.ghlContactId]);
    if (live && !contactId) {
      notes.push(`${name}: no GHL contact, nothing sent.`);
      continue;
    }
    // The customer's email and phone are GHL's; the contact is read for them, as a refresh would.
    const contact = live ? await getContact(contactId!).catch(() => null) : null;
    const to = live ? (contact ? { contactId: contact.id, firstName: contact.firstName ?? str(q.fields[QUOTE.firstName]), email: contact.email, phone: contact.phone } : null) : testTo;
    if (!to) {
      notes.push(`${name}: the GHL contact couldn't be read, nothing sent.`);
      continue;
    }
    const channels = { email: Boolean(to.email), text: Boolean(to.phone) };
    if (!channels.email && !channels.text) {
      notes.push(`${name}: the contact has no email or phone, nothing sent.`);
      continue;
    }
    const amount = kind === "second" ? plan.secondOwing : plan.balance;
    const stage = kind === "second" ? stageFor("second", plan) : stageFor("final", plan);
    const pm = row.pm;
    const cc = live && pm && pm.email !== office && channels.email ? pm.email : null;
    const copy = contractCopy(c.view);
    const ask: PaymentAsk = { kind, due: amount, total: plan.total, paid: plan.paid, pay: stage?.pay ?? null, doc: null, endsOn: row.end, testFor: live ? null : `${name}${pm && channels.email ? `, would cc ${pm.name}` : ""}` };
    const r = await deliverAsk({ copy, ask, to, sender: { email: office, name: null }, asOffice: true, cc, channels, etransfer });
    if (r.sent.length === 0) {
      notes.push(`${name}: not sent, ${r.failed.join(" ").slice(0, 160)}`);
      continue;
    }
    sent++;
    const entry: PaymentRequest = { at: new Date().toISOString(), by: "app", as: OFFICE, cc, kind, amount, auto: true, email: r.sent.includes("email"), text: r.sent.includes("text"), test: !live };
    try {
      await updateRecord(T.quotes, q.id, { [QUOTE.paymentRequests]: addRequest(str(q.fields[QUOTE.paymentRequests]), entry) });
      const versionId = ids(q.fields[QUOTE.contractVersion])[0];
      const v = (await listByIds(T.versions, [versionId], [VERSION.editLog]))[0];
      await updateRecord(T.versions, versionId, authorFields({ email: "app", name: "Quote app" }, new Date(), requestLogWhat(entry, money), str(v?.fields[VERSION.editLog])));
    } catch {
      notes.push(`${name}: sent, but Airtable didn't record it (it may go again next hour).`);
    }
    notes.push(`${name}: ${kind === "second" ? "second payment" : "final, to have ready"}, ${money(amount)}, by ${r.sent.join(" and ")}${live ? "" : " (test, to the office)"}.`);
  }
  return { ok: true, sent, notes };
}
