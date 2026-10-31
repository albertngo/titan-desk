/**
 * A Stair Item's unit cost (Albert, 2026-10-31: "it's not accounting for the unit cost of the material either, so the
 * unit cost should combine them"): Labor Cost plus Material Cost, the same sum Airtable's Profit and Margin % formulas
 * on Stair Items subtract from Titan Rate. Either blank counts as nothing; both blank is no cost at all (null), so a
 * line never shows a margin it can't know. Pure; tested in tests/stairBuilder.test.ts.
 */
export function stairCost(labor: number | null, material: number | null): number | null {
  if (labor === null && material === null) return null;
  return Math.round(((labor ?? 0) + (material ?? 0)) * 100) / 100;
}
