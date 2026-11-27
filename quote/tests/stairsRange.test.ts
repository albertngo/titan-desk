import { describe, expect, it } from "vitest";
import { perStepStairs, priceRange, stairsRange } from "../src/lib/send/copy";
import { defaults } from "../src/lib/settings/registry";
import type { QuoteLine } from "../src/lib/quotes/types";

/* Invented numbers only (quote/CLAUDE.md rule 4). Vault 05_decisions/2026-11-27-quote-stairs-range. */

const L = (o: Partial<QuoteLine>): QuoteLine =>
  ({ lineType: "Stairs", section: "Stairs", include: true, qty: 1, waste: null, unitPrice: null, unitPriceSnap: 100, unitCostSnap: 50, costOverride: null, manualCost: null, minChargeSnap: null, hasSource: true, sourceKind: "stair", sourceId: "recStair00000000A", labourType: null, spec: null, description: "Tread", area: null, uom: null, contractor: null, clientNote: null, sortOrder: 1, airtableTotal: null, airtableCost: null, ...o }) as QuoteLine;

describe("stairs priced step by step go as a range down to a margin (2026-11-27)", () => {
  it("runs from the price at 40% margin up to the calculated price", () => {
    // $4,800 with $2,700 cost: at 40% the price is $4,500.
    expect(stairsRange({ subtotal: 4800, total: 4800, cost: 2700 }, 40)).toEqual({ low: 4500, high: 4800, lowWithHst: 4500, highWithHst: 4800 });
  });

  it("never goes more than 20% under the calculated price", () => {
    expect(stairsRange({ subtotal: 5000, total: 5000, cost: 1500 }, 40)?.low).toBe(4000);
  });

  it("keeps the usual range when the price is already near the margin", () => {
    expect(stairsRange({ subtotal: 4000, total: 4000, cost: 2450 }, 40)).toBeNull(); // 38.75%
    expect(stairsRange({ subtotal: 4000, total: 4000, cost: 0 }, 40)).toBeNull();
    expect(priceRange(4000)).toEqual({ low: 3850, high: 4400 });
  });

  it("puts HST on both ends the same way", () => {
    const r = stairsRange({ subtotal: 4800, total: 5424, cost: 2700 }, 40)!;
    expect([r.lowWithHst, r.highWithHst]).toEqual([5050, 5450]);
  });

  it("is only for Stair Items, never a Stair Profile's staircase", () => {
    expect(perStepStairs({ scope: "Stairs", lines: [L({})] })).toBe(true);
    expect(perStepStairs({ scope: "Stairs", lines: [L({ stairCategory: "Stair Profile" })] })).toBe(false);
    expect(perStepStairs({ scope: "Stairs", lines: [L({}), L({ sourceKind: "profile" })] })).toBe(false);
    expect(perStepStairs({ scope: "Flooring", lines: [L({ section: "Install", lineType: "Install", sourceKind: "rate" })] })).toBe(false);
  });

  it("starts at 40% for the range and a 35% floor", () => {
    expect([defaults({}).stairsRangeLowMargin, defaults({}).stairsMarginFloor]).toEqual([40, 35]);
  });
});
