import "server-only";
import { customerUrl, etransferEmail } from "@/lib/accept/settings";
import { listByIds, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { paidTotal, planProgress } from "@/lib/calc";
import { locationUsers, searchContacts } from "@/lib/ghl/client";
import { sendMessage } from "@/lib/make/client";
import { paymentsReaderOn, projectPayments } from "@/lib/notion/payments";
import { addRequest, requestAmount, requestLogWhat, requestProblem, stageFor, type PaymentRequest, type RequestKind } from "@/lib/projects/request";
import { cleanPayments, contractCopy } from "@/lib/billing/doc";
import { requireQuoterPerson } from "@/lib/auth";
import { money } from "@/lib/format";
import { settings } from "@/lib/settings/settings";
import { customerLinks, fromAttempts, fromTheirNumber, isToken, noSenderWords, paymentRequestEmailMessage, paymentRequestSmsMessage, textFromFor, type PaymentAsk } from "@/lib/send/plan";
import { billingForRequest } from "./billing";
import { loadContract } from "./contract";
import { authorFields, firstNameOf } from "./history";
import { getQuote } from "./load";
import { refreshFromGhl } from "./refresh";
import { pickSender } from "./send";
import { str } from "./values";

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

export type RequestInput = { kind: RequestKind; email: boolean; text: boolean; as?: string | null };
export type RequestResult = { ok: true; test: boolean; amount: number; sent: string[]; warning: string | null } | { ok: false; message: string };

export async function requestPayment(versionId: string, input: RequestInput): Promise<RequestResult> {
  const actor = await requireQuoterPerson();
  const kind: RequestKind = input.kind === "second" ? "second" : "final";
  const channels = { email: input.email === true, text: input.text === true };
  const picked = await pickSender(input.as ?? null);
  if (!picked.ok) return { ok: false, message: picked.message };
  const sender = picked.sender;
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

  const stage = stageFor(kind, plan);
  const ask: PaymentAsk = { kind, due: amount, total: plan.total, paid: plan.paid, pay: stage?.pay ?? null, doc, testFor: live ? null : (link.displayName ?? ([link.firstName, link.lastName].filter(Boolean).join(" ") || link.quoteNumber || "the customer")) };
  const from = { email: sender.email, firstName: firstNameOf(sender) };
  const sent: string[] = [];
  const failed: string[] = [];
  if (channels.email) {
    const attempts = fromAttempts(from, copy.company.email);
    let last: unknown = attempts.length ? null : new Error(noSenderWords(from.email));
    for (const emailFrom of attempts) {
      try {
        await sendMessage(paymentRequestEmailMessage(copy, ask, to, { etransfer }, from, { emailFrom }));
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
      const number = textFromFor(sender.email, await locationUsers().catch(() => []));
      await sendMessage(fromTheirNumber(paymentRequestSmsMessage(copy, ask, to, { etransfer }, from), number));
      sent.push("text");
    } catch (e) {
      failed.push(`The text didn't go: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (sent.length === 0) return { ok: false, message: failed.join(" ") || "Nothing went." };

  const r: PaymentRequest = { at: new Date().toISOString(), by: actor.email, as: picked.as ? sender.email : null, kind, amount, email: sent.includes("email"), text: sent.includes("text"), test: !live };
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
