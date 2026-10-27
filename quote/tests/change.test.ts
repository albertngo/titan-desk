import { describe, expect, it } from "vitest";
import { notAcceptable } from "../src/lib/accept/plan";
import { optionTotals, stageAmounts } from "../src/lib/calc";
import { changeSummary, changeWords, diffOptions, itemDifference, signedMoney } from "../src/lib/change/diff";
import { money } from "../src/lib/format";
import { fixedSchedule, scheduleProblems } from "../src/lib/pricing/schedule";
import type { Quote, QuoteLine, QuoteOption } from "../src/lib/quotes/types";
import { customerCopy, type CustomerCopy, type Letterhead } from "../src/lib/send/copy";
import { quotePdf } from "../src/lib/send/pdf";
import { changeEmailMessage, changeSmsMessage, sendProblems } from "../src/lib/send/plan";

/* Invented numbers and people only (quote/CLAUDE.md rule 4). */

let seq = 0;
const line = (p: Partial<QuoteLine>): QuoteLine => ({
  id: `recLINE${String(++seq).padStart(10, "0")}`,
  lineType: "Install",
  section: "Install",
  include: true,
  qty: 100,
  waste: null,
  unitPrice: null,
  unitPriceSnap: 10,
  unitCostSnap: 5,
  costOverride: null,
  manualCost: null,
  minChargeSnap: null,
  hasSource: true,
  sourceKind: "rate",
  sourceId: "recRATE0000000001",
  labourType: "Click install",
  spec: "Standard",
  description: "Click install",
  area: null,
  uom: "sqft",
  contractor: "Crew Alpha",
  clientNote: null,
  sortOrder: seq,
  airtableTotal: null,
  airtableCost: null,
  ...p,
});
const option = (lines: QuoteLine[]): QuoteOption => ({ id: "recOPTOAK00000000", name: "Oak", description: null, sortOrder: 1, recommended: false, serviceLevel: null, crew: null, lines, airtable: { ...optionTotals(lines, 0, true) } });
const quote = (lines: QuoteLine[], p: Partial<Quote> = {}): Quote => ({
  id: "recVERSION0000002",
  quoteId: "Q-9001 v3",
  version: 3,
  status: "Draft",
  basis: "Measured",
  showHst: true,
  itemised: true,
  discountRate: 0,
  validUntil: null,
  sentAt: null,
  sendBlock: null,
  customerToken: null,
  sentBy: null,
  sentTo: null,
  notes: null,
  customerName: "Sam Sample",
  siteAddress: "1 Sample Street",
  siteCity: "Testville",
  link: {
    quoteRecordId: "recQUOTE000000001",
    quoteNumber: "Q-9001",
    displayName: null,
    firstName: "Sam",
    lastName: "Sample",
    phone: "+15550000000",
    email: "sam@example.com",
    addressStatus: "Confirmed",
    linkStatus: "Linked",
    projectTiming: null,
    ghlContactId: "ctc0000001",
    ghlOpportunityId: "opp0000001",
    folderUrl: null,
    companyCamUrl: null,
    projectNumber: "PP-1",
    notionProjectUrl: null,
    contractVersionId: "recVERSION0000001",
  },
  options: [option(lines)],
  legacyLineCount: 0,
  changeNo: 1,
  ...p,
});
const COMPANY: Letterhead = { name: "Titan Flooring", address: null, phone: null, email: "hello@example.com", website: null, hstNumber: null };
const at = { sentOn: "2026-11-10", validUntil: null, company: COMPANY };

const install = line({}); // 100 sf × 10 = 1,000
const stairs = line({ section: "Stairs", lineType: "Stairs", description: "Sand and stain steps", qty: 12, uom: "each", unitPriceSnap: 50 }); // 600
const baseRemoval = line({ section: "Removal", lineType: "Removal", description: "Baseboard removal", qty: 120, uom: "linear ft", unitPriceSnap: 1 }); // 120

const before = customerCopy(quote([install, stairs, baseRemoval], { changeNo: null }), at).options[0];
const after = customerCopy(quote([{ ...install, qty: 107 }, { ...stairs, qty: 14 }]), at).options[0];

describe("what changed", () => {
  it("finds added, removed and changed lines by section and wording", () => {
    const items = diffOptions(before, after);
    expect(items.map((i) => i.kind).sort()).toEqual(["changed", "changed", "removed"]);
    expect(items.map(changeWords)).toEqual(["Changed: Click install, 100 sqft to 107 sqft", "Changed: Sand and stain steps, 12 each to 14 each", "Removed: Baseboard removal"]);
    expect(items.map(itemDifference)).toEqual([70, 100, -120]);
  });

  it("a line added under a new name is added; nothing changed is nothing", () => {
    const more = customerCopy(quote([install, stairs, baseRemoval, line({ section: "Other", description: "Move the piano", qty: 1, uom: "flat", unitPriceSnap: 150 })]), at).options[0];
    expect(diffOptions(before, more).map(changeWords)).toEqual(["Added: Move the piano, 1 flat"]);
    expect(diffOptions(before, before)).toEqual([]);
  });

  it("the summary carries the difference before HST and the contract it was measured against", () => {
    const c = changeSummary(1, "2026-11-03", before, after);
    expect(c.difference).toBe(50); // 1,720 → 1,770
    expect(c.before.total).toBe(before.totals.total);
    expect(c.sinceOn).toBe("2026-11-03");
    expect(signedMoney(c.difference, money)).toBe("+$50.00");
    expect(signedMoney(-120, money)).toBe("−$120.00");
    expect(signedMoney(0, money)).toBe("no change");
  });
});

describe("the change's payment schedule", () => {
  const agreed = [
    { label: "Deposit", when: "On acceptance", pay: "etransfer" as const, amount: 600 },
    { label: "Second payment", when: "On the first day of work", pay: null, amount: 600 },
    { label: "Final payment", when: "Within 48 hours of completion", pay: null, amount: 520 },
  ];

  it("keeps every agreed stage's dollars and puts the difference on the final payment", () => {
    const s = fixedSchedule(agreed);
    expect(scheduleProblems(s)).toEqual([]);
    expect(stageAmounts(s, [], 0, true, 1720 + 300).map((x) => x.amount)).toEqual([600, 600, 820]);
    expect(stageAmounts(s, [], 0, true, 1720 - 100).map((x) => x.amount)).toEqual([600, 600, 420]);
  });

  it("a credit bigger than the final payment is caught before sending", () => {
    const q = quote([line({ qty: 10 })], { schedule: fixedSchedule(agreed) });
    const problems = sendProblems(q, { base: "b", validUntil: null, channels: { email: true, sms: false } }, { today: "2026-11-10", fingerprint: "b" });
    expect(problems.join(" ")).toMatch(/final payment would be less than nothing/);
  });
});

describe("sending a change", () => {
  it("needs no good-until date, and only one option", () => {
    const ok = sendProblems(quote([install]), { base: "b", validUntil: null, channels: { email: true, sms: true } }, { today: "2026-11-10", fingerprint: "b" });
    expect(ok).toEqual([]);
    const two = quote([install], { options: [option([install]), { ...option([stairs]), id: "recOPTVINYL000000", name: "Vinyl" }] });
    expect(sendProblems(two, { base: "b", validUntil: null, channels: { email: true, sms: false } }, { today: "2026-11-10", fingerprint: "b" }).join(" ")).toMatch(/one option/);
  });

  it("can never be accepted: it is sent for the record", () => {
    const copy: CustomerCopy = { ...customerCopy(quote([install]), at), change: changeSummary(1, "2026-11-03", before, after) };
    expect(notAcceptable(copy, "open", { version: "2.2", title: "x", file: "x.pdf" })).toMatch(/nothing to accept/);
  });

  const copy: CustomerCopy = { ...customerCopy(quote([{ ...install, qty: 107 }, { ...stairs, qty: 14 }]), at), change: changeSummary(1, "2026-11-03", before, after) };
  const to = { contactId: "c", firstName: "Sam", link: "https://quote.example/c/x", pdfUrl: "https://quote.example/c/x/q.pdf" };

  it("the email says it is the record of what was agreed, with what changed and the new total, and asks for nothing", () => {
    const m = changeEmailMessage(copy, to, { email: "pat.quoter@example.com", firstName: "Pat" });
    if (m.type !== "Email") throw new Error("expected an email");
    expect(m.subject).toBe("Your updated quote Q-9001 (change 1) from Titan Flooring");
    expect(m.html).toContain("As we discussed, here is what changed since November 3, 2026.");
    expect(m.html).toContain("Changed: Click install, 100 sqft to 107 sqft");
    expect(m.html).toContain("Removed: Baseboard removal");
    expect(m.html).toContain("+$50.00");
    expect(m.html).toContain("The difference is on the final payment.");
    // Nothing to do: no Accept or approve button, no deadline. (The deposit stage still says it was due "on acceptance".)
    expect(m.html).not.toMatch(/press Accept|approve|good until|View and accept/i);
  });

  it("the text gives the new total and the link, in GSM-7", () => {
    const m = changeSmsMessage(copy, to, { email: "pat.quoter@example.com", firstName: "Pat" });
    if (m.type !== "SMS") throw new Error("expected a text");
    expect(m.message).toContain("here is your updated quote Q-9001 (change 1)");
    expect(m.message).toContain(to.link);
    expect(m.message).toMatch(/^[\x20-\x7e\n]+$/);
  });

  it("the PDF opens with what changed", () => {
    const pdf = new TextDecoder("latin1").decode(quotePdf(copy));
    expect(pdf).toContain("UPDATED QUOTE, CHANGE 1: WHAT CHANGED SINCE NOVEMBER 3, 2026");
    expect(pdf).toContain("Removed: Baseboard removal");
  });
});
