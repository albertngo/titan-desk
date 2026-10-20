import { describe, expect, it } from "vitest";
import { optionTotals } from "../src/lib/calc";
import {
  amountUnit,
  buildPreliminary,
  choiceRate,
  GROUP_ROWS,
  installAreas,
  linearFtFromSqft,
  pairChoice,
  pairChoices,
  pairHasToggle,
  pairOf,
  pairRate,
  parseWork,
  QUICK_GROUPS,
  rowTotal,
  takesLinearDefault,
  workIsEmpty,
  type QuickChoice,
  type QuickPart,
  type QuickProduct,
} from "../src/lib/quick/plan";

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
    const w = parseWork({ rows: [{ choiceId: NAIL.id, amount: 500, unitPrice: 0.01 }, { choiceId: "nope", amount: 1 }, { choiceId: BINS.id, amount: -3 }], adjustment: "x", building: "Castle" });
    expect(w.rows).toEqual([{ choiceId: NAIL.id, amount: 500, productId: null }, { choiceId: BINS.id, amount: null, productId: null }]);
    expect([w.adjustment, w.building]).toEqual([null, null]);
  });

  it("keeps a custom item only with words and a price, and the private adjustment as a number (2026-10-20)", () => {
    const w = parseWork({ custom: [{ description: "  Move the piano ", price: 150 }, { description: "", price: 10 }, { description: "No price" }, "nope"], adjustment: 300 });
    expect(w.custom).toEqual([{ description: "Move the piano", price: 150 }]);
    expect(w.adjustment).toBe(300);
    expect(parseWork({ custom: Array(9).fill({ description: "x", price: 1 }) }).custom).toHaveLength(6);
    expect(workIsEmpty(parseWork({ custom: [{ description: "x", price: 1 }] }))).toBe(false);
    expect(workIsEmpty(parseWork({ adjustment: 5 }))).toBe(false);
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

  it("skips and names what it can't price; custom items are flat lines and the adjustment a private one", () => {
    const r = buildPreliminary(
      choices,
      parseWork({ rows: [{ choiceId: NAIL.id }, { choiceId: MAT_UNSET.id, amount: 100 }, { choiceId: "recGone000000000A", amount: 1 }], custom: [{ description: "Move the piano", price: 150 }], adjustment: 250 }),
      new Map(),
    );
    expect(r.skipped).toEqual(["Nail down (no amount)", "Tiles (no product)", "a choice that's no longer on the form"]);
    expect(r.lines.map((l) => [l.description, l.unitPrice, l.qty, l.uom, l.section, l.private ?? false])).toEqual([
      ["Move the piano", 150, 1, "flat", "Other", false],
      ["Private adjustment", 250, 1, "flat", "Other", true],
    ]);
    expect(optionTotals(r.lines, 0, false).preDiscount).toBe(400);
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

describe("quick form: mouldings with or without material (2026-10-20)", () => {
  const lf = (o: Partial<QuickPart> & { recordId: string }) => part({ labourType: "Install", uom: "linear ft", ...o });
  const BB_FULL = choice({ id: "recBbFull0000000A", group: "Baseboards", label: "Baseboard (Mat + Labor)", sort: 1, parts: [lf({ recordId: "rBbFull", rate: 2.7 })] });
  const BB_LAB = choice({ id: "recBbLab00000000A", group: "Baseboards", label: "Baseboard (Labor)", sort: 4, parts: [lf({ recordId: "rBbLab", rate: 1.7 })] });
  const SHOE_FULL = choice({ id: "recShoeFull00000A", group: "Baseboards", label: "Shoemould (Mat + Labor)", sort: 2, parts: [lf({ recordId: "rShFull", rate: 1.5 })] });
  const SHOE_LAB = choice({ id: "recShoeLab000000A", group: "Baseboards", label: "Shoemould (Labor)", sort: 5, parts: [lf({ recordId: "rShLab", rate: 1 })] });
  const BOTH_FULL = choice({ id: "recBothFull00000A", group: "Baseboards", label: "Baseboard + Shoe (Material + Labour)", sort: 3, parts: [lf({ recordId: "rBbFull", rate: 2.7 }), lf({ recordId: "rShFull", rate: 1.5 })] });
  const BOTH_LAB = choice({ id: "recBothLab000000A", group: "Baseboards", label: "baseboard + shoe (labour only)", sort: 6, parts: [lf({ recordId: "rBbLab", rate: 1.7 }), lf({ recordId: "rShLab", rate: 1 })] });
  const CROWN = choice({ id: "recCrown00000000A", group: "Baseboards", label: "Crown (Labor)", sort: 7, parts: [lf({ recordId: "rCrown", rate: 3 })] });
  const QR = choice({ id: "recQr00000000000A", group: "Baseboards", label: "Quarter round", sort: 8, parts: [lf({ recordId: "rQr", rate: 1.2 })] });
  const mouldings = [BB_FULL, SHOE_FULL, BOTH_FULL, BB_LAB, BOTH_LAB, SHOE_LAB, CROWN, QR];

  it("pairs a choice with its labour-only twin by label, in first-seen order, and leaves the rest alone", () => {
    const pairs = pairChoices(mouldings);
    expect(pairs.map((p) => [p.label, p.withMaterial?.id ?? null, p.labourOnly?.id ?? null, pairHasToggle(p)])).toEqual([
      ["Baseboard", BB_FULL.id, BB_LAB.id, true],
      ["Shoemould", SHOE_FULL.id, SHOE_LAB.id, true],
      ["Baseboard + Shoe", BOTH_FULL.id, BOTH_LAB.id, true],
      ["Crown (Labor)", null, CROWN.id, false],
      ["Quarter round", QR.id, null, false],
    ]);
  });

  it("sends the chosen half, and the only half when there is one", () => {
    const [bb, , , crown, qr] = pairChoices(mouldings);
    expect([pairChoice(bb, true).id, pairChoice(bb, false).id]).toEqual([BB_FULL.id, BB_LAB.id]);
    expect([pairChoice(crown, true).id, pairChoice(crown, false).id]).toEqual([CROWN.id, CROWN.id]);
    expect([pairChoice(qr, true).id, pairChoice(qr, false).id]).toEqual([QR.id, QR.id]);
    expect(pairOf(pairChoices(mouldings), BOTH_LAB.id)?.label).toBe("Baseboard + Shoe");
    expect(pairOf(pairChoices(mouldings), "recNope000000000A")).toBeNull();
  });

  it("reads labour and material off the two rows, and declines when they don't split", () => {
    const [bb, shoe, both, crown] = pairChoices(mouldings);
    expect(pairRate(bb)).toEqual({ labour: 1.7, material: 1 });
    expect(pairRate(shoe)).toEqual({ labour: 1, material: 0.5 });
    expect(pairRate(both)).toEqual({ labour: 2.7, material: 1.5 });
    expect(pairRate(crown)).toBeNull();
    const upsideDown = pairChoices([choice({ id: "recUpA0000000000A", label: "Odd (Mat + Labor)", parts: [lf({ recordId: "a", rate: 1 })] }), choice({ id: "recUpB0000000000A", label: "Odd (Labor)", parts: [lf({ recordId: "b", rate: 2 })] })]);
    expect(pairRate(upsideDown[0])).toBeNull();
  });

  it("offers three moulding rows, like the other work", () => {
    expect(GROUP_ROWS.Baseboards).toBe(3);
  });

  it("guesses a moulding's linear feet as a third of the flooring, in whole feet, area by area and together", () => {
    expect([linearFtFromSqft(900), linearFtFromSqft(1000), linearFtFromSqft(100.4)]).toEqual([300, 333, 33]);
    const rows = [
      { group: "Install" as const, choiceId: NAIL.id, amount: 900 },
      { group: "Install" as const, choiceId: NAIL_GLUE.id, amount: 250 },
      { group: "Install" as const, choiceId: NAIL.id, amount: null },
      { group: "Material" as const, choiceId: MAT.id, amount: 900 },
      { group: "Baseboards" as const, choiceId: BB_FULL.id, amount: null },
    ];
    expect(installAreas([...choices, ...mouldings], rows)).toEqual({
      areas: [
        { label: "Nail down", sqft: 900, linearFt: 300 },
        { label: "Nail + glue", sqft: 250, linearFt: 83 },
      ],
      sqft: 1150,
      linearFt: 383,
    });
    expect(installAreas(choices, [{ group: "Material", choiceId: MAT.id, amount: 900 }])).toBeNull();
    expect([takesLinearDefault(BB_FULL), takesLinearDefault(BB_LAB), takesLinearDefault(NAIL), takesLinearDefault(undefined)]).toEqual([true, true, false, false]);
  });
});

describe("quick form: staircases (2026-10-18)", () => {
  it("keeps a staircase with a type, a method and a price, and drops the rest without guessing", () => {
    const w = parseWork({
      stairs: [
        { type: "Townhome", method: "Vinyl treads", price: 1800 },
        { type: "Main stairs", method: "Sand & stain" },
        { type: "Attic", method: "Sand & stain", price: 10 },
        { type: "Basement", method: "Carpet", price: 10 },
        "nope",
      ],
    });
    expect(w.stairs).toEqual([{ type: "Townhome", method: "Vinyl treads", price: 1800 }]);
    expect(parseWork({ stairs: Array(5).fill({ type: "Basement", method: "Vinyl flooring", price: 1 }) }).stairs).toHaveLength(3);
  });

  it("turns each staircase into one flat Stairs line at the typed price, named by its profile", () => {
    const { lines, skipped } = buildPreliminary(choices, parseWork({ stairs: [{ type: "Main stairs", method: "Solid red oak caps", price: 2400 }] }), new Map());
    expect(skipped).toEqual([]);
    expect(lines.map((l) => [l.section, l.lineType, l.sourceKind, l.uom, l.qty, l.unitPrice, l.description])).toEqual([
      ["Stairs", "Stairs", "manual", "flat", 1, 2400, "Main stairs – Solid red oak caps"],
    ]);
    expect(optionTotals(lines, 0, false).preDiscount).toBe(2400);
  });

  it("counts a staircase as work, and no longer offers a Staircase group of choices", () => {
    expect(workIsEmpty(parseWork({ stairs: [{ type: "Basement", method: "Vinyl flooring", price: 900 }] }))).toBe(false);
    expect(workIsEmpty(parseWork({}))).toBe(true);
    expect([...QUICK_GROUPS]).not.toContain("Staircase");
  });
});
