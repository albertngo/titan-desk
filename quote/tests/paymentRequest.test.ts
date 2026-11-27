import { describe, expect, it } from "vitest";
import { planProgress } from "@/lib/calc";
import { addRequest, KEEP, lastAsked, parseRequests, requestAmount, requestLogWhat, requestProblem, stageFor, type PaymentRequest } from "@/lib/projects/request";
import { collectGroup, type ProjectStatus } from "@/lib/projects/status";
import { paymentRequestEmailMessage, paymentRequestSmsMessage, type PaymentAsk } from "@/lib/send/plan";
import type { CustomerCopy } from "@/lib/send/copy";

/** Payment requests from All quotes (Albert, 2026-11-27). Invented numbers only. */

const stages = [
  { label: "Deposit", when: "On acceptance", pay: "etransfer" as const, amount: 350 },
  { label: "Second payment", when: "First day on site", pay: "onsite" as const, amount: 350 },
  { label: "Final payment", when: "On completion", pay: "etransfer" as const, amount: 300 },
];
const req = (over: Partial<PaymentRequest> = {}): PaymentRequest => ({ at: "2026-11-20T15:00:00.000Z", by: "staff@example.com", as: null, kind: "final", amount: 300, email: true, text: true, test: false, ...over });
const money = (n: number) => `$${n.toFixed(2)}`;

describe("what a request asks for", () => {
  it("second: every stage but the final still owing; final: the balance", () => {
    const plan = planProgress(stages, 1000, 350);
    expect(requestAmount("second", plan)).toBe(350);
    expect(requestAmount("final", plan)).toBe(650);
    expect(stageFor("second", plan)?.label).toBe("Second payment");
    expect(stageFor("final", plan)?.label).toBe("Final payment");
  });
  it("refuses with plain words when there is nothing to ask, no channel, or no second payment", () => {
    expect(requestProblem("second", planProgress(stages, 1000, 700), { email: true, text: false })).toBe("The second payment is already in.");
    expect(requestProblem("final", planProgress(stages, 1000, 1000), { email: true, text: false })).toBe("Nothing is left to collect.");
    expect(requestProblem("final", planProgress(stages, 1000, 0), { email: false, text: false })).toBe("Pick email, text or both.");
    expect(requestProblem("second", planProgress([stages[0], stages[2]], 1000, 0), { email: true, text: true })).toBe("This contract's payment plan has no second payment.");
    expect(requestProblem("final", null, { email: true, text: true })).toMatch(/couldn't be read/);
    expect(requestProblem("final", planProgress(stages, 1000, 700), { email: true, text: true })).toBeNull();
  });
});

describe("the log on Quotes → Payment Requests", () => {
  it("keeps clean entries only, adds at the end, and keeps the newest", () => {
    expect(parseRequests("not json")).toEqual([]);
    expect(parseRequests(JSON.stringify([req(), { at: 1 }, req({ kind: "nope" as never })]))).toEqual([req()]);
    let raw: string | null = null;
    for (let i = 0; i < KEEP + 3; i++) raw = addRequest(raw, req({ amount: i }));
    const list = parseRequests(raw);
    expect(list).toHaveLength(KEEP);
    expect(list.at(-1)?.amount).toBe(KEEP + 2);
  });
  it("a test never counts as asking the customer", () => {
    expect(lastAsked([req({ test: true })], "final")).toBeNull();
    expect(lastAsked([req({ at: "2026-11-20T00:00:00Z" }), req({ at: "2026-11-21T00:00:00Z", kind: "second" })], "final")?.at).toBe("2026-11-20T00:00:00Z");
  });
  it("says in the history what went, and when it was only a test", () => {
    expect(requestLogWhat(req({ amount: 450 }), money)).toBe("Final payment of $450.00 requested by email and text");
    expect(requestLogWhat(req({ kind: "second", text: false, test: true, amount: 350 }), money)).toBe("Second payment of $350.00 requested by email (test: sent to themselves, not the customer)");
  });
  it("a finished project asked for its final payment sits under Requested, until it is paid", () => {
    const p: ProjectStatus = { start: null, end: "2026-11-20", walkthrough: "Completed", workOrders: [], ready: "Ready to collect", deal: "Invoice", valueApprox: null, pm: null, payments: [] };
    expect(collectGroup(p, planProgress(stages, 1000, 700), true)).toBe("requested");
    expect(collectGroup(p, planProgress(stages, 1000, 1000), true)).toBe("paid");
  });
});

describe("the email and the text", () => {
  const copy = { quoteNumber: "Q-1000", company: { name: "Example Floors", email: "office@example.com", address: null, phone: null, website: null } } as unknown as CustomerCopy;
  const ask = (over: Partial<PaymentAsk> = {}): PaymentAsk => ({ kind: "second", due: 350, total: 1000, paid: 350, pay: "etransfer", doc: null, testFor: null, ...over });
  const to = { contactId: "c1", firstName: "Jane" };
  it("the second-payment text says the amount and how to pay it, in plain characters", () => {
    const m = paymentRequestSmsMessage(copy, ask(), to, { etransfer: "pay@example.com" }, { email: "sam@example.com", firstName: "Sam" });
    expect(m.type).toBe("SMS");
    const text = m.type === "SMS" ? m.message : "";
    expect(text).toContain("second payment of $350.00 is due now");
    expect(text).toContain("e-transfer to pay@example.com");
    expect(text).toMatch(/^Hi Jane, it's Sam from Example Floors\./);
    expect(text).not.toMatch(/[^\x20-\x7e\n]/);
  });
  it("the final email attaches the invoice, and a test is marked in the subject and the text", () => {
    const doc = { title: "Invoice" as const, number: "INV-1", pdfUrl: "https://example.com/c/t/Invoice-INV-1.pdf" };
    const e = paymentRequestEmailMessage(copy, ask({ kind: "final", due: 650, doc, testFor: "Jane Doe" }), to, { etransfer: "pay@example.com" });
    expect(e.type).toBe("Email");
    if (e.type !== "Email") return;
    expect(e.subject).toBe("[Test for Jane Doe] Your final payment for Q-1000, Example Floors");
    expect(e.attachments).toEqual([doc.pdfUrl]);
    expect(e.html).toContain("The balance of $650.00 is now due.");
    const s = paymentRequestSmsMessage(copy, ask({ kind: "final", due: 650, doc, testFor: "Jane Doe" }), to, { etransfer: "pay@example.com" });
    expect(s.type === "SMS" && s.message.startsWith("[Test for Jane Doe] ")).toBe(true);
    expect(s.type === "SMS" && s.message.endsWith(doc.pdfUrl)).toBe(true);
  });
  it("a second-payment email carries no attachment", () => {
    const e = paymentRequestEmailMessage(copy, ask({ pay: "onsite" }), to, { etransfer: "pay@example.com" });
    expect(e.type === "Email" && e.attachments).toBeFalsy();
    expect(e.type === "Email" && e.html).toContain("Hand it to your project manager on site.");
  });
});

describe("as the office, cc'ing the PM (Albert, 2026-11-27: \"default is office, cc'd the PM\")", () => {
  it("the office sends as the company, named then bare, and only from a real address", async () => {
    const { officeFromAttempts } = await import("@/lib/send/plan");
    expect(officeFromAttempts("Office@Example.com")).toEqual(["Titan Flooring <office@example.com>", "office@example.com"]);
    expect(officeFromAttempts(null)).toEqual([]);
    expect(officeFromAttempts("not an email")).toEqual([]);
  });
  it("the email carries the PM in its cc, and nothing that isn't an email", () => {
    const copy = { quoteNumber: "Q-1000", company: { name: "Example Floors", email: "office@example.com", address: null } } as unknown as CustomerCopy;
    const ask: PaymentAsk = { kind: "final", due: 300, total: 1000, paid: 700, pay: "etransfer", doc: null, testFor: null };
    const e = paymentRequestEmailMessage(copy, ask, { contactId: "c1", firstName: null }, { etransfer: "pay@example.com" }, null, { emailFrom: "office@example.com", cc: ["pm@example.com", "nope"] });
    expect(e.type === "Email" && e.emailCc).toEqual(["pm@example.com"]);
    const none = paymentRequestEmailMessage(copy, ask, { contactId: "c1", firstName: null }, { etransfer: "pay@example.com" });
    expect(none.type === "Email" && "emailCc" in none).toBe(false);
  });
  it("the PM is the first Project Manager on the Titan Team with an email", async () => {
    const { pmFor } = await import("@/lib/projects/status");
    const team = [{ name: "Pat", email: "Pat@Example.com", userIds: ["u1"] }, { name: "Sam", email: null, userIds: ["u2"] }];
    expect(pmFor(["u2", "u1"], team)).toEqual({ name: "Pat", email: "pat@example.com" });
    expect(pmFor(["u2"], team)).toBeNull();
    expect(pmFor([], team)).toBeNull();
  });
  it("the history says it went as the office and who was cc'd", () => {
    expect(requestLogWhat(req({ as: "office", cc: "pm@example.com", amount: 300 }), money)).toBe("Final payment of $300.00 requested by email and text, as the office, cc pm@example.com");
  });
});

describe("the automatic reminder (Albert, 2026-11-27, step 2b)", () => {
  const today = "2026-11-27";
  const three = [stages[0], stages[1], stages[2]];
  const two = [{ label: "Deposit", when: "", pay: "etransfer" as const, amount: 500 }, { label: "Final payment", when: "", pay: "etransfer" as const, amount: 500 }];
  it("3+ installments: the second payment from the first day on site, one-day jobs included", async () => {
    const { reminderFor } = await import("@/lib/projects/request");
    expect(reminderFor({ start: today, end: today }, planProgress(three, 1000, 350), [], today, true)).toBe("second");
    expect(reminderFor({ start: "2026-11-25", end: null }, planProgress(three, 1000, 350), [], today, true)).toBe("second");
    expect(reminderFor({ start: "2026-11-28", end: null }, planProgress(three, 1000, 350), [], today, true)).toBeNull();
    expect(reminderFor({ start: "2026-11-20", end: "2026-11-26" }, planProgress(three, 1000, 350), [], today, true)).toBeNull();
    expect(reminderFor({ start: today, end: null }, planProgress(three, 1000, 700), [], today, true)).toBeNull();
  });
  it("2 installments: the final to have ready, once the deposit is in", async () => {
    const { reminderFor } = await import("@/lib/projects/request");
    expect(reminderFor({ start: today, end: today }, planProgress(two, 1000, 500), [], today, true)).toBe("ready");
    expect(reminderFor({ start: today, end: today }, planProgress(two, 1000, 0), [], today, true)).toBeNull();
    expect(reminderFor({ start: today, end: today }, planProgress(two, 1000, 1000), [], today, true)).toBeNull();
    expect(reminderFor({ start: today, end: null }, planProgress([], 1000, 0), [], today, true)).toBeNull();
  });
  it("once per project: a live one after any live ask, a test one after its own test", async () => {
    const { reminderFor } = await import("@/lib/projects/request");
    const plan = planProgress(three, 1000, 350);
    expect(reminderFor({ start: today, end: null }, plan, [req({ kind: "second" })], today, true)).toBeNull();
    expect(reminderFor({ start: today, end: null }, plan, [req({ kind: "second", test: true })], today, true)).toBe("second");
    expect(reminderFor({ start: today, end: null }, plan, [req({ kind: "second", test: true })], today, false)).toBe("second");
    expect(reminderFor({ start: today, end: null }, plan, [req({ kind: "second", test: true, auto: true })], today, false)).toBeNull();
  });
  it("goes 9 am to 7 pm, Monday to Saturday, Toronto", async () => {
    const { reminderWindow } = await import("@/lib/projects/request");
    expect(reminderWindow(new Date("2026-11-27T14:30:00Z"))).toBe(true); // Friday 9:30 am
    expect(reminderWindow(new Date("2026-11-27T13:30:00Z"))).toBe(false); // 8:30 am
    expect(reminderWindow(new Date("2026-11-28T00:30:00Z"))).toBe(false); // Friday 7:30 pm
    expect(reminderWindow(new Date("2026-11-29T15:00:00Z"))).toBe(false); // Sunday
  });
  it("the 2-installment reminder says it isn't due yet, and when we expect to finish", () => {
    const copy = { quoteNumber: "Q-1000", company: { name: "Example Floors", email: "office@example.com", address: null } } as unknown as CustomerCopy;
    const ask: PaymentAsk = { kind: "ready", due: 500, total: 1000, paid: 500, pay: "etransfer", doc: null, endsOn: "2026-11-28", testFor: null };
    const s = paymentRequestSmsMessage(copy, ask, { contactId: "c1", firstName: "Jane" }, { etransfer: "pay@example.com" });
    const text = s.type === "SMS" ? s.message : "";
    expect(text).toContain("final payment of $500.00 will be due when we finish");
    expect(text).toContain("Nothing is due today");
    const e = paymentRequestEmailMessage(copy, ask, { contactId: "c1", firstName: "Jane" }, { etransfer: "pay@example.com" });
    expect(e.type === "Email" && e.subject).toBe("Your final payment for Q-1000, Example Floors: due when we finish");
    expect(e.type === "Email" && e.html).toContain("Due when we finish");
  });
  it("the history marks it automatic", () => {
    expect(requestLogWhat(req({ kind: "ready", as: "office", auto: true, amount: 500 }), money)).toBe("Reminder to have the final payment of $500.00 ready, by email and text, as the office (automatic)");
    expect(requestLogWhat(req({ kind: "second", as: "office", auto: true, test: true, amount: 350, text: false }), money)).toBe("Second payment of $350.00 requested by email, as the office (automatic) (test: sent to the office, not the customer)");
  });
});
