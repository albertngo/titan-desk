import { describe, expect, it } from "vitest";
import { acceptedCopy, acceptProblems, addOnsOf, buildAcceptance, picksOf, type AcceptInput } from "../src/lib/accept/plan";
import type { Terms } from "../src/lib/accept/terms";
import { optionTotals, round2 } from "../src/lib/calc";
import { fromQuote, updateOption } from "../src/lib/editor/model";
import { optionScope, scopeGroups } from "../src/lib/quotes/scope";
import type { Quote, QuoteLine, QuoteOption } from "../src/lib/quotes/types";
import { contractOn, contractVersions, contractView, fromAcceptance, fromChange, legacyContract, parseContract, serializeContract, type Contract } from "../src/lib/contract/model";
import { customerCopy, isSplit, scopeLeads, scopesOf, type Letterhead } from "../src/lib/send/copy";
import { emailMessage, smsMessage, type GhlMessage } from "../src/lib/send/plan";

const body = (m: GhlMessage) => (m.type === "Email" ? m.html : m.message);

/* Scopes (Albert, 2026-10-28): flooring and stairs options on one quote, one of each accepted. Invented numbers only. */

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

function option(name: string, lines: QuoteLine[], p: Partial<QuoteOption> = {}): QuoteOption {
  return { id: `recOPT${name.replace(/\W/g, "").padEnd(11, "0").slice(0, 11)}`, name, description: null, sortOrder: 1, recommended: false, serviceLevel: null, crew: null, lines, airtable: { ...optionTotals(lines, 0, true) }, ...p };
}

const addOn = line({ section: "Other", description: "Stair nosing", include: false, qty: 4, unitPriceSnap: 25 }); // 100, taxed
const quote = (p: Partial<Quote> = {}): Quote => ({
  id: "recVERSION0000001",
  quoteId: "Q-9001 v2",
  version: 2,
  status: "Sent",
  basis: "Measured",
  showHst: true,
  itemised: false,
  discountRate: 0,
  validUntil: "2026-11-30",
  sentAt: "2026-10-27",
  sendBlock: null,
  customerToken: "a".repeat(32),
  sentBy: "pat.quoter@example.com",
  sentTo: "Email, Text",
  notes: null,
  customerName: "Sam Sample",
  siteAddress: "1 Sample Street",
  siteCity: "Testville",
  link: {
    quoteRecordId: "recQUOTE000000001",
    quoteNumber: "Q-9001",
    displayName: "Sam Sample - 1026 - Q-9001",
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
    projectNumber: null,
    notionProjectUrl: null,
  },
  options: [option("Oak", [line({}), addOn]), option("Vinyl", [line({ unitPriceSnap: 8 })])],
  legacyLineCount: 0,
  ...p,
});
const COMPANY: Letterhead = { name: "Titan Flooring", address: null, phone: null, email: "hello@example.com", website: null };
const copyOf = (q = quote()) => customerCopy(q, { sentOn: "2026-10-27", validUntil: "2026-11-30", company: COMPANY });
const stair = (p: Partial<QuoteLine> = {}) => line({ lineType: "Stairs", section: "Stairs", sourceKind: "stair", sourceId: "recSTAIR000000001", description: "Step (Right Side Open)", qty: 13, uom: "each", unitPriceSnap: 100, ...p });
const split = (p: Partial<Quote> = {}) =>
  quote({ options: [option("Red oak caps", [stair()]), option("Oak", [line({}), addOn]), option("Vinyl", [line({ unitPriceSnap: 8 })])], ...p });
const TERMS: Terms = { id: "recTermsAAAAAAAAA", on: "2026-10-27" };
const input = (p: Partial<AcceptInput> = {}): AcceptInput => ({ optionIndexes: [0], addOns: [], name: "Sam Sample", terms: true, termsId: TERMS.id, signature: null, reason: null, ...p });
const NOW = new Date("2026-11-03T19:14:00Z");
const ctx = { now: NOW, terms: TERMS, method: "link" as const, recordedBy: null, userAgent: null };
const TO = { contactId: "ctc0000001", firstName: "Sam", link: "https://example.com/c/x" };

describe("an option's scope", () => {
  it("is what was set, else Stairs when every priced line is a stair line", () => {
    expect(optionScope(option("A", [stair()]))).toBe("Stairs");
    expect(optionScope(option("B", [stair(), line({})]))).toBe("Flooring");
    expect(optionScope(option("C", [line({})], { scope: "Stairs" }))).toBe("Stairs");
    expect(optionScope(option("D", [stair()], { scope: "Flooring" }))).toBe("Flooring");
  });

  it("is frozen on the copy, flooring options first, so each scope reads as one group", () => {
    const c = copyOf(split());
    expect(c.options.map((o) => [o.name, o.scope ?? "Flooring"])).toEqual([["Oak", "Flooring"], ["Vinyl", "Flooring"], ["Red oak caps", "Stairs"]]);
    expect(isSplit(c)).toBe(true);
    expect(scopesOf(c)).toEqual(["Flooring", "Stairs"]);
    expect(isSplit(copyOf())).toBe(false);
  });

  it("keeps one recommended option per scope in the editor", () => {
    let q = fromQuote(split());
    const [caps, oak, vinyl] = q.options;
    q = updateOption(q, caps.id, { recommended: true });
    q = updateOption(q, oak.id, { recommended: true });
    expect(q.options.map((o) => o.recommended)).toEqual([true, true, false]);
    q = updateOption(q, vinyl.id, { recommended: true });
    expect(q.options.map((o) => o.recommended)).toEqual([true, false, true]);
  });
});

describe("accepting one option of each scope", () => {
  const c = copyOf(split()); // 0 Oak, 1 Vinyl, 2 Red oak caps

  it("takes a flooring option and a stairs option, or either alone, never two of one scope", () => {
    expect(acceptProblems(c, "open", input({ optionIndexes: [0, 2] }), { terms: TERMS, method: "link" })).toEqual([]);
    expect(acceptProblems(c, "open", input({ optionIndexes: [2] }), { terms: TERMS, method: "link" })).toEqual([]);
    expect(acceptProblems(c, "open", input({ optionIndexes: [0, 1] }), { terms: TERMS, method: "link" })).toEqual(["Choose one flooring option, not two."]);
  });

  it("makes one contract: the totals added, one schedule on the whole, every pick named", () => {
    const key = addOnsOf(c, 0)[0].key;
    const a = buildAcceptance(c, input({ optionIndexes: [2, 0], addOns: [key] }), ctx);
    const sub = round2(c.options[0].totals.subtotal + c.options[2].totals.subtotal + 100);
    expect(a.totals.subtotal).toBe(sub);
    expect(a.option).toEqual({ index: 0, name: "Oak + Red oak caps", ref: c.options[0].ref });
    expect(picksOf(a).map((p) => [p.name, p.scope])).toEqual([["Oak", "Flooring"], ["Red oak caps", "Stairs"]]);
    expect(round2(a.stages.reduce((t, s) => t + (s.amount ?? 0), 0))).toBe(a.totals.total);

    const accepted = acceptedCopy(c, a);
    expect(accepted.options).toHaveLength(1);
    const o = accepted.options[0];
    expect(o.name).toBe("Oak + Red oak caps");
    expect(o.sections.map((s) => s.name)).toEqual(["Install", "Other", "Stairs"]);
    expect(o.sections.find((s) => s.name === "Other")?.lines[0]).toMatchObject({ description: "Stair nosing", added: true, optional: false });
    expect(o.totals.total).toBe(a.totals.total);
    expect(o.scope).toBeUndefined();
  });

  it("reads a record from before scopes as its one option", () => {
    const one = copyOf();
    const a = buildAcceptance(one, input({ optionIndexes: [0] }), ctx);
    const old = { ...a, picks: undefined, addOns: [{ key: "1.0", description: "Stair nosing", amount: 100 }] };
    expect(picksOf(old)).toEqual([{ index: 0, name: "Oak", ref: one.options[0].ref, scope: "Flooring" }]);
    expect(acceptedCopy(one, old).options[0].sections.flatMap((s) => s.lines).some((l) => l.kind === "item" && l.added)).toBe(true);
  });
});

describe("each scope's price on its own", () => {
  it("a preliminary shows a range per scope in the text, the email and its preheader", () => {
    const q = split({ basis: "Preliminary", options: [option("Oak", [line({})]), option("Red oak caps", [stair()])] });
    const c = customerCopy(q, { sentOn: "2026-10-27", validUntil: null, company: COMPANY });
    const leads = scopeLeads(c, (n) => `$${n}`, " to ");
    expect(leads.map((x) => x.scope)).toEqual(["Flooring", "Stairs"]);
    expect(leads[0].phrase).toMatch(/^\$[\d,]+ to \$[\d,]+ \+ HST$/);
    const sms = body(smsMessage(c, TO));
    expect(sms).toMatch(/Your estimate: flooring \$[\d,]+ to \$[\d,]+ \+ HST, stairs \$[\d,]+ to \$[\d,]+ \+ HST\./);
    const mail = emailMessage(c, TO);
    expect(body(mail)).toMatch(/Flooring \$[\d,]+ – \$[\d,]+ \+ HST · Stairs/);
  });

  it("several options in a scope read from the lowest; a measured text names both", () => {
    const c = copyOf(split());
    const leads = scopeLeads(c, (n) => `$${n}`);
    expect(leads).toEqual([
      { scope: "Flooring", count: 2, phrase: `from $${Math.min(c.options[0].totals.subtotal, c.options[1].totals.subtotal)} + HST` },
      { scope: "Stairs", count: 1, phrase: `$${c.options[2].totals.subtotal} + HST` },
    ]);
    expect(body(smsMessage(c, TO))).toMatch(/Your quote is ready: flooring from .*, stairs .*, good until/);
  });
});

describe("scopeGroups (2026-10-30: Flooring | Stairs tabs)", () => {
  const o = (id: string, scope: "Flooring" | "Stairs") => ({ id, name: id, scope, lines: [] as QuoteLine[] });
  it("puts flooring first, then stairs, each in its own order", () => {
    const g = scopeGroups([o("s1", "Stairs"), o("f1", "Flooring"), o("s2", "Stairs"), o("f2", "Flooring")]);
    expect(g.split).toBe(true);
    expect(g.groups.map((x) => [x.scope, x.options.map((y) => y.id)])).toEqual([["Flooring", ["f1", "f2"]], ["Stairs", ["s1", "s2"]]]);
  });
  it("is not split when every option is one scope", () => {
    expect(scopeGroups([o("a", "Stairs"), o("b", "Stairs")]).split).toBe(false);
    expect(scopeGroups([]).groups).toEqual([]);
  });
});

/* The contract as pointers (Albert, 2026-10-30): the same contract as before, held as items on the quote. */
describe("the contract", () => {
  const c = copyOf(split()); // 0 Oak (with the optional nosing), 1 Vinyl, 2 Red oak caps
  const key = () => addOnsOf(c, 0)[0].key;
  const a = () => buildAcceptance(c, input({ optionIndexes: [2, 0], addOns: [key()] }), ctx); // Oak + Red oak caps

  it("is one item per option taken, each with its own add-ons, the totals and schedule on the whole", () => {
    const k = fromAcceptance("recVERSION0000001", a());
    expect(k.items.map((i) => [i.index, i.name, i.scope, i.via, i.on])).toEqual([
      [0, "Oak", "Flooring", "accepted", "2026-11-03"],
      [2, "Red oak caps", "Stairs", "accepted", "2026-11-03"],
    ]);
    expect(k.items[0].addOns.map((x) => x.key)).toEqual([key()]);
    expect(k.items[1].addOns).toEqual([]);
    expect(k.totals).toEqual(a().totals);
    expect(k.stages).toEqual(a().stages);
  });

  it("joins to exactly the accepted copy", () => {
    const k = fromAcceptance("recV1", a());
    expect(contractView(k, { recV1: c })).toEqual(acceptedCopy(c, a()));
  });

  it("reads an older record's two-part add-on keys onto its one option", () => {
    const one = copyOf();
    const old = { ...buildAcceptance(one, input({ optionIndexes: [0] }), ctx), picks: undefined, addOns: [{ key: "1.0", description: "Stair nosing", amount: 100 }] };
    expect(fromAcceptance("recV1", old).items[0].addOns[0].key).toBe("0.1.0");
  });

  it("joins options from two versions, on the newest copy", () => {
    const v5 = { ...c, sentOn: "2026-10-20", quoteNumber: "Q-9001" };
    const v8 = { ...copyOf(quote({ options: [option("Walnut", [line({ unitPriceSnap: 12 })])] })), sentOn: "2026-10-29" };
    const k: Contract = {
      v: 1,
      items: [
        { versionId: "recV8", index: 0, ref: null, name: "Walnut", scope: "Flooring", addOns: [], via: "accepted", on: "2026-10-30" },
        { versionId: "recV5", index: 2, ref: null, name: "Red oak caps", scope: "Stairs", addOns: [], via: "accepted", on: "2026-10-21" },
      ],
      totals: { subtotal: 1, hst: 0, total: 1 },
      stages: [],
    };
    const view = contractView(k, { recV5: v5, recV8: v8 })!;
    expect(view.sentOn).toBe("2026-10-29");
    expect(view.options[0].name).toBe("Walnut + Red oak caps");
    expect(view.options[0].sections.map((s) => s.name)).toEqual(["Install", "Stairs"]);
    expect(contractVersions(k)).toEqual(["recV8", "recV5"]);
    expect(contractOn(k)).toBe("2026-10-30");
    expect(contractView(k, { recV8: v8 })).toBeNull();
  });

  it("after a change is that change's one option", () => {
    const sent = { ...copyOf(), change: { no: 1 } as never, sentOn: "2026-11-05" };
    const k = fromChange("recCHANGE", sent)!;
    expect(k.items).toEqual([{ versionId: "recCHANGE", index: 0, ref: sent.options[0].ref, name: "Oak", scope: null, addOns: [], via: "change", on: "2026-11-05" }]);
    expect(k.totals.total).toBe(sent.options[0].totals.total);
    expect(contractView(k, { recCHANGE: sent })!.options[0].sections.flatMap((s) => s.lines).some((l) => l.kind === "item" && l.optional)).toBe(false);
  });

  it("is worked out from Contract Version on a quote accepted before the field: its acceptance, or the change it is", () => {
    expect(legacyContract("recV1", c, a())).toEqual(fromAcceptance("recV1", a()));
    expect(legacyContract("recV1", c, { ...a(), cancelled: { at: "x", by: "y", reason: "z" } })).toBeNull();
    expect(legacyContract("recV1", c, null)).toBeNull();
    expect(legacyContract("recV1", { ...c, change: { no: 2 } as never }, null)?.items[0].via).toBe("change");
  });

  it("round-trips, and anything that isn't one reads as none", () => {
    const k = fromAcceptance("recV1", a());
    expect(parseContract(serializeContract(k))).toEqual(k);
    expect(parseContract("")).toBeNull();
    expect(parseContract("{")).toBeNull();
    expect(parseContract(JSON.stringify({ ...k, items: [] }))).toBeNull();
    expect(parseContract(JSON.stringify({ ...k, v: 2 }))).toBeNull();
  });
});
