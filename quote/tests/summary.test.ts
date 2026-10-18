import { describe, expect, it } from "vitest";
import type { CopyOption, CopySection } from "../src/lib/send/copy";
import { copyKind, flooringSummary, kindPhrase, quoteKind } from "../src/lib/send/summary";
import type { QuoteLine } from "../src/lib/quotes/types";

/* Invented numbers and names only (quote/CLAUDE.md rule 4). */

let seq = 0;
const line = (p: Partial<QuoteLine>): QuoteLine => ({
  id: `recLINE${String(++seq).padStart(10, "0")}`,
  lineType: "Install",
  section: "Install",
  include: true,
  qty: 100,
  waste: null,
  unitPrice: null,
  unitPriceSnap: 2,
  unitCostSnap: 1,
  costOverride: null,
  manualCost: null,
  minChargeSnap: null,
  hasSource: true,
  sourceKind: "rate",
  sourceId: "recRATE0000000001",
  labourType: "Install",
  spec: "Standard",
  description: "Click install",
  area: null,
  uom: "sqft",
  contractor: "Crew Alpha",
  clientNote: null,
  sortOrder: seq,
  airtableTotal: null,
  airtableCost: null,
  ...p,
});

const stair = line({ section: "Stairs", lineType: "Stairs", sourceKind: "manual", sourceId: null, hasSource: false, uom: "flat", qty: 1, unitPrice: 1200, unitPriceSnap: null, description: "Main stairs – Sand & stain" });
const extra = line({ section: "Other", lineType: "Other", sourceKind: "manual", sourceId: null, hasSource: false, uom: "flat", qty: 1, unitPrice: 300, unitPriceSnap: null, description: "Additional work" });

const item = (description: string, qty: number | null, uom: string | null, optional = false): CopySection["lines"][number] => ({
  kind: "item",
  n: optional ? null : 1,
  description,
  note: null,
  qty,
  uom,
  wastePct: null,
  unitPrice: 2,
  minimum: false,
  amount: 10,
  optional,
});
const section = (name: string, lines: CopySection["lines"]): CopySection => ({ name, total: 10, lines });
const copyOption = (sections: CopySection[]): CopyOption => ({ name: "Option", description: null, recommended: false, sections, exclusions: [], totals: { preDiscount: 0, discount: 0, subtotal: 0, hst: 0, total: 0, payment1: 0, payment2: 0, paymentFinal: 0 } });

describe("what a quote is for", () => {
  it("reads flooring, stairs, both or none from the included, priced lines", () => {
    expect(quoteKind({ lines: [line({})] })).toBe("flooring");
    expect(quoteKind({ lines: [stair] })).toBe("stairs");
    expect(quoteKind({ lines: [line({}), stair] })).toBe("both");
    expect(quoteKind({ lines: [] })).toBe("none");
    // An add-on, a note or an additional cost on its own decides nothing.
    expect(quoteKind({ lines: [line({ include: false }), line({ lineType: "Note", qty: null }), extra] })).toBe("none");
    expect(quoteKind({ lines: [extra, stair] })).toBe("stairs");
    // A Stair Item from the card, or an old line filed under Stairs, is stairs too.
    expect(quoteKind({ lines: [line({ sourceKind: "stair", section: "Install", lineType: "Install" })] })).toBe("stairs");
  });

  it("reads the same from a frozen copy, across its options", () => {
    const flooring = copyOption([section("Install", [item("Click install", 100, "sqft")])]);
    const stairs = copyOption([section("Stairs", [item("Main stairs – Sand & stain", 1, "flat")])]);
    expect(copyKind({ options: [flooring] })).toBe("flooring");
    expect(copyKind({ options: [stairs] })).toBe("stairs");
    expect(copyKind({ options: [flooring, stairs] })).toBe("both");
    expect(copyKind({ options: [copyOption([section("Stairs", [item("Nosing", 4, "piece", true)]), section("Other", [item("Extra", 1, "flat")])])] })).toBe("none");
  });

  it("words the quote by what it is for", () => {
    expect(kindPhrase("both", true)).toBe("preliminary flooring and stairs quote");
    expect(kindPhrase("stairs", false)).toBe("stair quote");
    expect(kindPhrase("flooring", false)).toBe("flooring quote");
    expect(kindPhrase("none", true)).toBe("preliminary quote");
  });
});

describe("the flooring summary", () => {
  it("names each section with its work and how much, totals a shared unit, and leaves stairs out", () => {
    const o = copyOption([
      section("Removal", [item("Carpet removal", 200, "sqft"), item("Tile removal", 50.5, "sqft")]),
      section("Stairs", [item("Main stairs – Sand & stain", 1, "flat")]),
      section("Prep", [item("Levelling", 30, "sqft")]),
      section("Install", [item("Click install", 220, "sqft"), item("Baseboard", 90, "linear ft"), item("Furniture moved by the homeowner", null, null), item("Nosing", 4, "piece", true)]),
      section("Delivery", [item("Delivery", 1, "flat")]),
    ]);
    expect(flooringSummary(o)).toEqual([
      "Removal: Carpet removal · 200 sq ft; Tile removal · 50.5 sq ft",
      "Total removal: 250.5 sq ft",
      "Subfloor prep: Levelling · 30 sq ft",
      "Install: Click install · 220 sq ft; Baseboard · 90 lin ft; Furniture moved by the homeowner",
      "Delivery: Delivery",
    ]);
  });

  it("skips sections with only add-ons or text, and is empty for a stairs-only quote", () => {
    expect(flooringSummary(copyOption([section("Install", [item("Nosing", 4, "piece", true), { kind: "text", text: "Note", note: null }])]))).toEqual([]);
    expect(flooringSummary(copyOption([section("Stairs", [item("Basement – Vinyl flooring", 1, "flat")])]))).toEqual([]);
  });
});
