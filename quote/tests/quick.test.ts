import { describe, expect, it } from "vitest";
import { optionTotals } from "../src/lib/calc";
import { amountUnit, buildPreliminary, parseWork, type QuickChoice, type QuickPart, type QuickProduct } from "../src/lib/quick/plan";

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
const choices = [NAIL, NAIL_GLUE, BINS, MAT, MAT_UNSET];

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

  it("skips and names what it can't price, and adds the extra cost as its own line", () => {
    const r = buildPreliminary(choices, parseWork({ rows: [{ choiceId: NAIL.id }, { choiceId: MAT_UNSET.id, amount: 100 }, { choiceId: "recGone000000000A", amount: 1 }], extraCost: 250 }), new Map());
    expect(r.skipped).toEqual(["Nail down (no amount)", "Tiles (no product)", "a choice that's no longer on the form"]);
    expect(r.lines.map((l) => [l.description, l.unitPrice, l.section])).toEqual([["Additional work", 250, "Other"]]);
  });

  it("totals the same way every quote does", () => {
    const { lines } = buildPreliminary(choices, parseWork({ rows: [{ choiceId: NAIL.id, amount: 100 }, { choiceId: BINS.id }, { choiceId: MAT.id, amount: 100 }] }), new Map());
    expect(optionTotals(lines, 0, false).preDiscount).toBe(100 * 2 + 2 * 300 + 100 * 3);
  });

  it("labels each row's amount by what its price is per", () => {
    expect([amountUnit(NAIL), amountUnit(BINS), amountUnit(MAT)]).toEqual(["sqft", null, "sqft"]);
    expect(amountUnit(choice({ id: "x", parts: [part({ recordId: "r", uom: "linear ft" })] }))).toBe("linear ft");
  });
});
