import { describe, expect, it } from "vitest";
import { optionTotals } from "../src/lib/calc";
import { amountUnit, BASEBOARD_PER_SQFT, baseboardDefault, baseboardFollow, buildPreliminary, choiceRate, parseWork, QUICK_GROUPS, rowTotal, stairTotal, workIsEmpty, type QuickChoice, type QuickPart, type QuickProduct } from "../src/lib/quick/plan";

// INVENTED rates, costs, ids and products only: this repo is public.
const part = (o: Partial<QuickPart> & { recordId: string }): QuickPart => ({ kind: "rate", labourType: "Install", spec: "SPEC", description: "Install | SPEC", contractor: "Crew A", uom: "sqft", rate: 2, cost: 1, minCharge: null, ...o });
const choice = (o: Partial<QuickChoice> & { id: string }): QuickChoice => ({ group: "Install", label: "Choice", sort: 1, times: 1, parts: [], product: null, ...o });

const NAIL = choice({ id: "recNail00000000AA", label: "Nail down", parts: [part({ recordId: "recRateNail0000AA" })] });
const NAIL_GLUE = choice({ id: "recNailGlue0000AA", label: "Nail + glue", parts: [part({ recordId: "recRateNail0000AA" }), part({ recordId: "recRateGlue0000AA", rate: 0.5, cost: 0.25 })] });
const BINS = choice({ id: "recBins000000000A", group: "Disposal", label: "Two bins", times: 2, parts: [part({ recordId: "recRateBin00000AA", labourType: "Disposal", uom: "flat", rate: 300, cost: 200 })] });
const STD: QuickProduct = { recordId: "recProdStd00000AA", sku: "STD-1", name: "Standard plank", rate: 3, cost: 2 };
const OTHER: QuickProduct = { recordId: "recProdOther000AA", sku: "OTH-9", name: "Other plank", rate: 5, cost: 3 };
const MAT = choice({ id: "recMat0000000000A", group: "Material", label: "Vinyl click", product: STD });
const MAT_UNSET = choice({ id: "recMatUnset00000A", group: "Material", label: "Tiles", product: null });
/** A material with no product, priced from a Material row on the Rate Card instead (2026-10-22). */
const MAT_ROW = choice({ id: "recMatRow0000000A", group: "Material", label: "Cork", product: null, parts: [part({ recordId: "recRateCork0000AA", labourType: "Material", spec: "Cork", description: "Material | Cork", rate: 1.8, cost: 1.4 })] });
const choices = [NAIL, NAIL_GLUE, BINS, MAT, MAT_UNSET, MAT_ROW];

describe("quick form: what the browser sends", () => {
  it("keeps only choice ids and positive amounts, never a price", () => {
    const w = parseWork({ rows: [{ choiceId: NAIL.id, amount: 500, unitPrice: 0.01 }, { choiceId: "nope", amount: 1 }, { choiceId: BINS.id, amount: -3 }], extraCost: "x", building: "Castle" });
    expect(w.rows).toEqual([{ choiceId: NAIL.id, amount: 500, productId: null }, { choiceId: BINS.id, amount: null, productId: null }]);
    expect([w.extraCost, w.building]).toEqual([null, null]);
  });
});

describe("quick form: the lines it becomes", () => {
  it("prices a square-foot choice from its Rate Card row, one line per row behind it", () => {
    const { lines } = buildPreliminary(choices, parseWork({ rows: [{ choiceId: NAIL_GLUE.id, amount: 400 }] }), new Map());
    expect(lines.map((l) => [l.sourceKind, l.sourceId, l.qty, l.unitPriceSnap, l.section])).toEqual([
      ["rate", "recRateNail0000AA", 400, 2, "Install"],
      ["rate", "recRateGlue0000AA", 400, 0.5, "Install"],
    ]);
  });

  it("counts a flat choice its set number of times, with no amount needed", () => {
    const { lines } = buildPreliminary(choices, parseWork({ rows: [{ choiceId: BINS.id }] }), new Map());
    expect(lines.map((l) => [l.qty, l.section, l.lineType])).toEqual([[2, "Disposal", "Disposal"]]);
  });

  it("prices a material from its standard product, or the one staff picked", () => {
    const std = buildPreliminary(choices, parseWork({ rows: [{ choiceId: MAT.id, amount: 300 }] }), new Map()).lines[0];
    expect([std.sourceKind, std.sourceId, std.qty, std.unitPriceSnap, std.section]).toEqual(["product", STD.recordId, 300, 3, "Materials"]);
    const picked = buildPreliminary(choices, parseWork({ rows: [{ choiceId: MAT.id, amount: 300, productId: OTHER.recordId }] }), new Map([[OTHER.recordId, OTHER]])).lines[0];
    expect([picked.sourceId, picked.unitPriceSnap]).toEqual([OTHER.recordId, 5]);
  });

  it("prices a material with no product from the Material rate card row behind it, until a product is picked (2026-10-22)", () => {
    const row = buildPreliminary(choices, parseWork({ rows: [{ choiceId: MAT_ROW.id, amount: 100 }] }), new Map()).lines[0];
    expect([row.sourceKind, row.sourceId, row.qty, row.unitPriceSnap, row.unitCostSnap, row.section]).toEqual(["rate", "recRateCork0000AA", 100, 1.8, 1.4, "Materials"]);
    expect(choiceRate(MAT_ROW)).toEqual({ perUnit: 1.8, flat: 0 });
    expect(rowTotal(choices, { choiceId: MAT_ROW.id, amount: 100, productId: null }, new Map())).toBe(180);
    const picked = buildPreliminary(choices, parseWork({ rows: [{ choiceId: MAT_ROW.id, amount: 100, productId: OTHER.recordId }] }), new Map([[OTHER.recordId, OTHER]])).lines[0];
    expect([picked.sourceKind, picked.sourceId, picked.unitPriceSnap]).toEqual(["product", OTHER.recordId, 5]);
    expect(buildPreliminary(choices, parseWork({ rows: [{ choiceId: MAT_ROW.id }] }), new Map()).skipped).toEqual(["Cork (no amount)"]);
  });

  it("skips and names what it can't price, and adds the extra cost as its own line", () => {
    const r = buildPreliminary(choices, parseWork({ rows: [{ choiceId: NAIL.id }, { choiceId: MAT_UNSET.id, amount: 100 }, { choiceId: "recGone000000000A", amount: 1 }], extraCost: 250 }), new Map());
    expect(r.skipped).toEqual(["Nail down (no amount)", "Tiles (no product)", "a choice that's no longer on the form"]);
    // Private (2026-10-22): the customer sees it as the rolled-up "Additional work" row, never as a line.
    expect(r.lines.map((l) => [l.description, l.unitPrice, l.section])).toEqual([["Additional work", 250, "Private"]]);
  });

  it("totals the same way every quote does", () => {
    const { lines } = buildPreliminary(choices, parseWork({ rows: [{ choiceId: NAIL.id, amount: 100 }, { choiceId: BINS.id }, { choiceId: MAT.id, amount: 100 }] }), new Map());
    expect(optionTotals(lines, 0, false).preDiscount).toBe(100 * 2 + 2 * 300 + 100 * 3);
  });

  it("shows a choice's rate beside it: per unit, flat, or the product's", () => {
    expect(choiceRate(NAIL)).toEqual({ perUnit: 2, flat: 0 });
    expect(choiceRate(NAIL_GLUE)).toEqual({ perUnit: 2.5, flat: 0 });
    expect(choiceRate(BINS)).toEqual({ perUnit: null, flat: 600 });
    expect(choiceRate(MAT)).toEqual({ perUnit: 3, flat: 0 });
    expect(choiceRate(MAT, OTHER)).toEqual({ perUnit: 5, flat: 0 });
    expect(choiceRate(MAT_UNSET)).toEqual({ perUnit: null, flat: 0 });
    const mixed = choice({ id: "recMixed00000000A", times: 1, parts: [part({ recordId: "r1", rate: 1.25 }), part({ recordId: "r2", uom: "flat", rate: 150 })] });
    expect(choiceRate(mixed)).toEqual({ perUnit: 1.25, flat: 150 });
  });

  it("totals one row the way the quote will, minimum charge included, or nothing until it can be priced", () => {
    expect(rowTotal(choices, { choiceId: NAIL_GLUE.id, amount: 400, productId: null }, new Map())).toBe(1000);
    expect(rowTotal(choices, { choiceId: BINS.id, amount: null, productId: null }, new Map())).toBe(600);
    expect(rowTotal(choices, { choiceId: MAT.id, amount: 100, productId: OTHER.recordId }, new Map([[OTHER.recordId, OTHER]]))).toBe(500);
    expect(rowTotal(choices, { choiceId: NAIL.id, amount: null, productId: null }, new Map())).toBeNull();
    expect(rowTotal(choices, { choiceId: MAT_UNSET.id, amount: 100, productId: null }, new Map())).toBeNull();
    const withMin = choice({ id: "recMin0000000000A", parts: [part({ recordId: "rMin", rate: 2, minCharge: 500 })] });
    expect(rowTotal([withMin], { choiceId: withMin.id, amount: 10, productId: null }, new Map())).toBe(500);
  });

  it("labels each row's amount by what its price is per", () => {
    expect([amountUnit(NAIL), amountUnit(BINS), amountUnit(MAT)]).toEqual(["sqft", null, "sqft"]);
    expect(amountUnit(choice({ id: "x", parts: [part({ recordId: "r", uom: "linear ft" })] }))).toBe("linear ft");
  });
});

describe("quick form: staircases (2026-10-20)", () => {
  const MAIN = { id: "recProfMain00000A", name: "Wood on main stairs", type: "Main stairs" as const, method: "Solid red oak caps" as const, steps: 13, price: 4000, cost: 2600 };
  const HALF = { id: "recProfHalf00000A", name: "Half staircase, sanded", type: "Half staircase" as const, method: "Sand & stain" as const, steps: 5, price: 700, cost: 400 };
  const profiles = new Map([MAIN, HALF].map((p) => [p.id, p]));

  it("keeps a staircase's profile id, and a typed price only as an override; anything else is dropped", () => {
    const w = parseWork({ stairs: [{ profileId: MAIN.id, price: 4500 }, { profileId: HALF.id }, { profileId: "nope", price: 1 }, { type: "Townhome", method: "Vinyl treads", price: 10 }, "x"] });
    expect(w.stairs).toEqual([{ profileId: MAIN.id, price: 4500 }, { profileId: HALF.id, price: null }]);
    expect(parseWork({ stairs: Array(5).fill({ profileId: MAIN.id }) }).stairs).toHaveLength(3);
  });

  it("prices each staircase from its profile's preset, with the row as the line's source, or the override when typed", () => {
    const { lines, skipped } = buildPreliminary(choices, parseWork({ stairs: [{ profileId: MAIN.id }, { profileId: HALF.id, price: 650 }] }), new Map(), profiles);
    expect(skipped).toEqual([]);
    expect(lines.map((l) => [l.section, l.lineType, l.sourceKind, l.sourceId, l.uom, l.qty, l.unitPriceSnap, l.unitCostSnap, l.unitPrice, l.description, l.hasSource])).toEqual([
      ["Stairs", "Stairs", "profile", MAIN.id, "each", 1, 4000, 2600, null, "Wood on main stairs", true],
      ["Stairs", "Stairs", "profile", HALF.id, "each", 1, 700, 400, 650, "Half staircase, sanded", true],
    ]);
    expect(optionTotals(lines, 0, false).preDiscount).toBe(4000 + 650);
    expect([stairTotal(MAIN, null), stairTotal(MAIN, 4500)]).toEqual([4000, 4500]);
  });

  it("skips and names a profile that is no longer on the form", () => {
    const r = buildPreliminary(choices, parseWork({ stairs: [{ profileId: "recGone000000000A" }] }), new Map(), profiles);
    expect(r.lines).toEqual([]);
    expect(r.skipped).toEqual(["a staircase profile that's no longer on the form"]);
  });

  it("counts a staircase as work, and no longer offers a Staircase group of choices", () => {
    expect(workIsEmpty(parseWork({ stairs: [{ profileId: MAIN.id }] }))).toBe(false);
    expect(workIsEmpty(parseWork({}))).toBe(true);
    expect([...QUICK_GROUPS]).not.toContain("Staircase");
  });
});

describe("quick form: baseboards follow the install (2026-10-22)", () => {
  it("defaults to a third of the install square feet, rounded to the nearest foot", () => {
    expect([100, 500, 950, 20, 7].map(baseboardDefault)).toEqual([33, 167, 317, 7, 2]);
    expect([null, 0].map(baseboardDefault)).toEqual([null, null]);
    expect(BASEBOARD_PER_SQFT).toBeCloseTo(1 / 3);
  });

  it("fills a blank amount, and moves one still at the old default when the install changes", () => {
    expect(baseboardFollow("", null, 600)).toBe("200");
    expect(baseboardFollow("200", 600, 900)).toBe("300");
    expect(baseboardFollow(" 200 ", 600, 900)).toBe("300");
  });

  it("never touches an amount staff typed, even when the install changes or goes away", () => {
    expect(baseboardFollow("150", 600, 900)).toBeNull();
    expect(baseboardFollow("150", 600, null)).toBeNull();
    expect(baseboardFollow("150", null, 600)).toBeNull();
  });

  it("blanks the default again when the install is cleared, and leaves a blank alone", () => {
    expect(baseboardFollow("200", 600, null)).toBe("");
    expect(baseboardFollow("", 600, null)).toBeNull();
    expect(baseboardFollow("", null, null)).toBeNull();
  });
});
