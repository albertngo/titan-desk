import { describe, expect, it } from "vitest";
import { optionTotals } from "../src/lib/calc";
import { buildCatalogue } from "../src/lib/editor/model";
import { defaultInput, expandProfile } from "../src/lib/editor/stairBuilder";
import type { StairProfileRow, StairRow } from "../src/lib/quotes/types";

/* Invented items, prices and ids only (quote/CLAUDE.md rule 4). */

const item = (id: string, name: string, category: string, rate: number, cost: number | null = null): StairRow => ({ id, name, category, size: null, rate, cost });
const STEP = item("recStepClose0000A", "Step (2 Side Close)", "step", 160, 75);
const OPEN = item("recStepOpen00000A", "Step (Left Side Open)", "step", 205, 90);
const RISER = item("recRiser00000000A", "Riser", "riser", 12, 5);
const SAND = item("recSandSteps0000A", "Task: Sand Steps", "task", 140, 80);
const RAIL = item("recRail000000000A", "Task: Sand + Stain Handrail", "task", 10, 5);
const SPINDLE = item("recSpindle000000A", "Iron Spindles (w/material)", "railing", 27, 3);
const POST = item("recPost000000000A", "New Post", "railing", 170, 60);
const NOSING = item("recNosing0000000A", "Accents: Nosing", "accent", 25, 4);
const cat = buildCatalogue([], [STEP, OPEN, RISER, SAND, RAIL, SPINDLE, POST, NOSING]);

const profile = (template: Partial<StairProfileRow["template"]>, p: Partial<StairProfileRow> = {}): StairProfileRow => ({
  id: "recProf000000000A",
  name: "Wood on main stairs",
  type: "Main stairs",
  method: "Solid red oak caps",
  steps: 13,
  price: 4000,
  cost: 2600,
  sort: 1,
  template: { perStep: [], perStaircase: [], perOpenSide: [], perHandrailFt: [], perSpindle: [], perPost: [], ...template },
  ...p,
});

const WOOD = profile({ perStep: [STEP.id, RISER.id], perOpenSide: [OPEN.id], perStaircase: [NOSING.id], perHandrailFt: [RAIL.id], perSpindle: [SPINDLE.id], perPost: [POST.id] });

describe("the stair builder", () => {
  it("starts from the profile's step count and nothing else", () => {
    expect(defaultInput(WOOD)).toEqual({ steps: 13, openSideSteps: 0, handrailFt: 0, spindles: 0, posts: 0 });
    expect(defaultInput(profile({}, { steps: null })).steps).toBe(13);
  });

  it("multiplies each bucket by its count: per step, per staircase once, handrail feet, spindles, posts", () => {
    const r = expandProfile(WOOD, { steps: 13, openSideSteps: 0, handrailFt: 14, spindles: 26, posts: 2 }, cat);
    expect(r.missing).toEqual([]);
    expect(r.untemplated).toBe(false);
    expect(r.lines.map((l) => [l.description, l.qty, l.unitPriceSnap, l.section, l.sourceKind, l.sourceId, l.area])).toEqual([
      ["Step (2 Side Close)", 13, 160, "Stairs", "stair", STEP.id, "Main stairs"],
      ["Riser", 13, 12, "Stairs", "stair", RISER.id, "Main stairs"],
      ["Accents: Nosing", 1, 25, "Stairs", "stair", NOSING.id, "Main stairs"],
      ["Task: Sand + Stain Handrail", 14, 10, "Stairs", "stair", RAIL.id, "Main stairs"],
      ["Iron Spindles (w/material)", 26, 27, "Stairs", "stair", SPINDLE.id, "Main stairs"],
      ["New Post", 2, 170, "Stairs", "stair", POST.id, "Main stairs"],
    ]);
    expect(optionTotals(r.lines, 0, false).preDiscount).toBe(13 * 160 + 13 * 12 + 25 + 14 * 10 + 26 * 27 + 2 * 170);
  });

  it("gives open-side steps their own piece and takes them out of the plain steps, but not out of the risers", () => {
    const r = expandProfile(WOOD, { steps: 13, openSideSteps: 2, handrailFt: 0, spindles: 0, posts: 0 }, cat);
    expect(r.lines.map((l) => [l.description, l.qty])).toEqual([
      ["Step (2 Side Close)", 11],
      ["Riser", 13],
      ["Step (Left Side Open)", 2],
      ["Accents: Nosing", 1],
    ]);
    // More open-side steps than steps: every step is open-side, none plain.
    expect(expandProfile(WOOD, { steps: 4, openSideSteps: 9, handrailFt: 0, spindles: 0, posts: 0 }, cat).lines.map((l) => [l.description, l.qty])).toEqual([["Riser", 4], ["Step (Left Side Open)", 4], ["Accents: Nosing", 1]]);
  });

  it("keeps open-side steps in the plain count when the profile has no open-side step piece", () => {
    const sanded = profile({ perStep: [SAND.id, RISER.id], perOpenSide: [NOSING.id] });
    const r = expandProfile(sanded, { steps: 10, openSideSteps: 3, handrailFt: 0, spindles: 0, posts: 0 }, cat);
    expect(r.lines.map((l) => [l.description, l.qty])).toEqual([["Task: Sand Steps", 10], ["Riser", 10], ["Accents: Nosing", 3]]);
  });

  it("makes no line for a zero count, rounds counts to whole pieces, and never a negative", () => {
    const r = expandProfile(WOOD, { steps: 12.4, openSideSteps: -1, handrailFt: 0, spindles: 0.2, posts: Number.NaN }, cat);
    expect(r.lines.map((l) => [l.description, l.qty])).toEqual([["Step (2 Side Close)", 12], ["Riser", 12], ["Accents: Nosing", 1]]);
  });

  it("reports a linked item the card no longer offers instead of guessing, and a profile with no template at all", () => {
    const r = expandProfile(profile({ perStep: [STEP.id, "recGone000000000A"], perPost: ["recGone000000000A"] }), { steps: 3, openSideSteps: 0, handrailFt: 0, spindles: 0, posts: 2 }, cat);
    expect(r.lines.map((l) => l.description)).toEqual(["Step (2 Side Close)"]);
    expect(r.missing).toEqual(["recGone000000000A"]);
    const none = expandProfile(profile({}), { steps: 13, openSideSteps: 0, handrailFt: 0, spindles: 0, posts: 0 }, cat);
    expect([none.lines, none.untemplated]).toEqual([[], true]);
  });

  it("prices the pieces at the option's service level, like any Stair Item line", () => {
    const r = expandProfile(profile({ perStep: [STEP.id] }), { steps: 2, openSideSteps: 0, handrailFt: 0, spindles: 0, posts: 0 }, cat, "Premium");
    expect(r.lines[0].unitPriceSnap).toBe(184);
    expect(r.lines[0].unitCostSnap).toBe(75);
  });
});

describe("a Stair Item's unit cost (2026-10-31)", () => {
  it("is Labor Cost plus Material Cost, a blank counting as nothing, both blank as no cost", async () => {
    const { stairCost } = await import("../src/lib/pricing/stairCost");
    expect(stairCost(85, 100)).toBe(185);
    expect(stairCost(85, null)).toBe(85);
    expect(stairCost(null, 40)).toBe(40);
    expect(stairCost(4.1, 0.2)).toBe(4.3);
    expect(stairCost(null, null)).toBeNull();
  });
});
