import { describe, expect, it } from "vitest";
import { optionTotals } from "../src/lib/calc";
import { buildCatalogue, materialChoices, rateSnap, type CardEntry } from "../src/lib/editor/model";
import type { StairProfileRow, StairRow } from "../src/lib/quotes/types";
import { amountUnit, basisAmount, MATERIAL_WASTE, materialWaste, PATTERN_WASTE, BASEBOARD_PER_SQFT, baseboardDefault, basisChoices, basisSqft, buildPreliminary, followBases, installTotal, remapBases, resolveBasis, TOTAL_BASIS, type BasisRow, choiceRate, distinctNames, MAX_QUICK_OPTIONS, optionName, parseWorks, parseWork, QUICK_GROUPS, browserProfiles, quickProfiles, rowTotal, stairAreas, workIsEmpty, materialDeltas, materialQuestion, pickMaterial, splitPath, topChoices, topOf, waterfall, type QuickChoice, type QuickPart, type QuickPartMaterial, type QuickProduct } from "../src/lib/quick/plan";

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
    // 10% material waste on top (2026-11-05).
    expect(rowTotal(choices, { choiceId: MAT_ROW.id, amount: 100, productId: null }, new Map())).toBe(198);
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
    expect(optionTotals(lines, 0, false).preDiscount).toBe(100 * 2 + 2 * 300 + 110 * 3);
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
    expect(rowTotal(choices, { choiceId: MAT.id, amount: 100, productId: OTHER.recordId }, new Map([[OTHER.recordId, OTHER]]))).toBe(550);
    expect(rowTotal(choices, { choiceId: NAIL.id, amount: null, productId: null }, new Map())).toBeNull();
    expect(rowTotal(choices, { choiceId: MAT_UNSET.id, amount: 100, productId: null }, new Map())).toBeNull();
    const withMin = choice({ id: "recMin0000000000A", parts: [part({ recordId: "rMin", rate: 2, minCharge: 500 })] });
    expect(rowTotal([withMin], { choiceId: withMin.id, amount: 10, productId: null }, new Map())).toBe(500);
  });

  it("labels each row's amount by what its price is per", () => {
    expect([amountUnit(NAIL), amountUnit(BINS), amountUnit(MAT)]).toEqual(["sqft", null, "sqft"]);
    expect(amountUnit(choice({ id: "x", parts: [part({ recordId: "r", uom: "linear ft" })] }))).toBe("linear ft");
    // Stair Items carry their own Unit (2026-11-04): ft reads as linear feet, steps / sets / pcs and no unit as a count.
    const stair = (uom: string | null) => amountUnit(choice({ id: "s", parts: [part({ recordId: "r", kind: "stair", uom })] }));
    expect([stair("ft"), stair("steps"), stair("pcs"), stair(null)]).toEqual(["linear ft", "pieces", "pieces", "pieces"]);
  });
});

describe("quick form: staircases (2026-10-20; Stair Item lines 2026-11-02)", () => {
  // Invented items, prices and ids only (quote/CLAUDE.md rule 4).
  const item = (id: string, name: string, category: string, rate: number, cost: number): StairRow => ({ id, name, category, size: null, rate, cost });
  const CAP = item("recCap0000000000A", "Step: Oak Cap", "step", 150, 70);
  const RISER = item("recRiser00000000A", "Riser", "riser", 15, 6);
  const SPINDLE = item("recSpindle000000A", "Iron Spindle", "railing", 25, 4);
  const SAND = item("recSand000000000A", "Task: Sand Steps", "task", 90, 40);
  const cat = buildCatalogue([], [CAP, RISER, SPINDLE, SAND]);
  const row = (id: string, p: Partial<StairProfileRow>): StairProfileRow => ({
    id,
    name: "Wood on main stairs",
    type: "Main stairs",
    method: "Solid red oak caps",
    steps: 13,
    price: 4000,
    cost: 2600,
    sort: 1,
    preset: { boxedSteps: null, openSideSteps: 0, curvedSteps: 0, handrailFt: 0, nosingFt: 0, landings: 0, spindles: 0, posts: 0 },
    template: { perStep: [], perStaircase: [], perOpenSide: [], perHandrailFt: [], perSpindle: [], perPost: [] },
    ...p,
  });
  const MAIN_ROW = row("recProfMain00000A", { template: { perStep: [CAP.id, RISER.id], perStaircase: [], perOpenSide: [], perHandrailFt: [], perSpindle: [SPINDLE.id], perPost: [] }, preset: { boxedSteps: null, openSideSteps: 0, curvedSteps: 0, handrailFt: 0, nosingFt: 0, landings: 0, spindles: 30, posts: 0 } });
  const HALF_ROW = row("recProfHalf00000A", { name: "Half staircase, sanded", type: "Half staircase", method: "Sand & stain", steps: 5, template: { perStep: [SAND.id], perStaircase: [], perOpenSide: [], perHandrailFt: [], perSpindle: [], perPost: [] } });
  const EMPTY_ROW = row("recProfEmpty0000A", { name: "Not set up", price: null });
  const UNLINKED_ROW = row("recProfUnlinked0A", { name: "Old preset", price: 3100, cost: 2000 });
  const GONE_ROW = row("recProfGone00000A", { name: "Links a dead item", template: { perStep: [CAP.id, "recGone000000000A"], perStaircase: [], perOpenSide: [], perHandrailFt: [], perSpindle: [], perPost: [] } });
  const offered = quickProfiles([MAIN_ROW, HALF_ROW, EMPTY_ROW, GONE_ROW, UNLINKED_ROW], cat);
  const profiles = new Map(offered.map((p) => [p.id, p]));
  const MAIN = profiles.get(MAIN_ROW.id)!;

  it("offers a profile only when every Stair Item it links is on the card, with its preset lines and their total", () => {
    expect(offered.map((p) => p.id)).toEqual([MAIN_ROW.id, HALF_ROW.id, UNLINKED_ROW.id]);
    expect(MAIN.storedPrice).toBe(false);
    expect(MAIN.lines.map((l) => [l.description, l.qty, l.unitPriceSnap, l.unitCostSnap])).toEqual([
      ["Step: Oak Cap", 13, 150, 70],
      ["Riser", 13, 15, 6],
      ["Iron Spindle", 30, 25, 4],
    ]);
    expect(MAIN.total).toBe(13 * 150 + 13 * 15 + 30 * 25);
  });

  it("keeps a row with no Stair Items linked at its stored price, one line and no typed price, until its links are set", () => {
    const old = profiles.get(UNLINKED_ROW.id)!;
    expect([old.storedPrice, old.total]).toEqual([true, 3100]);
    expect(old.lines.map((l) => [l.sourceKind, l.sourceId, l.unitPriceSnap, l.unitCostSnap, l.unitPrice])).toEqual([["profile", UNLINKED_ROW.id, 3100, 2000, null]]);
    expect(buildPreliminary(choices, parseWork({ stairs: [{ profileId: UNLINKED_ROW.id, price: 9999 }] }), new Map(), profiles).lines.map((l) => [l.description, l.unitPrice, l.area])).toEqual([["Old preset", null, "Main stairs"]]);
  });

  it("sends the browser charge rates only, never a cost", () => {
    const b = browserProfiles(offered);
    expect(b.flatMap((p) => p.lines.map((l) => l.unitCostSnap))).toEqual(b.flatMap((p) => p.lines.map(() => null)));
    expect(b[0].total).toBe(MAIN.total);
  });

  it("keeps a staircase's profile id and nothing else: a price sent with it is ignored", () => {
    const w = parseWork({ stairs: [{ profileId: MAIN.id, price: 4500 }, { profileId: HALF_ROW.id }, { profileId: "nope", price: 1 }, { type: "Townhome", method: "Vinyl treads", price: 10 }, "x"] });
    expect(w.stairs).toEqual([{ profileId: MAIN.id }, { profileId: HALF_ROW.id }]);
    expect(parseWork({ stairs: Array(5).fill({ profileId: MAIN.id }) }).stairs).toHaveLength(3);
  });

  it("adds each staircase's preset Stair Item lines, priced from the card, in the Stairs section", () => {
    const { lines, skipped } = buildPreliminary(choices, parseWork({ stairs: [{ profileId: MAIN.id }, { profileId: HALF_ROW.id }] }), new Map(), profiles);
    expect(skipped).toEqual([]);
    expect(lines.map((l) => [l.section, l.sourceKind, l.sourceId, l.qty, l.unitPriceSnap, l.unitPrice, l.area])).toEqual([
      ["Stairs", "stair", CAP.id, 13, 150, null, "Main stairs"],
      ["Stairs", "stair", RISER.id, 13, 15, null, "Main stairs"],
      ["Stairs", "stair", SPINDLE.id, 30, 25, null, "Main stairs"],
      ["Stairs", "stair", SAND.id, 5, 90, null, "Half staircase"],
    ]);
    expect(optionTotals(lines, 0, false).preDiscount).toBe(MAIN.total + 5 * 90);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  });

  it("numbers two staircases of the same type so the measure can tell them apart", () => {
    expect(stairAreas(["Main stairs", "Basement", "Main stairs"])).toEqual(["Main stairs 1", "Basement", "Main stairs 2"]);
    const { lines } = buildPreliminary(choices, parseWork({ stairs: [{ profileId: MAIN.id }, { profileId: MAIN.id }] }), new Map(), profiles);
    expect([...new Set(lines.map((l) => l.area))]).toEqual(["Main stairs 1", "Main stairs 2"]);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
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

describe("quick form: material waste (Albert, 2026-11-05)", () => {
  it("puts 10% on the line's Waste field, 15% for herringbone or tile, and keeps the floor's square feet as the quantity", () => {
    expect([MATERIAL_WASTE, PATTERN_WASTE]).toEqual([0.1, 0.15]);
    expect(["Laminate or Vinyl Click", "Herringbone (Vinyl)", "Porcelain Tiles", "Tile", "Versatile plank"].map((l) => materialWaste(l, null))).toEqual([0.1, 0.15, 0.15, 0.15, 0.1]);
    // A picked product that is herringbone counts too, whatever the choice is called.
    expect(materialWaste("Engineered (Click)", "Oak Herringbone 5in")).toBe(0.15);
    const std = buildPreliminary(choices, parseWork({ rows: [{ choiceId: MAT.id, amount: 300 }] }), new Map()).lines[0];
    expect([std.qty, std.waste]).toEqual([300, 0.1]);
    const hb = choice({ id: "recMatHb00000000A", group: "Material", label: "Herringbone (Eng)", product: STD });
    expect(buildPreliminary([hb], parseWork({ rows: [{ choiceId: hb.id, amount: 200 }] }), new Map()).lines[0].waste).toBe(0.15);
    expect(rowTotal([hb], { choiceId: hb.id, amount: 200, productId: null }, new Map())).toBe(690);
  });

  it("never puts waste on anything but a material", () => {
    const { lines } = buildPreliminary(choices, parseWork({ rows: [{ choiceId: NAIL.id, amount: 100 }, { choiceId: BINS.id }] }), new Map());
    expect(lines.map((l) => l.waste)).toEqual([null, null]);
  });
});

describe("quick form: material rows follow the install too (Albert, 2026-11-05)", () => {
  const install = (key: string, amount: string, choiceId = "hw"): BasisRow => ({ key, group: "Install", choiceId, amount });
  const mat = (key: string, basis: string | null, amount = ""): BasisRow => ({ key, group: "Material", choiceId: "m", amount, basis });
  const labelOf = (id: string) => ({ hw: "Hardwood", lv: "Laminate | Vinyl | Eng Click" })[id] ?? "";
  const all = () => true;

  it("takes the square feet themselves, not a third", () => {
    expect([basisAmount("Material", 820), basisAmount("Baseboards", 820), basisAmount("Material", null)]).toEqual([820, 273, null]);
    const rows = [install("i1", "500"), install("i2", "300", "lv"), mat("m1", TOTAL_BASIS), mat("m2", "i2")];
    expect(followBases(rows, all).slice(2).map((r) => r.amount)).toEqual(["800", "300"]);
  });

  it("offers one chip per Install row, worded without the third", () => {
    expect(basisChoices([install("i1", "820")], labelOf, "Material").map((c) => c.label)).toEqual(["820 sf"]);
    const many = basisChoices([install("i1", "2100", "lv"), install("i2", "500")], labelOf, "Material");
    expect(many.map((c) => [c.label, c.third])).toEqual([["2,600 sf (all install)", 2600], ["2,100 sf (Laminate | Vinyl | Eng Click)", 2100], ["500 sf (Hardwood)", 500]]);
  });

  it("leaves a typed material amount alone", () => {
    expect(followBases([install("i1", "500"), mat("m1", null, "450")], all)[1].amount).toBe("450");
  });
});

describe("quick form: baseboards follow the install (2026-10-22)", () => {
  it("defaults to a third of the install square feet, rounded to the nearest foot", () => {
    expect([100, 500, 950, 20, 7].map(baseboardDefault)).toEqual([33, 167, 317, 7, 2]);
    expect([null, 0].map(baseboardDefault)).toEqual([null, null]);
    expect(BASEBOARD_PER_SQFT).toBeCloseTo(1 / 3);
  });

});

describe("quick form: a basis per baseboard row (Albert, 2026-11-04)", () => {
  const install = (key: string, amount: string, choiceId = "hw"): BasisRow => ({ key, group: "Install", choiceId, amount });
  const board = (key: string, basis: string | null, amount = "", choiceId = "bb"): BasisRow => ({ key, group: "Baseboards", choiceId, amount, basis });
  const all = () => true;
  const labels: Record<string, string> = { hw: "Hardwood", lv: "Laminate / Vinyl" };
  const labelOf = (id: string) => labels[id] ?? "";

  it("adds every Install row's square feet into the total, ignoring rows with no choice or no number", () => {
    expect(installTotal([install("i1", "500"), install("i2", "1,200 "), install("i3", "300", ""), install("i4", "abc")])).toBe(1700);
    expect(installTotal([install("i1", "")])).toBeNull();
  });

  it("follows the total by default, live, as the install changes", () => {
    const rows = [install("i1", "600"), install("i2", "300", "lv"), board("b1", TOTAL_BASIS)];
    expect(followBases(rows, all)[2].amount).toBe("300");
    rows[0] = install("i1", "900");
    expect(followBases(rows, all)[2].amount).toBe("400");
  });

  it("follows one Install row when that one is picked", () => {
    const rows = [install("i1", "600"), install("i2", "300", "lv"), board("b1", "i2")];
    expect(followBases(rows, all)[2].amount).toBe("100");
    expect(basisSqft("i2", rows)).toBe(300);
  });

  it("leaves a typed amount (no basis) and a later row nobody pointed anywhere exactly as they are", () => {
    const rows = [install("i1", "600"), board("b1", null, "150"), board("b2", null)];
    const out = followBases(rows, all);
    expect(out[1]).toBe(rows[1]);
    expect(out[2]).toBe(rows[2]);
  });

  it("waits for a linear-foot choice before filling anything in", () => {
    const rows = [install("i1", "600"), board("b1", TOTAL_BASIS, "", "")];
    expect(followBases(rows, (r) => r.choiceId !== "")[1].amount).toBe("");
  });

  it("blanks the amount when the install it follows has no square feet any more", () => {
    expect(followBases([install("i1", ""), board("b1", TOTAL_BASIS, "200")], all)[1].amount).toBe("");
  });

  it("falls back to the total when the Install row it named is removed, or is the only one left", () => {
    expect(resolveBasis("i9", [install("i1", "600"), install("i2", "300")])).toBe(TOTAL_BASIS);
    expect(resolveBasis("i2", [install("i2", "300")])).toBe(TOTAL_BASIS);
    expect(resolveBasis("i2", [install("i1", "600"), install("i2", "300")])).toBe("i2");
    expect(resolveBasis(null, [install("i1", "600")])).toBeNull();
    expect(followBases([install("i1", "600"), board("b1", "gone")], all)[1].amount).toBe("200");
  });

  it("offers one chip for the total, and one per Install row once there are two or more", () => {
    expect(basisChoices([install("i1", "")], labelOf)).toEqual([]);
    expect(basisChoices([install("i1", "820")], labelOf).map((c) => c.label)).toEqual(["⅓ of 820 sf"]);
    const many = basisChoices([install("i1", "500"), install("i2", "320", "lv")], labelOf);
    expect(many.map((c) => c.label)).toEqual(["⅓ of 820 sf (all install)", "⅓ of 500 sf (Hardwood)", "⅓ of 320 sf (Laminate / Vinyl)"]);
    expect(many.map((c) => [c.basis, c.third])).toEqual([[TOTAL_BASIS, 273], ["i1", 167], ["i2", 107]]);
  });

  it("numbers two Install rows of the same choice, and writes thousands with a comma", () => {
    const c = basisChoices([install("i1", "1200"), install("i2", "300")], labelOf);
    expect(c.map((x) => x.label)).toEqual(["⅓ of 1,500 sf (all install)", "⅓ of 1,200 sf (Hardwood 1)", "⅓ of 300 sf (Hardwood 2)"]);
  });

  it("points a duplicated tab's rows at the copy's Install rows", () => {
    const keys = new Map([["i1", "c1"], ["b1", "c2"]]);
    const out = remapBases([install("c1", "600"), board("c2", "i1"), board("c3", TOTAL_BASIS), board("c4", null), board("c5", "i9")], keys);
    expect(out.map((r) => r.basis)).toEqual([undefined, "c1", TOTAL_BASIS, null, TOTAL_BASIS]);
  });
});

describe("the preliminary's option is named for what it installs (Albert, 2026-10-31)", () => {
  it("names it from the Install rows that made it on, never Preliminary", () => {
    const one = buildPreliminary(choices, parseWork({ rows: [{ choiceId: NAIL.id, amount: 400 }, { choiceId: BINS.id }] }), new Map());
    expect(one.name).toBe("Install Nail down");
    const two = buildPreliminary(choices, parseWork({ rows: [{ choiceId: NAIL.id, amount: 400 }, { choiceId: NAIL_GLUE.id, amount: 100 }, { choiceId: NAIL.id, amount: 50 }] }), new Map());
    expect(two.name).toBe("Install Nail down + Nail + glue");
  });

  it("leaves out an install row that was skipped", () => {
    const r = buildPreliminary(choices, parseWork({ rows: [{ choiceId: NAIL.id }, { choiceId: MAT.id, amount: 300 }] }), new Map());
    expect(r.name).toBe("Install Vinyl click");
  });

  it("tidies Airtable's labels, keeps a refinish's own words, and adds stairs", () => {
    expect(optionName(["Laminate | Vinyl | Eng Click", "Tiles"], [], false)).toBe("Install Laminate / Vinyl / Eng Click + Tiles");
    expect(optionName(["Sand and Stain Existing Hardwood"], ["Solid Hardwood"], true)).toBe("Sand and Stain Existing Hardwood + Stairs");
    expect(optionName(["Hardwood (Nail Down)", "Refinish (Buff And Polish Only)"], [], false)).toBe("Install Hardwood (Nail Down) + Refinish (Buff And Polish Only)");
  });

  it("falls back to the materials, then Stairs, then Flooring, and stays short", () => {
    expect(optionName([], ["Engineered (Click)"], false)).toBe("Install Engineered (Click)");
    expect(optionName([], [], true)).toBe("Stairs");
    expect(optionName([], [], false)).toBe("Flooring");
    expect(optionName(Array.from({ length: 9 }, (_, i) => `Long install choice ${i}`), [], false).length).toBeLessThanOrEqual(80);
  });
});

describe("several options from one quick form (Albert, 2026-10-31)", () => {
  it("reads every tab's work, drops empty ones, caps the count, and still takes the single work", () => {
    const one = { rows: [{ choiceId: NAIL.id, amount: 100 }] };
    expect(parseWorks({ works: [one, { rows: [] }, one] })).toHaveLength(2);
    expect(parseWorks({ works: Array.from({ length: 9 }, () => one) })).toHaveLength(MAX_QUICK_OPTIONS);
    expect(parseWorks({ work: one })).toHaveLength(1);
    expect(parseWorks({})).toEqual([]);
  });

  it("never gives two options the same name: the material first, then the number", () => {
    expect(distinctNames([
      { name: "Install Nail down", materials: ["Solid Hardwood"] },
      { name: "Install Nail down", materials: ["Engineered (3/4\")"] },
      { name: "Install Nail down", materials: ["Engineered (3/4\")"] },
      { name: "Stairs", materials: [] },
    ])).toEqual(["Install Nail down", "Install Nail down · Engineered (3/4\")", "Install Nail down (3)", "Stairs"]);
  });
});


describe("quick form: the waterfall, a choice then its options (Albert, 2026-11-06)", () => {
  // INVENTED: two woods, four methods each, a full-spread glue group of two and an assist group of two.
  const SPREAD: QuickPartMaterial = { group: "Glue - Full Spread", default: { id: "recGlueSpreadA0AA", name: "Spread A", price: 1.75, cost: 1.5 }, choices: [{ id: "recGlueSpreadB0AA", name: "Spread B", price: 0.8, cost: 0.6 }, { id: "recGlueSpreadA0AA", name: "Spread A", price: 1.75, cost: 1.5 }] };
  const ASSIST: QuickPartMaterial = { group: "Glue - Assist", default: { id: "recGlueAssistA0AA", name: "Assist A", price: 0.25, cost: 0.1 }, choices: [{ id: "recGlueAssistA0AA", name: "Assist A", price: 0.25, cost: 0.1 }, { id: "recGlueAssistB0AA", name: "Assist B", price: 0.5, cost: 0.3 }] };
  const tg = part({ recordId: "recRateTG000000AA", spec: "T&G", description: "Install | T&G", rate: 2.3, cost: 1.6 });
  const assist = part({ recordId: "recRateAssist00AA", spec: "GLUE ASSIST", description: "Install | GLUE ASSIST", rate: 0.5, cost: 0.3, material: ASSIST });
  const full = part({ recordId: "recRateFull0000AA", spec: "FULL GLUE", description: "Install | FULL GLUE", rate: 2.3, cost: 1.6, material: SPREAD });
  const fullNail = part({ recordId: "recRateFullNailAA", spec: "FULL GLUE NAIL", description: "Install | FULL GLUE NAIL", rate: 2.99, cost: 2.3, material: SPREAD });
  const fam = (wood: string, tag: string, sort0: number) => [
    choice({ id: `rec${tag}Nail00000AA`.slice(0, 17), label: `${wood} (Nail Down)`, sort: sort0, path: [wood, "Nail down"], parts: [tg] }),
    choice({ id: `rec${tag}Assist000AA`.slice(0, 17), label: `${wood} (Nail + Glue Assist)`, sort: sort0 + 1, path: [wood, "Nail + glue assist"], parts: [assist, tg] }),
    choice({ id: `rec${tag}Full00000AA`.slice(0, 17), label: `${wood} (Full Gluedown)`, sort: sort0 + 2, path: [wood, "Full gluedown"], parts: [full] }),
    choice({ id: `rec${tag}FullNail0AA`.slice(0, 17), label: `${wood} (Nail + Full Gluedown)`, sort: sort0 + 3, path: [wood, "Nail + full gluedown"], parts: [fullNail] }),
  ];
  const SOLID = fam("Solid Hardwood T&G", "Sol", 3);
  const ENG = fam("Engineered T&G", "Eng", 3);
  const CLICK = choice({ id: "recClick00000000A", label: "Laminate | Vinyl | Eng Click", sort: 1, parts: [part({ recordId: "recRateClick000AA" })] });
  const all = [CLICK, ...SOLID, ...ENG];

  it("reads a Path as its parts", () => {
    expect(splitPath(" Solid Hardwood T&G  >  Full gluedown ")).toEqual(["Solid Hardwood T&G", "Full gluedown"]);
    expect(splitPath("")).toEqual([]);
    expect(splitPath(null)).toEqual([]);
  });

  it("shows a family as one entry pointing at its first choice by Sort; a choice with no Path stays itself", () => {
    const tops = topChoices(all);
    expect(tops.map((t) => [t.label, t.choiceId, t.members.length])).toEqual([
      ["Laminate | Vinyl | Eng Click", CLICK.id, 1],
      ["Engineered T&G", ENG[0].id, 4],
      ["Solid Hardwood T&G", SOLID[0].id, 4],
    ]);
    expect(topOf(tops, SOLID[2].id)?.label).toBe("Solid Hardwood T&G");
    expect(topOf(tops, CLICK.id)?.key).toBe(CLICK.id);
  });

  it("offers the methods under the picked wood, the one in use on, each moving the row to a real choice", () => {
    expect(waterfall(all, CLICK.id)).toEqual([]);
    const levels = waterfall(all, SOLID[0].id);
    expect(levels).toHaveLength(1);
    expect(levels[0].options.map((o) => [o.label, o.choiceId, o.on])).toEqual([
      ["Nail down", SOLID[0].id, true],
      ["Nail + glue assist", SOLID[1].id, false],
      ["Full gluedown", SOLID[2].id, false],
      ["Nail + full gluedown", SOLID[3].id, false],
    ]);
    // Engineered's methods are its own, never the solid ones.
    expect(waterfall(all, ENG[2].id)[0].options.map((o) => o.choiceId)).toEqual(ENG.map((c) => c.id));
  });

  it("asks the type of glue only for a method that uses glue, starting on the Rate Card row's default", () => {
    expect(materialQuestion(SOLID[0], null)).toBeNull();
    const q = materialQuestion(SOLID[2], null)!;
    expect(q.label).toBe("Type of glue");
    expect(q.current?.id).toBe(SPREAD.default.id);
    expect(q.choices.map((m) => m.name)).toEqual(["Spread B", "Spread A"]);
    expect(materialQuestion(SOLID[2], "recGlueSpreadB0AA")!.current?.name).toBe("Spread B");
    // A glue from another group is ignored, never guessed: the default stays.
    expect(pickMaterial(full, "recGlueAssistB0AA")?.id).toBe(SPREAD.default.id);
  });

  it("prices the glue on top of the labour, one line named for it, and carries the glue to the editor", () => {
    const def = buildPreliminary(all, parseWork({ rows: [{ choiceId: SOLID[2].id, amount: 100 }] }), new Map()).lines;
    expect(def.map((l) => [l.description, l.unitPriceSnap, l.unitCostSnap, l.materialId])).toEqual([["Install | FULL GLUE · Spread A", 4.05, 3.1, SPREAD.default.id]]);
    const picked = buildPreliminary(all, parseWork({ rows: [{ choiceId: SOLID[2].id, amount: 100, materialId: "recGlueSpreadB0AA" }] }), new Map()).lines;
    expect(picked.map((l) => [l.description, l.unitPriceSnap, l.unitCostSnap, l.materialId])).toEqual([["Install | FULL GLUE · Spread B", 3.1, 2.2, "recGlueSpreadB0AA"]]);
    expect(rowTotal(all, { choiceId: SOLID[2].id, amount: 100, productId: null, materialId: "recGlueSpreadB0AA" }, new Map())).toBe(310);
    expect(choiceRate(SOLID[2], null, "recGlueSpreadB0AA")).toEqual({ perUnit: 3.1, flat: 0 });
    // Nail + glue assist: the glue goes on the assist line only; the T&G line stays labour.
    const nailGlue = buildPreliminary(all, parseWork({ rows: [{ choiceId: SOLID[1].id, amount: 100, materialId: "recGlueAssistB0AA" }] }), new Map()).lines;
    expect(nailGlue.map((l) => [l.sourceId, l.unitPriceSnap, l.materialId ?? null])).toEqual([
      ["recRateAssist00AA", 1, "recGlueAssistB0AA"],
      ["recRateTG000000AA", 2.3, null],
    ]);
    // Nail down has no glue line at all.
    expect(buildPreliminary(all, parseWork({ rows: [{ choiceId: SOLID[0].id, amount: 100 }] }), new Map()).lines[0].materialId).toBeUndefined();
  });

  it("says what each other glue adds or takes off against the one selected (2026-11-06)", () => {
    // "Provided by Client" is an ordinary $0 glue in the group.
    const CLIENT = { id: "recGlueClient00AA", name: "Provided by Client", price: 0, cost: 0 };
    const withClient = choice({ ...SOLID[2], parts: [part({ ...full, material: { ...SPREAD, choices: [...SPREAD.choices, CLIENT] } })] });
    const at = (id: string | null) => Object.fromEntries(materialDeltas(materialQuestion(withClient, id)!).map((d) => [d.id, d.delta]));
    expect(at("recGlueSpreadB0AA")).toEqual({ recGlueSpreadB0AA: 0, recGlueSpreadA0AA: 0.95, recGlueClient00AA: -0.8 });
    expect(at(CLIENT.id)).toEqual({ recGlueSpreadB0AA: 0.8, recGlueSpreadA0AA: 1.75, recGlueClient00AA: 0 });
    // Picked, it is the labour alone, named for who brings the glue.
    const l = buildPreliminary([withClient], parseWork({ rows: [{ choiceId: withClient.id, amount: 100, materialId: CLIENT.id }] }), new Map()).lines[0];
    expect([l.description, l.unitPriceSnap, l.unitCostSnap, l.materialId]).toEqual(["Install | FULL GLUE · Provided by Client", 2.3, 1.6, CLIENT.id]);
  });

  it("keeps the glue pick through the wire, and drops one that isn't a record id", () => {
    const w = parseWork({ rows: [{ choiceId: SOLID[2].id, amount: 100, materialId: "recGlueSpreadB0AA" }, { choiceId: SOLID[2].id, amount: 100, materialId: "glue" }] });
    expect(w.rows).toEqual([
      { choiceId: SOLID[2].id, amount: 100, productId: null, materialId: "recGlueSpreadB0AA" },
      { choiceId: SOLID[2].id, amount: 100, productId: null },
    ]);
  });

  it("prices the glue the same as the editor does at Standard, so the preliminary opens in the editor unchanged", () => {
    // The same invented row and glue as the editor's catalogue reads them.
    const cat: CardEntry[] = buildCatalogue(
      [{ id: "recRateFull0000AA", labourType: "Install", spec: "FULL GLUE", contractor: "Crew A", uom: "sqft", rate: 2.3, cost: 1.6, minCharge: null, defaultWaste: null, materialGroup: "Glue - Full Spread", defaultMaterialId: "recGlueSpreadA0AA" }],
      [],
      SPREAD.choices.map((m) => ({ id: m.id, name: m.name, group: SPREAD.group, cost: m.cost, price: m.price })),
    );
    const entry = cat[0] as Extract<CardEntry, { kind: "rate" }>;
    const line = buildPreliminary(all, parseWork({ rows: [{ choiceId: SOLID[2].id, amount: 100, materialId: "recGlueSpreadB0AA" }] }), new Map()).lines[0];
    const snap = rateSnap(entry, entry.contractors[0], line.materialId, "Standard");
    expect([snap.price, snap.cost]).toEqual([line.unitPriceSnap, line.unitCostSnap]);
    expect(materialChoices({ ...line, contractor: "Crew A" }, cat).current?.id).toBe("recGlueSpreadB0AA");
  });
});
