import { describe, expect, it } from "vitest";
import { payoutAmount, payoutTotal } from "../src/lib/calc";
import {
  addCard,
  addLine,
  buildCards,
  camDescription,
  cardFileName,
  cardSheet,
  cardSig,
  cardTotal,
  cleanPayouts,
  defaultOptionIds,
  labourRate,
  moveLine,
  parsePayouts,
  payoutCandidates,
  pushProblem,
  pushState,
  rateChanged,
  resetRate,
  serializePayouts,
  setCard,
  setLine,
  withPush,
  type PayoutSet,
} from "../src/lib/payout/cards";
import type { Quote, QuoteLine, QuoteOption, RateCard } from "../src/lib/quotes/types";

/** Contractor payout cards (2026-11-04). Invented names, rates and costs only. */

let n = 0;
const rec = (p: string) => `rec${p}${String(++n).padStart(14 - p.length, "0")}`.slice(0, 17);

function line(over: Partial<QuoteLine> = {}): QuoteLine {
  return {
    id: rec("L"),
    lineType: "Item",
    section: "Install",
    include: true,
    qty: 100,
    waste: 0,
    unitPrice: null,
    unitPriceSnap: 5,
    unitCostSnap: 2,
    costOverride: null,
    manualCost: null,
    minChargeSnap: null,
    hasSource: true,
    sourceKind: "manual",
    sourceId: null,
    labourType: null,
    spec: null,
    description: "Install vinyl plank",
    area: "Main floor",
    uom: "sqft",
    contractor: "Crew A",
    clientNote: null,
    sortOrder: null,
    airtableTotal: null,
    airtableCost: null,
    ...over,
  };
}

function option(over: Partial<QuoteOption> = {}): QuoteOption {
  return { id: rec("O"), name: "Option", description: null, sortOrder: null, recommended: false, serviceLevel: null, crew: null, lines: [], airtable: {}, ...over };
}

const card: RateCard = {
  rates: [{ id: "recRATE0000000001", labourType: "Install", spec: "Glue down", contractor: "Crew A", uom: "sqft", rate: 4, cost: 1.5, minCharge: null, defaultWaste: null, materialGroup: "Glue", defaultMaterialId: "recMAT00000000001" }],
  stairs: [
    { id: "recSTAIR000000001", name: "Step", category: "step", size: null, rate: 90, cost: 50, labourCost: 35 },
    { id: "recSTAIR000000002", name: "Riser", category: "riser", size: null, rate: 30, cost: 12, labourCost: 12 },
  ],
  materials: [{ id: "recMAT00000000001", name: "Glue", group: "Glue", cost: 0.4, price: 0.8 }],
};

type Q = Pick<Quote, "id" | "acceptance" | "changeNo" | "options">;
const quote = (options: QuoteOption[], over: Partial<Q> = {}): Q => ({ id: "recVERSION0000001", acceptance: null, changeNo: null, options, ...over });

describe("labourRate: what Titan pays for one unit, labour only", () => {
  it("is the line's cost: a typed override, else the card snap", () => {
    expect(labourRate(line(), card)).toBe(2);
    expect(labourRate(line({ costOverride: 2.25 }), card)).toBe(2.25);
  });

  it("takes the swapped material out of a Rate Card line", () => {
    const l = line({ sourceKind: "rate", sourceId: "recRATE0000000001", materialId: "recMAT00000000001", unitCostSnap: 1.9 });
    expect(labourRate(l, card)).toBe(1.5);
    // A typed cost on a material line is the card's labour + the typed material: the labour is the card's.
    expect(labourRate({ ...l, costOverride: 2.5 }, card)).toBe(1.5);
  });

  it("takes a Stair Item's material cost out, and leaves a labour-only snap from before 2026-10-31 alone", () => {
    expect(labourRate(line({ section: "Stairs", sourceKind: "stair", sourceId: "recSTAIR000000001", unitCostSnap: 50, qty: 12, uom: "piece" }), card)).toBe(35);
    expect(labourRate(line({ section: "Stairs", sourceKind: "stair", sourceId: "recSTAIR000000001", unitCostSnap: 35 }), card)).toBe(35);
    expect(labourRate(line({ section: "Stairs", sourceKind: "stair", sourceId: "recSTAIR000000002", unitCostSnap: 12 }), card)).toBe(12);
  });

  it("spreads a typed whole-line cost over the quantity", () => {
    expect(labourRate(line({ manualCost: 450, qty: 300 }), card)).toBe(1.5);
    expect(labourRate(line({ manualCost: 450, qty: 0 }), card)).toBe(450);
  });

  it("knows nothing when the line has no cost", () => {
    expect(labourRate(line({ unitCostSnap: null }), card)).toBeNull();
  });
});

describe("which options are final", () => {
  const a = option({ name: "A", recommended: true });
  const b = option({ name: "B" });
  const c = option({ name: "C", notOffered: true });

  it("defaults to the recommended option, else the first offered", () => {
    expect(defaultOptionIds(quote([a, b]))).toEqual([a.id]);
    expect(defaultOptionIds(quote([c, b, { ...a, recommended: false }]))).toEqual([b.id]);
  });

  it("takes what the customer accepted", () => {
    const acceptance = { option: { index: 1, name: "B", ref: b.id }, addOns: [] } as unknown as Quote["acceptance"];
    expect(defaultOptionIds(quote([a, b], { acceptance }))).toEqual([b.id]);
  });

  it("takes every offered option on a change", () => {
    expect(defaultOptionIds(quote([a, b, c], { changeNo: 1 }))).toEqual([a.id, b.id]);
  });
});

describe("building the cards", () => {
  const install = line({ description: "Install vinyl plank", qty: 400, unitCostSnap: 2 });
  const removal = line({ section: "Removal", description: "Remove carpet", qty: 400, unitCostSnap: 0.5, contractor: "Crew B" });
  const stairs = line({ section: "Stairs", description: "Step", qty: 12, sourceKind: "stair", sourceId: "recSTAIR000000001", unitCostSnap: 50, contractor: "Crew B", uom: "piece" });
  const material = line({ section: "Materials", description: "Vinyl plank", qty: 440, unitCostSnap: 3 });
  const delivery = line({ section: "Delivery", description: "Delivery", qty: 1, unitCostSnap: 60, contractor: null });
  const note = line({ lineType: "Note", description: "Move furniture first" });
  const addOn = line({ include: false, description: "Install quarter round", section: "Install", qty: 50, unitCostSnap: 1 });
  const opt = option({ name: "Vinyl", lines: [delivery, material, stairs, removal, install, note, addOn] });

  it("lists labour only, in section order, never materials, notes or a declined add-on", () => {
    const got = payoutCandidates(quote([opt]), [opt.id], card);
    expect(got.map((l) => l.description)).toEqual(["Install vinyl plank", "Step", "Remove carpet", "Delivery"]);
  });

  it("ticks the labour sections and lists Delivery unticked", () => {
    const got = payoutCandidates(quote([opt]), [opt.id], card);
    expect(got.map((l) => [l.section, l.on])).toEqual([["Install", true], ["Stairs", true], ["Removal", true], ["Delivery", false]]);
  });

  it("counts an add-on the customer took", () => {
    const acceptance = { option: { index: 0, name: "Vinyl", ref: opt.id }, addOns: [{ key: "a", description: "install quarter-round", amount: 100 }] } as unknown as Quote["acceptance"];
    expect(payoutCandidates(quote([opt], { acceptance }), [opt.id], card).map((l) => l.description)).toContain("Install quarter round");
  });

  it("makes one card per contractor, unassigned lines on their own", () => {
    const set = buildCards(quote([opt]), [opt.id], card, null);
    expect(set.cards.map((c) => [c.contractor, c.lines.map((l) => l.description)])).toEqual([
      ["Crew A", ["Install vinyl plank"]],
      ["Crew B", ["Step", "Remove carpet"]],
      ["", ["Delivery"]],
    ]);
    expect(set.cards.map((c) => cardTotal(c))).toEqual([800, 620, 0]);
    expect(set.options).toEqual([opt.id]);
  });

  it("puts two options' lines for one contractor on one card", () => {
    const other = option({ name: "Stairs", lines: [line({ section: "Stairs", description: "Riser", qty: 13, unitCostSnap: 12, contractor: "crew a" })] });
    const set = buildCards(quote([opt, other]), [opt.id, other.id], card, null);
    expect(set.cards[0].lines.map((l) => [l.option, l.description])).toEqual([["Vinyl", "Install vinyl plank"], ["Stairs", "Riser"]]);
  });

  it("keeps a contractor's push history across a rebuild", () => {
    const before = buildCards(quote([opt]), [opt.id], card, null);
    const pushed = withPush(before, "c1", { at: "2026-11-04T15:00:00Z", by: "a@example.com", total: 800, sig: "x", file: "f.jpg", camPhotoId: "1" });
    expect(buildCards(quote([opt]), [opt.id], card, pushed).cards[0].pushes).toHaveLength(1);
  });
});

describe("editing", () => {
  const base = (): PayoutSet => buildCards(quote([option({ lines: [line({ qty: 10 }), line({ section: "Removal", description: "Remove tile", qty: 10, unitCostSnap: 1, contractor: "Crew B" })] })]), [], card, null);
  const set0 = (): PayoutSet => {
    const o = option({ lines: [line({ qty: 10 }), line({ section: "Removal", description: "Remove tile", qty: 10, unitCostSnap: 1, contractor: "Crew B" })] });
    return buildCards(quote([o]), [o.id], card, null);
  };

  it("builds nothing with no option picked", () => {
    expect(base().cards).toEqual([]);
  });

  it("edits a rate and shows it changed, and resets it", () => {
    let s = setLine(set0(), "c1", "l1", { rate: 2.5 });
    expect(rateChanged(s.cards[0].lines[0])).toBe(true);
    expect(cardTotal(s.cards[0])).toBe(25);
    s = resetRate(s, "c1", "l1");
    expect(rateChanged(s.cards[0].lines[0])).toBe(false);
  });

  it("adds a typed line and a card, and moves a line between cards", () => {
    let s = addLine(set0(), "c1");
    expect(s.cards[0].lines.at(-1)).toMatchObject({ id: "l3", ref: null, on: true, rate: null, qty: 1 });
    s = addCard(s, "Crew C");
    expect(s.cards.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    s = moveLine(s, "l2", "c3");
    expect(s.cards[1].lines).toEqual([]);
    expect(s.cards[2].lines.map((l) => l.description)).toEqual(["Remove tile"]);
  });

  it("refuses a push until the card is complete", () => {
    let s = addLine(set0(), "c1");
    expect(pushProblem(s.cards[0])).toMatch(/description, quantity and rate/);
    s = setLine(s, "c1", "l3", { description: "Move fridge", rate: 40 });
    expect(pushProblem(s.cards[0])).toBeNull();
    expect(pushProblem(setCard(s, "c1", { contractor: " " }).cards[0])).toMatch(/Name the contractor/);
  });

  it("says when a pushed card has changed since", () => {
    const s = set0();
    expect(pushState(s.cards[0]).kind).toBe("never");
    const pushed = withPush(s, "c1", { at: "t", by: "b", total: 20, sig: cardSig(s.cards[0]), file: "f", camPhotoId: null });
    expect(pushState(pushed.cards[0]).kind).toBe("current");
    // An unticked line doesn't change what the contractor sees until it is ticked.
    expect(pushState(setLine(pushed, "c1", "l1", { rate: 3 }).cards[0]).kind).toBe("changed");
  });
});

describe("the money", () => {
  it("is quantity × rate to the cent, ticked lines only", () => {
    expect(payoutAmount({ qty: 333, rate: 1.333 })).toBe(443.89);
    expect(payoutAmount({ qty: null, rate: 2 })).toBe(0);
    expect(payoutTotal([{ qty: 10, rate: 2, on: true }, { qty: 10, rate: 5, on: false }, { qty: 1, rate: -15, on: true }])).toBe(5);
  });
});

describe("the card as drawn", () => {
  it("lists ticked lines with their figures, grouped by option only when there are two", () => {
    const o = option({ name: "Vinyl", lines: [line({ qty: 400, unitCostSnap: 2 }), line({ section: "Delivery", description: "Delivery", qty: 1, unitCostSnap: 60 })] });
    const set = buildCards(quote([o]), [o.id], card, null);
    const sheet = cardSheet(set.cards[0], { quoteNumber: "Q-1000", projectNumber: "PP-10", customer: "Pat Example", site: "1 Test St, Town", date: "Nov 4, 2026" });
    expect(sheet.ref).toBe("PP-10 · Q-1000");
    expect(sheet.groups).toEqual([{ option: null, lines: [{ description: "Install vinyl plank", detail: "Main floor · 400 sqft × $2.00", amount: "$800.00" }] }]);
    expect(sheet.total).toBe("$800.00");
    expect(sheet.rows[0]).toEqual(["Contractor", "Crew A"]);
    expect(sheet.footer).toMatch(/Labour only/);
  });

  it("names the file and the CompanyCam description from the card", () => {
    expect(cardFileName("Crew A/B", { quoteNumber: "Q-1000", projectNumber: null }, "2026-11-04T15:07:12.000Z")).toBe("Payout - Crew AB - Q-1000 - 2026-11-04 1507.jpg");
    const o = option({ lines: [line({ qty: 10 })] });
    const c = buildCards(quote([o]), [o.id], card, null).cards[0];
    expect(camDescription(c, { quoteNumber: "Q-1000", projectNumber: "PP-10" }, "Sam")).toBe("Payout card: Crew A, $20.00 labour (PP-10). Sent from the quote app by Sam.");
  });
});

describe("storing", () => {
  it("round-trips, and never takes push history from the browser", () => {
    const o = option({ lines: [line({ qty: 10 })] });
    const built = buildCards(quote([o]), [o.id], card, null);
    const stored = withPush(built, "c1", { at: "2026-11-04T15:00:00Z", by: "a@example.com", total: 20, sig: "s", file: "f.jpg", camPhotoId: "9" });
    const raw = serializePayouts(stored, "a@example.com", "2026-11-04T15:00:00Z");
    const back = parsePayouts(raw)!;
    expect(back.cards[0].pushes).toHaveLength(1);
    expect(back.by).toBe("a@example.com");

    const forged = { ...built, cards: built.cards.map((c) => ({ ...c, pushes: [{ at: "x", sig: "y" }, { at: "x2", sig: "y2" }] })) };
    expect(cleanPayouts(forged, back).cards[0].pushes).toEqual(back.cards[0].pushes);
    expect(cleanPayouts(forged, null).cards[0].pushes).toEqual([]);
  });

  it("cleans what the browser sends: bad ids, duplicates, numbers and long text", () => {
    const got = cleanPayouts(
      {
        options: ["recBAD", "recOPTION00000001"],
        cards: [
          { id: "c1", contractor: `  Crew\nA ${"x".repeat(200)}`, note: "line one\r\nline two", lines: [{ id: "l1", description: "Install", qty: "12.5", rate: "abc", on: true }, { id: "l1", description: "dupe" }, { id: "zz" }] },
          { id: "c1", contractor: "dupe card" },
          { id: "drop table" },
        ],
      },
      null,
    );
    expect(got.options).toEqual(["recOPTION00000001"]);
    expect(got.cards).toHaveLength(1);
    expect(got.cards[0].contractor.startsWith("Crew A x")).toBe(true);
    expect(got.cards[0].contractor.length).toBe(80);
    expect(got.cards[0].note).toBe("line one\nline two");
    expect(got.cards[0].lines).toEqual([{ id: "l1", ref: null, option: null, section: "Other", description: "Install", area: "", uom: "", qty: 12.5, rate: null, cardRate: null, on: true }]);
  });

  it("reads text it didn't write as no cards", () => {
    expect(parsePayouts("")).toBeNull();
    expect(parsePayouts("pay Bob 500")).toBeNull();
    expect(parsePayouts('{"v":9,"cards":[]}')).toBeNull();
  });
});
