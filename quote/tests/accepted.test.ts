import { describe, expect, it } from "vitest";
import { optionTotals, type LineInput } from "../src/lib/calc";
import { atAcceptedPrice, atDiscountPct, impliedRate } from "../src/lib/pricing/accepted";

// INVENTED numbers only: this repo is public.
const line = (o: Partial<LineInput>): LineInput => ({
  lineType: "Install",
  section: "Install",
  include: true,
  qty: 100,
  waste: null,
  unitPrice: null,
  unitPriceSnap: 10,
  unitCostSnap: 6,
  costOverride: null,
  manualCost: null,
  minChargeSnap: null,
  hasSource: true,
  ...o,
});
// List 1,000 + 500 = 1,500; cost 600 + 200 = 800.
const lines = [line({}), line({ qty: 100, unitPriceSnap: 5, unitCostSnap: 2 })];

describe("accepted price (2026-10-22)", () => {
  it("finds the discount a pre-tax price implies against the list price", () => {
    expect(impliedRate(1500, 1350)).toBe(0.1);
    expect(impliedRate(1500, 1500)).toBe(0);
    expect(impliedRate(1500, 1600)).toBeCloseTo(-0.0667, 4);
    expect(impliedRate(0, 100)).toBeNull();
    expect(impliedRate(1500, -1)).toBeNull();
  });

  it("prices the option at that discount with the same maths as the quote", () => {
    const a = atAcceptedPrice(lines, true, 1350)!;
    expect(a.rate).toBe(0.1);
    expect(a.t).toEqual(optionTotals(lines, 0.1, true));
    expect([a.t.subtotal, a.t.cost, a.t.profit, a.t.marginPct, a.t.hst, a.t.total]).toEqual([1350, 800, 550, 40.7, 175.5, 1525.5]);
  });

  it("goes the other way from a typed percent, and refuses a discount of 100% or more", () => {
    const d = atDiscountPct(lines, false, 11)!;
    expect([d.rate, d.t.subtotal, d.t.hst]).toEqual([0.11, 1335, 0]);
    expect(atDiscountPct(lines, false, 100)).toBeNull();
    expect(atDiscountPct(lines, false, Number.NaN)).toBeNull();
  });

  it("has nothing to say about an option with nothing priced", () => {
    expect(atAcceptedPrice([], true, 500)).toBeNull();
  });
});
