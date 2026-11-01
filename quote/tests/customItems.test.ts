import { describe, expect, it } from "vitest";
import { planTyped, reviewNote, sameName, typedLines, type CardRow } from "../src/lib/catalog/typed";
import type { QuoteLine } from "../src/lib/quotes/types";

/** Typed lines saved for next time and logged (Albert, 2026-11-01). Invented figures only. */

let seq = 0;
const line = (p: Partial<QuoteLine>): QuoteLine => ({
  id: `recLINE${String(++seq).padStart(10, "0")}`,
  lineType: "Other",
  section: "Other",
  include: true,
  qty: 10,
  waste: null,
  unitPrice: 5,
  unitPriceSnap: null,
  unitCostSnap: null,
  costOverride: 2,
  manualCost: null,
  minChargeSnap: null,
  hasSource: false,
  sourceKind: "manual",
  sourceId: null,
  labourType: null,
  spec: null,
  description: "Move a piano",
  area: null,
  uom: "each",
  contractor: null,
  clientNote: null,
  sortOrder: seq,
  airtableTotal: null,
  airtableCost: null,
  ...p,
});

describe("typed lines", () => {
  it("keeps priced typed lines with words, and only those", () => {
    const lines = [
      line({}),
      line({ sourceKind: "rate", sourceId: "recRATE0000000001", hasSource: true }),
      line({ description: "  " }),
      line({ unitPrice: null }),
      line({ section: "Private", description: "Additional cost" }),
      line({ section: "Exclusions", lineType: "Note", description: "Appliances by others" }),
    ];
    const got = typedLines([{ lines }]);
    expect(got.map((g) => g.lineId)).toEqual([lines[0].id]);
    expect(got[0]).toMatchObject({ table: "rate", laborType: "Other", description: "Move a piano", uom: "each", price: 5, cost: 2, material: false });
  });

  it("maps the section to the Rate Card's own Labor Type, a stairs line to Stair Items, and a material's cost to Material Cost", () => {
    const got = typedLines([
      { lines: [line({ section: "Removal" }), line({ section: "Materials", lineType: "Material" }), line({ section: "Stairs", lineType: "Stair" }), line({ section: "Delivery", uom: "trip" })] },
    ]);
    expect(got.map((g) => [g.table, g.laborType, g.material])).toEqual([
      ["rate", "Remove", false],
      ["rate", "Material", true],
      ["stair", null, false],
      ["rate", "Delivery", false],
    ]);
    // A unit the Rate Card doesn't offer is left blank, never invented.
    expect(got[3].uom).toBeNull();
  });
});

describe("planTyped", () => {
  const rates: CardRow[] = [{ id: "recRATEexisting01", laborType: "Other", name: "MOVE A PIANO" }];
  const stairs: CardRow[] = [{ id: "recSTAIRexisting1", laborType: null, name: "Paint spindles black" }];

  it("links a line to the row with the same name instead of making another", () => {
    const [a] = typedLines([{ lines: [line({ description: "Move a piano." })] }]);
    expect(planTyped([a], rates, stairs)).toEqual({ link: [{ lineId: a.lineId, table: "rate", rowId: "recRATEexisting01" }], create: [] });
  });

  it("matches a rate row by Labor Type too", () => {
    const [a] = typedLines([{ lines: [line({ section: "Install", description: "Move a piano" })] }]);
    expect(planTyped([a], rates, stairs).create).toHaveLength(1);
  });

  it("makes one new row for the same words typed twice, carrying both lines", () => {
    const [a, b, c] = typedLines([{ lines: [line({ description: "Level subfloor patch" }), line({ description: "level  subfloor patch" }), line({ section: "Stairs", description: "Paint spindles black" })] }]);
    const plan = planTyped([a, b, c], rates, stairs);
    expect(plan.create).toEqual([{ item: a, lineIds: [a.lineId, b.lineId] }]);
    expect(plan.link).toEqual([{ lineId: c.lineId, table: "stair", rowId: "recSTAIRexisting1" }]);
  });

  it("compares names ignoring case, spacing and punctuation, and never matches blank to blank", () => {
    expect(sameName('Baseboard 3.5" MDF', "baseboard 3.5 mdf")).toBe(true);
    expect(sameName("", "")).toBe(false);
  });

  it("says where a new row came from and what to check", () => {
    expect(reviewNote("Q-9001 v2", "staff@example.com", "2026-11-01")).toMatch(/Q-9001 v2.*staff@example\.com.*2026-11-01.*tick Active/);
  });
});
