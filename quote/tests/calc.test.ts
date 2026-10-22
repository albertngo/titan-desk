import { describe, expect, it } from "vitest";
import {
  chargesHst,
  lineCost,
  lineFlags,
  lineTotal,
  optionTotals,
  parityDiffs,
  round,
  SECTIONS,
  sectionOf,
  sectionTotals,
  type LineInput,
} from "../src/lib/calc";

// INVENTED numbers only. This repo is public: never put a real job, rate or customer here.
const L = (o: Partial<LineInput>): LineInput => ({
  lineType: "Install",
  section: "Install",
  include: true,
  qty: null,
  waste: null,
  unitPrice: null,
  unitPriceSnap: null,
  unitCostSnap: null,
  costOverride: null,
  manualCost: null,
  minChargeSnap: null,
  hasSource: true,
  ...o,
});

const removal = L({ section: "Removal", lineType: "Removal", qty: 200, unitPriceSnap: 2, unitCostSnap: 0.8 });
const install = L({ qty: 500, waste: 0.1, unitPriceSnap: 3, unitPrice: 2.8, unitCostSnap: 1.5 });
const stairs = L({ section: "Stairs", lineType: "Stairs", qty: 2, unitPriceSnap: 12, unitCostSnap: 5, minChargeSnap: 60 });
const delivery = L({ section: "Delivery", lineType: "Delivery", qty: 1, unitPrice: 150, manualCost: 90, hasSource: false });
const optional = L({ section: "Other", include: false, qty: 100, unitPriceSnap: 4, unitCostSnap: 1 });
const note = L({ lineType: "Note", section: "Install" });
const exclusion = L({ lineType: "Other", section: "Exclusions", qty: 1, unitPrice: 999 });
const job = [removal, install, stairs, delivery, optional, note, exclusion];

describe("sections", () => {
  it("follows Albert's order, Stairs after Install, with Other, Private (2026-10-22) and Exclusions last", () => {
    expect([...SECTIONS]).toEqual(["Install", "Stairs", "Removal", "Disposal", "Prep", "Materials", "Delivery", "Other", "Private", "Exclusions"]);
  });

  it("folds refinish, paint and sand lines into Install so nothing disappears; Stairs stands on its own (2026-10-18)", () => {
    for (const old of ["Refinish", "Paint", "Sand"]) expect(sectionOf({ section: old })).toBe("Install");
    expect(sectionOf({ section: "Stairs" })).toBe("Stairs");
    expect(sectionOf({ section: "Removal" })).toBe("Removal");
    expect(sectionOf({ section: null })).toBe("Unsorted");
    const s = sectionTotals([L({ section: "Refinish", qty: 10, unitPriceSnap: 3 }), L({ section: "Install", qty: 10, unitPriceSnap: 2 })]);
    expect(s.get("Install")).toBe(50);
    expect(s.has("Refinish")).toBe(false);
  });
});

describe("round (Airtable ROUND)", () => {
  it("rounds half away from zero and absorbs binary noise", () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(0.125, 2)).toBe(0.13);
    expect(round(-2.5, 0)).toBe(-3);
    expect(Object.is(round(-0.001, 2), 0)).toBe(true);
  });
});

describe("line maths", () => {
  it("prices card lines as qty x (1 + waste) x rate", () => {
    expect(lineTotal(removal)).toBe(400);
    expect(lineCost(removal)).toBe(160);
  });

  it("uses the rate override over the card, and waste on both price and cost", () => {
    expect(lineTotal(install)).toBe(1540); // 550 x 2.80
    expect(lineCost(install)).toBe(825); // 550 x 1.50
    expect(lineFlags(install)).toEqual(["OVR"]);
  });

  it("applies the minimum charge only when the line has a price below it", () => {
    expect(lineTotal(stairs)).toBe(60);
    expect(lineCost(stairs)).toBe(10);
    expect(lineTotal({ ...stairs, qty: 0 })).toBe(0);
  });

  it("lets Manual Cost win and flags a line with no source", () => {
    expect(lineCost(delivery)).toBe(90);
    expect(lineFlags(delivery)).toEqual(["NOSRC"]);
  });

  it("zeroes a line that is switched off, and blanks notes and exclusions", () => {
    expect(lineTotal(optional)).toBe(0);
    expect(lineCost(optional)).toBe(0);
    expect(lineTotal(note)).toBeNull();
    expect(lineTotal(exclusion)).toBeNull();
    expect(lineCost(exclusion)).toBeNull();
    expect(lineFlags(exclusion)).toEqual([]);
  });

  it("flags a line whose cost exceeds its price (a units mix-up)", () => {
    expect(lineFlags(L({ qty: 10, unitPriceSnap: 1, unitCostSnap: 100 }))).toContain("UNIT");
  });

  it("does not call a matching override an override", () => {
    expect(lineFlags(L({ qty: 1, unitPriceSnap: 5, unitPrice: 5, unitCostSnap: 2 }))).toEqual([]);
  });
});

describe("option totals", () => {
  it("takes the discount off before margin, then HST, then 35/35/remainder", () => {
    expect(optionTotals(job, 0.1, true)).toEqual({
      preDiscount: 2150,
      discount: -215,
      subtotal: 1935,
      cost: 1085,
      profit: 850,
      marginPct: 43.9,
      hst: 251.55,
      total: 2186.55,
      payment1: 765.29,
      payment2: 765.29,
      paymentFinal: 655.97,
    });
  });

  it("skips HST when it is off", () => {
    const t = optionTotals(job, 0.1, false);
    expect(t.hst).toBe(0);
    expect(t.total).toBe(1935);
    expect([t.payment1, t.payment2, t.paymentFinal]).toEqual([677.25, 677.25, 580.5]);
  });

  describe("HST per material line (2026-10-16)", () => {
    const floor = L({ section: "Materials", lineType: "Material", qty: 100, unitPriceSnap: 5, unitCostSnap: 3 }); // 500
    const floorNoHst = { ...floor, noHst: true };

    it("a material charges HST by its own choice; everything else follows the quote", () => {
      expect([chargesHst(floor, false), chargesHst(floorNoHst, true), chargesHst(removal, false), chargesHst(removal, true)]).toEqual([true, false, false, true]);
    });

    it("with every line taxed it is exactly 13% of the subtotal, as before", () => {
      const t = optionTotals([...job, floor], 0.1, true);
      expect(t.hst).toBe(Math.round(t.subtotal * 13) / 100);
    });

    it("HST off for the quote still charges it on a material, after the discount", () => {
      const t = optionTotals([...job, floor], 0.1, false);
      expect(t.subtotal).toBe(2385); // (2150 + 500) − 265
      expect(t.hst).toBe(58.5); // (500 − 50) × 13%
      expect(t.total).toBe(2443.5);
    });

    it("HST on for the quote leaves out a material set to no HST", () => {
      const t = optionTotals([...job, floorNoHst], 0.1, true);
      expect(t.hst).toBe(251.55); // only the job's lines, as in the first test
    });

    it("only Materials lines choose: no HST on a labour line is ignored", () => {
      expect(optionTotals([{ ...removal, noHst: true }], 0, true).hst).toBe(52); // 400 × 13%
    });
  });

  it("reports no margin on an empty option", () => {
    const t = optionTotals([note], 0, true);
    expect(t.subtotal).toBe(0);
    expect(t.marginPct).toBeNull();
    expect(t.discount).toBe(0);
  });

  it("subtotals by section", () => {
    const s = sectionTotals(job);
    expect(s.get("Install")).toBe(1540);
    expect(s.get("Stairs")).toBe(60); // the minimum charge
    expect(s.get("Exclusions")).toBe(0);
  });
});

describe("parity with Airtable", () => {
  const app = optionTotals(job, 0.1, true);

  it("passes when every figure agrees", () => {
    expect(parityDiffs(app, { ...app })).toEqual([]);
  });

  it("catches a one-cent difference", () => {
    const diffs = parityDiffs(app, { ...app, total: 2186.56 });
    expect(diffs.map((d) => d.key)).toEqual(["total"]);
  });

  it("treats a missing Airtable figure as a difference", () => {
    expect(parityDiffs(app, { ...app, hst: undefined }).map((d) => d.key)).toEqual(["hst"]);
  });
});
