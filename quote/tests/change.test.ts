import { describe, expect, it } from "vitest";
import { acceptedCopy, acceptProblems, buildAcceptance, dueNow, notAcceptable, picksOf, type AcceptInput } from "../src/lib/accept/plan";
import { optionTotals, round2, stageAmounts } from "../src/lib/calc";
import { fromAcceptance } from "../src/lib/contract/model";
import { changeSummary, changeWords, diffOptions, itemDifference, signedMoney } from "../src/lib/change/diff";
import { swapMatches, swapOption, swapPreview, swapSource } from "../src/lib/change/swap";
import type { EditorLine, EditorOption, EditorQuote } from "../src/lib/editor/model";
import { money } from "../src/lib/format";
import { fixedSchedule, restagedSchedule, scheduleProblems } from "../src/lib/pricing/schedule";
import type { Quote, QuoteLine, QuoteOption } from "../src/lib/quotes/types";
import { customerCopy, isAddition, offersOf, pickKey, type CustomerCopy, type Letterhead } from "../src/lib/send/copy";
import { quotePdf } from "../src/lib/send/pdf";
import { acceptedEmailMessage, acceptedSmsMessage, changeEmailMessage, changeSmsMessage, dueWords, sendProblems } from "../src/lib/send/plan";

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
const COMPANY: Letterhead = { name: "Titan Flooring", address: null, phone: null, email: "hello@example.com", website: null };
const at = { sentOn: "2026-11-10", validUntil: null, company: COMPANY };

const install = line({}); // 100 sf × 10 = 1,000
const stairs = line({ section: "Stairs", lineType: "Stairs", description: "Sand and stain steps", qty: 12, uom: "each", unitPriceSnap: 50 }); // 600
const baseRemoval = line({ section: "Removal", lineType: "Removal", description: "Baseboard removal", qty: 120, uom: "linear ft", unitPriceSnap: 1 }); // 120

const before = customerCopy(quote([install, stairs, baseRemoval], { changeNo: null }), at).options[0];
const after = customerCopy(quote([{ ...install, qty: 107 }, { ...stairs, qty: 14 }]), at).options[0];

describe("what changed", () => {
  it("finds added, removed and changed lines by section and wording", () => {
    const items = diffOptions(before, after);
    // Stairs are one price even on a breakdown (2026-10-28): their count isn't shown, so it isn't listed as a change.
    expect(items.map((i) => i.kind).sort()).toEqual(["changed", "removed"]);
    expect(items.map(changeWords)).toEqual(["Changed: Click install, 100 sqft to 107 sqft", "Removed: Baseboard removal"]);
    expect(items.map(itemDifference)).toEqual([70, -120]);
  });

  it("an add-on the customer ticked, now an ordinary line, is not a change because a lump sum hides its quantity", () => {
    const lump = (ls: QuoteLine[]) => customerCopy(quote(ls, { itemised: false }), at).options[0];
    const extra = line({ section: "Other", description: "Quarter-round", qty: 210, uom: "linear ft", unitPriceSnap: 2.5 });
    const shownAsAddOn = lump([install, { ...extra, include: false }]);
    // As accepted: the add-on's line carries its quantity and price; in the change it is counted, so a lump sum shows neither.
    const accepted = { ...shownAsAddOn, sections: shownAsAddOn.sections.map((s) => ({ ...s, lines: s.lines.map((l) => (l.kind === "item" && l.optional ? { ...l, optional: false, added: true } : l)) })) };
    expect(diffOptions(accepted, lump([install, extra]))).toEqual([]);
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

  it("since 2026-10-30, restages the contract's schedule on the new total: shares stay shares, the last is the balance", () => {
    const s = restagedSchedule([
      { label: "Deposit", when: "On acceptance", pay: "etransfer", kind: "share", pct: 35, amount: 700 },
      { label: "Second payment", when: "First day", pay: null, kind: "share", pct: 35, amount: 700 },
      { label: "Final payment", when: "Completion", pay: null, kind: "balance", pct: null, amount: 600 },
    ]);
    expect(s.stages.map((x) => x.part)).toEqual([{ kind: "share", pct: 35 }, { kind: "share", pct: 35 }, { kind: "balance" }]);
    const m = restagedSchedule([
      { label: "Deposit", when: "x", pay: "etransfer", kind: "materials", pct: null, amount: 900 },
      { label: "Fixed", when: "y", pay: null, kind: "amount", pct: null, amount: 250 },
      { label: "Final payment", when: "z", pay: "onsite", kind: "share", pct: 50, amount: 1 },
    ]);
    expect(m.stages.map((x) => x.part)).toEqual([{ kind: "materials" }, { kind: "amount", amount: 250 }, { kind: "balance" }]);
  });

  it("a credit bigger than the final payment is caught before sending", () => {
    const q = quote([line({ qty: 10 })], { schedule: fixedSchedule(agreed) });
    const problems = sendProblems(q, { base: "b", validUntil: null, channels: { email: true, sms: false } }, { today: "2026-11-10", fingerprint: "b" });
    expect(problems.join(" ")).toMatch(/final payment would be less than nothing/);
  });
});

describe("sending a change", () => {
  it("needs no good-until date; any option after the first is new work offered for a Part the contract doesn't cover", () => {
    const ok = sendProblems(quote([install]), { base: "b", validUntil: null, channels: { email: true, sms: true } }, { today: "2026-11-10", fingerprint: "b" });
    expect(ok).toEqual([]);
    const send = (q: ReturnType<typeof quote>, parts: string[], ids: string[] | null = null) =>
      sendProblems(q, { base: "b", validUntil: null, channels: { email: true, sms: false }, optionIds: ids }, { today: "2026-11-10", fingerprint: "b", contractParts: parts }).join(" ");
    const two = quote([install], { options: [option([install]), { ...option([stairs]), id: "recOPTVINYL000000", name: "Vinyl" }] });
    // No Part (2026-10-31): an addition on its own, never refused for that.
    expect(send(two, ["Flooring"])).toBe("");
    const basement = quote([install], { options: [option([install]), { ...option([install]), id: "recOPTBASE0000000", name: "Basement vinyl", part: "Basement" }] });
    expect(send(basement, ["Flooring"])).toBe("");
    expect(send(basement, ["Upstairs", "Basement"])).toMatch(/already has/);
    // The project as agreed always goes with a change.
    expect(send(basement, ["Flooring"], ["recOPTBASE0000000"])).toMatch(/always goes with a change/);
  });

  it("can never be accepted: it is sent for the record", () => {
    const copy: CustomerCopy = { ...customerCopy(quote([install]), at), change: changeSummary(1, "2026-11-03", before, after) };
    expect(notAcceptable(copy, "open", { id: "recTermsAAAAAAAAA", on: "2026-10-27" })).toMatch(/nothing to accept/);
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
    expect(m.html).toContain("The payment schedule is worked out on the new total; what you&rsquo;ve already paid counts toward it.");
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

/* ---------- Swap option on a change (2026-10-30) ---------- */


const eline = (p: Partial<EditorLine>): EditorLine => ({
  id: `recELINE${String(++seq).padStart(9, "0")}`,
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
  contractor: "Crew Alpha",
  area: "",
  uom: "sqft",
  clientNote: "",
  ...p,
});
const stair = (description: string, qty: number, price: number): Partial<EditorLine> => ({ section: "Stairs", lineType: "Stairs", sourceKind: "stair", description, qty, unitPriceSnap: price, uom: "piece" });
const eopt = (id: string, name: string, lines: EditorLine[], p: Partial<EditorOption> = {}): EditorOption => ({ id, name, description: `${name} description`, recommended: false, serviceLevel: "Standard", crew: null, lines, ...p });
const equote = (options: EditorOption[]): EditorQuote => ({
  quoteRecordId: "recQUOTE000000001",
  customerName: "Pat Example",
  siteAddress: "",
  siteCity: "",
  ghlContactId: null,
  ghlOpportunityId: null,
  addressStatus: null,
  projectNumber: null,
  notionProjectUrl: null,
  discountRate: 0,
  showHst: true,
  options,
});

describe("Swap option on a change", () => {
  const floor = eopt("recOPTFLOOR", "Vinyl flooring", [eline({ description: "Click install", qty: 500 })], { scope: "Flooring" });
  const capsA = eopt("recOPTCAPS", "New oak caps", [eline(stair("Step", 12, 200)), eline(stair("Riser", 13, 15))], { scope: "Stairs" });
  const treadsB = eopt("recOPTTREAD", "Vinyl treads", [eline(stair("Vinyl tread", 12, 90)), eline(stair("Stair nosing", 12, 20)), eline({ ...stair("Paint risers", 13, 10), include: false })], { scope: "Stairs" });
  const refinishC = eopt("recOPTSAND", "Sand and stain", [eline({ ...stair("Sand and stain", 12, 120), include: false })], { scope: "Stairs" });
  const accepted = equote([floor, capsA, treadsB, refinishC]);

  it("offers only the accepted version's options of the same scope, with included lines only", () => {
    const s = swapSource(accepted, ["recOPTFLOOR", "recOPTCAPS"], 4)!;
    expect(s.version).toBe(4);
    // No other flooring option: the flooring pick has nothing to swap, so it is left out.
    expect(s.picks.map((p) => p.name)).toEqual(["New oak caps"]);
    // Sand and stain has no included line, so it isn't offered; Vinyl treads loses its add-on.
    expect(s.picks[0].candidates.map((c) => c.name)).toEqual(["Vinyl treads"]);
    expect(s.picks[0].candidates[0].lines.map((l) => l.description)).toEqual(["Vinyl tread", "Stair nosing"]);
    expect(swapSource(accepted, ["recOPTFLOOR"], 4)).toBeNull();
  });

  it("since one working quote, also offers the same Part from other versions, each once, saying where it is", () => {
    const v6 = equote([
      eopt("recV6CAPS", "New oak caps", capsA.lines, { scope: "Stairs" }), // the pick itself, copied forward: not offered
      eopt("recV6TREAD", "Vinyl treads", treadsB.lines, { scope: "Stairs" }), // the same as the accepted version's: once
      eopt("recV6MAPLE", "Maple caps", [eline(stair("Step", 12, 240))], { scope: "Stairs" }),
      eopt("recV6BASE", "Basement vinyl", [eline({ description: "Click install", qty: 300 })], { part: "Basement" }),
    ]);
    const s = swapSource(accepted, ["recOPTFLOOR", "recOPTCAPS"], 4, [{ version: 6, quote: v6 }])!;
    expect(s.picks.map((p) => [p.name, p.part])).toEqual([["New oak caps", "Stairs"]]);
    expect(s.picks[0].candidates.map((c) => [c.name, c.from])).toEqual([["Vinyl treads", null], ["Maple caps", 6]]);
  });

  it("matches by Part: an upstairs pick is offered upstairs options, not the basement's", () => {
    const up = eopt("recOPTUP", "Oak upstairs", [eline({ description: "Click install", qty: 400 })], { part: "Upstairs" });
    const q = equote([up, eopt("recOPTUP2", "Vinyl upstairs", [eline({ description: "Click install", qty: 400, unitPriceSnap: 4 })], { part: "Upstairs" }), eopt("recOPTB", "Vinyl basement", [eline({ description: "Click install", qty: 200 })], { part: "Basement" })]);
    expect(swapSource(q, ["recOPTUP"], 2)!.picks[0].candidates.map((c) => c.name)).toEqual(["Vinyl upstairs"]);
  });

  it("finds the lines that came from the replaced pick, one for one, and leaves edited ones to the person", () => {
    const change = [eline({ description: "Click install" }), eline(stair("Step", 12, 200)), eline(stair("riser ", 14, 15)), eline(stair("Step", 1, 200)), eline(stair("Spindle", 30, 30))];
    const ids = swapMatches(change, capsA.lines);
    // "riser " matches by wording whatever its quantity; only one Step matches the one Step quoted; Spindle is new.
    expect(ids).toEqual([change[1].id, change[2].id]);
  });

  it("swaps the lines in place on a joined option, keeping the other scope, and renames what still says the old pick", () => {
    const joined = eopt("recCHANGEOPT", "Vinyl flooring + New oak caps", [eline({ description: "Click install", qty: 500 }), eline(stair("Step", 12, 200)), eline(stair("Riser", 13, 15)), eline({ section: "Other", lineType: "Other", description: "Haul away" })], {
      description: "Vinyl flooring description\n\nNew oak caps description",
      serviceLevel: "Premium",
    });
    const q = equote([joined]);
    const out = swapMatches(joined.lines, capsA.lines);
    const next = swapOption(q, "recCHANGEOPT", out, swapSource(accepted, ["recOPTFLOOR", "recOPTCAPS"], 4)!.picks[0].candidates[0], { name: capsA.name, description: capsA.description });
    const o = next.options[0];
    expect(o.lines.map((l) => l.description)).toEqual(["Click install", "Vinyl tread", "Stair nosing", "Haul away"]);
    expect(o.name).toBe("Vinyl flooring + Vinyl treads");
    expect(o.description).toBe("Vinyl flooring description\n\nVinyl treads description");
    expect(o.serviceLevel).toBe("Premium");
    // New lines, so the save creates them on the change and never touches the accepted version's records.
    const quotedIds = new Set(treadsB.lines.map((l) => l.id));
    expect(o.lines.some((l) => quotedIds.has(l.id))).toBe(false);
    // Prices come in as quoted.
    expect(o.lines[1]).toMatchObject({ qty: 12, unitPriceSnap: 90 });
    // The original quote is untouched.
    expect(q.options[0].lines).toHaveLength(4);
  });

  it("takes the incoming option's name and settings when every line is replaced", () => {
    const only = eopt("recCHANGEOPT", "New oak caps", capsA.lines.map((l) => ({ ...l, id: `${l.id}x` })), { serviceLevel: "Premium", crew: "Crew Alpha" });
    const incoming = { ...treadsB, lines: treadsB.lines.filter((l) => l.include), serviceLevel: "Standard" as const, crew: "Crew Beta" };
    const next = swapOption(equote([only]), "recCHANGEOPT", only.lines.map((l) => l.id), incoming, { name: capsA.name, description: capsA.description });
    expect(next.options[0]).toMatchObject({ id: "recCHANGEOPT", name: "Vinyl treads", description: "Vinyl treads description", serviceLevel: "Standard", crew: "Crew Beta", scope: "Stairs" });
    expect(next.options[0].lines).toHaveLength(2);
  });

  it("says when the final payment would go below nothing on the agreed stages", () => {
    // Agreed: $2,000 and $2,000 already fixed; the swap brings the total well under that.
    const q = { ...equote([eopt("recCHANGEOPT", "Vinyl treads", [eline(stair("Vinyl tread", 10, 100))])]), schedule: fixedSchedule([
      { label: "Deposit", when: "", pay: null, amount: 2000 },
      { label: "Second payment", when: "", pay: null, amount: 2000 },
      { label: "Final payment", when: "", pay: null, amount: null },
    ]) };
    const p = swapPreview(q, "recCHANGEOPT");
    expect(p.total).toBeCloseTo(1130, 2);
    expect(p.problems[0]).toMatch(/final payment would be less than nothing/);
  });
});

/* New work added to an accepted project (Albert, 2026-10-31, step 3 of the contract). */
describe("new work offered with a change", () => {
  const basement = (name: string, price: number, id: string): QuoteOption => ({ ...option([line({ description: `${name} install`, unitPriceSnap: price })]), id, name, part: "Basement" });
  const q = quote([install], { status: "Sent", options: [option([install]), basement("Basement vinyl", 4, "recOPTBVINYL00000"), basement("Basement oak", 9, "recOPTBOAK0000000")] });
  const copy: CustomerCopy = { ...customerCopy(q, at), change: changeSummary(1, "2026-11-03", before, after) };
  const TERMS = { id: "recTermsAAAAAAAAA", on: "2026-10-27" };
  const ctx = { now: new Date("2026-11-12T15:00:00Z"), terms: TERMS, method: "link" as const, recordedBy: null, userAgent: null };
  const input = (optionIndexes: number[]): AcceptInput => ({ optionIndexes, addOns: [], name: "Sam Sample", terms: true, termsId: TERMS.id, signature: null, reason: null });

  it("freezes the project first and the new work as offers, in order", () => {
    expect(copy.options.map((o) => [o.name, o.offer ?? false])).toEqual([["Oak", false], ["Basement vinyl", true], ["Basement oak", true]]);
    expect(offersOf(copy)).toEqual([1, 2]);
    expect(customerCopy(quote([install], { changeNo: null }), at).options[0].offer).toBeUndefined();
  });

  it("can be accepted for the offers only, one per Part", () => {
    expect(notAcceptable(copy, "open", TERMS)).toBeNull();
    expect(acceptProblems(copy, "open", input([1]), { terms: TERMS, method: "link" })).toEqual([]);
    expect(acceptProblems(copy, "open", input([0]), { terms: TERMS, method: "link" })[0]).toMatch(/already agreed/);
    expect(acceptProblems(copy, "open", input([1, 2]), { terms: TERMS, method: "link" })[0]).toMatch(/one option for the basement/);
  });

  it("joins the project: totals and schedule on the whole, the contract the project plus the pick", () => {
    const a = buildAcceptance(copy, input([2]), ctx);
    expect(a.base).toEqual({ index: 0, name: "Oak", ref: "recOPTOAK00000000", scope: null });
    expect(picksOf(a).map((p) => p.name)).toEqual(["Basement oak"]);
    expect(a.totals.total).toBe(round2(copy.options[0].totals.total + copy.options[2].totals.total));
    expect(round2(a.stages.reduce((t, s) => t + (s.amount ?? 0), 0))).toBe(a.totals.total);
    const k = fromAcceptance("recCHANGE00000001", a);
    expect(k.items.map((i) => [i.index, i.name, i.via])).toEqual([[0, "Oak", "change"], [2, "Basement oak", "accepted"]]);
    expect(acceptedCopy(copy, a).options[0].name).toBe("Oak + Basement oak");
  });

  it("asks only for what is due now: the deposit on the whole less what was received", () => {
    const a = buildAcceptance(copy, input([1]), ctx);
    const deposit = a.stages[0].amount ?? 0;
    expect(dueNow({ ...a, paid: 100 })).toEqual({ deposit, paid: 100, due: round2(deposit - 100) });
    expect(dueNow({ ...a, paid: deposit + 50 }).due).toBe(0);
    expect(dueNow({ ...a, paid: null }).due).toBe(deposit);
    expect(dueWords(dueNow({ ...a, paid: null }), money)).toMatch(/less anything you've already paid/);
    // A first acceptance is unchanged: the deposit.
    const first = buildAcceptance(customerCopy(quote([install], { changeNo: null, status: "Sent" }), at), input([0]), ctx);
    expect(first.base).toBeUndefined();
    expect(dueNow(first).due).toBe(first.stages[0].amount);
  });

  it("an offer with no Part is an addition on its own: any or all, beside a choice for a Part", () => {
    const extra = (name: string, id: string): QuoteOption => ({ ...option([line({ description: `${name} work`, unitPriceSnap: 2 })]), id, name });
    const q2 = quote([install], { status: "Sent", options: [option([install]), basement("Basement vinyl", 4, "recOPTBVINYL00000"), basement("Basement oak", 9, "recOPTBOAK0000000"), extra("Closet", "recOPTCLOSET00000"), extra("Shoe moulding", "recOPTSHOE0000000")] });
    const c2: CustomerCopy = { ...customerCopy(q2, at), change: changeSummary(1, "2026-11-03", before, after) };
    expect([3, 4].map((i) => pickKey(c2.options[i], i))).toEqual(["addition:3", "addition:4"]);
    expect(isAddition(pickKey(c2.options[3], 3))).toBe(true);
    expect(acceptProblems(c2, "open", input([3, 4]), { terms: TERMS, method: "link" })).toEqual([]);
    expect(acceptProblems(c2, "open", input([1, 3, 4]), { terms: TERMS, method: "link" })).toEqual([]);
    expect(acceptProblems(c2, "open", input([1, 2, 3]), { terms: TERMS, method: "link" })[0]).toMatch(/one option for the basement/);
    const a = buildAcceptance(c2, input([3, 4]), ctx);
    expect(fromAcceptance("recC", a).items.map((i) => i.name)).toEqual(["Oak", "Closet", "Shoe moulding"]);
  });

  it("the email and the text say what was added and what is due now; the change email names the offers", () => {
    const a = { ...buildAcceptance(copy, input([1]), ctx), paid: 100 };
    const to = { contactId: "ctc0000001", firstName: "Sam", link: "https://quote.example/c/x" };
    const email = acceptedEmailMessage(copy, a, { ...to, pdfUrl: "", termsUrl: null }, { etransfer: "pay@example.com", acceptedWhen: "today" });
    if (email.type !== "Email") throw new Error("expected an email");
    expect(email.subject).toMatch(/^Added to your project/);
    expect(email.html).toContain("Due now");
    const sms = acceptedSmsMessage(copy, a, to, { etransfer: "pay@example.com" });
    if (sms.type !== "SMS") throw new Error("expected a text");
    expect(sms.message).toContain("Thank you for adding Basement vinyl to your project");
    expect(sms.message).toMatch(/^[\x20-\x7e\n]+$/);
    const change = changeSmsMessage(copy, to);
    if (change.type !== "SMS") throw new Error("expected a text");
    expect(change.message).toContain("Basement vinyl and Basement oak");
  });
});
