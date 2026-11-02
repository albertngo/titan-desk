import { describe, expect, it } from "vitest";
import { optionTotals } from "../src/lib/calc";
import { buildCatalogue } from "../src/lib/editor/model";
import { defaultInput, expandProfile, stepSplit, type BuilderInput } from "../src/lib/editor/stairBuilder";
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
const PIE = item("recPie0000000000A", "Pie Shape Step (Left)", "step", 205, 95);
const cat = buildCatalogue([], [STEP, OPEN, RISER, SAND, RAIL, SPINDLE, POST, NOSING, PIE]);

const profile = (template: Partial<StairProfileRow["template"]>, p: Partial<StairProfileRow> = {}): StairProfileRow => ({
  id: "recProf000000000A",
  name: "Wood on main stairs",
  type: "Main stairs",
  method: "Solid red oak caps",
  steps: 13,
  price: 4000,
  cost: 2600,
  sort: 1,
  preset: { boxedSteps: null, openSideSteps: 0, curvedSteps: 0, handrailFt: 0, nosingFt: 0, landings: 0, spindles: 0, posts: 0 },
  template: { perStep: [], perStaircase: [], perOpenSide: [], perHandrailFt: [], perSpindle: [], perPost: [], ...template },
  ...p,
});

const WOOD = profile({ perStep: [RISER.id], perBoxed: [STEP.id], perOpenSide: [OPEN.id], perCurved: [PIE.id], perStaircase: [NOSING.id], perHandrailFt: [RAIL.id], perSpindle: [SPINDLE.id], perPost: [POST.id] });
const input = (p: Partial<BuilderInput> = {}): BuilderInput => ({ steps: 13, boxedSteps: null, openSideSteps: 0, curvedSteps: 0, handrailFt: 0, nosingFt: 0, landings: 0, spindles: 0, posts: 0, ...p });

describe("the stair builder", () => {
  it("starts from the profile's step count and its preset counts (2026-11-02), blanks as nothing and boxed as the rest", () => {
    expect(defaultInput(WOOD)).toEqual(input());
    expect(defaultInput(profile({}, { steps: null })).steps).toBe(13);
    const preset = { boxedSteps: 9, openSideSteps: 1, curvedSteps: 3, handrailFt: 12, nosingFt: 4.5, landings: 1, spindles: 30, posts: 2 };
    expect(defaultInput(profile({}, { preset }))).toEqual({ steps: 13, ...preset });
  });

  it("splits the steps by type: open-side and curved as given, boxed as given or the rest, never more than the steps", () => {
    expect(stepSplit(input({ openSideSteps: 2, curvedSteps: 3 }))).toEqual({ steps: 13, boxed: 8, open: 2, curved: 3 });
    expect(stepSplit(input({ openSideSteps: 2, curvedSteps: 3, boxedSteps: 6 }))).toEqual({ steps: 13, boxed: 6, open: 2, curved: 3 });
    expect(stepSplit(input({ steps: 4, openSideSteps: 3, curvedSteps: 9 }))).toEqual({ steps: 4, boxed: 0, open: 3, curved: 1 });
  });

  it("counts each step type's own piece, what every step gets per step, and the rest by their counts", () => {
    const r = expandProfile(WOOD, input({ openSideSteps: 2, curvedSteps: 3, handrailFt: 14, spindles: 26, posts: 2 }), cat);
    expect(r.missing).toEqual([]);
    expect(r.untemplated).toBe(false);
    expect(r.lines.map((l) => [l.description, l.qty, l.unitPriceSnap, l.section, l.sourceKind, l.sourceId, l.area])).toEqual([
      ["Riser", 13, 12, "Stairs", "stair", RISER.id, "Main stairs"],
      ["Step (2 Side Close)", 8, 160, "Stairs", "stair", STEP.id, "Main stairs"],
      ["Step (Left Side Open)", 2, 205, "Stairs", "stair", OPEN.id, "Main stairs"],
      ["Pie Shape Step (Left)", 3, 205, "Stairs", "stair", PIE.id, "Main stairs"],
      ["Accents: Nosing", 1, 25, "Stairs", "stair", NOSING.id, "Main stairs"],
      ["Task: Sand + Stain Handrail", 14, 10, "Stairs", "stair", RAIL.id, "Main stairs"],
      ["Iron Spindles (w/material)", 26, 27, "Stairs", "stair", SPINDLE.id, "Main stairs"],
      ["New Post", 2, 170, "Stairs", "stair", POST.id, "Main stairs"],
    ]);
    expect(optionTotals(r.lines, 0, false).preDiscount).toBe(13 * 12 + 8 * 160 + 2 * 205 + 3 * 205 + 25 + 14 * 10 + 26 * 27 + 2 * 170);
  });

  it("never takes step types out of a Per step item, even one filed under category step (New Riser is)", () => {
    const riserAsStep = buildCatalogue([], [item(RISER.id, "New Riser", "step", 12, 5), STEP, OPEN]);
    const r = expandProfile(profile({ perStep: [RISER.id], perBoxed: [STEP.id], perOpenSide: [OPEN.id] }), input({ openSideSteps: 4 }), riserAsStep);
    expect(r.lines.map((l) => [l.description, l.qty])).toEqual([["New Riser", 13], ["Step (2 Side Close)", 9], ["Step (Left Side Open)", 4]]);
  });

  it("counts nosing by the foot, to one decimal (2026-11-02)", () => {
    const r = expandProfile(profile({ perNosingFt: [NOSING.id] }), input({ nosingFt: 4.46 }), cat);
    expect(r.lines.map((l) => [l.description, l.qty])).toEqual([["Accents: Nosing", 4.5]]);
    expect(expandProfile(profile({ perNosingFt: [NOSING.id] }), input(), cat).lines).toEqual([]);
  });

  it("counts landings by the landing (2026-11-02)", () => {
    const LANDING = item("recLanding000000A", "Landing (3x3)", "landing", 270, 120);
    const r = expandProfile(profile({ perLanding: [LANDING.id] }), input({ landings: 2 }), buildCatalogue([], [LANDING]));
    expect(r.lines.map((l) => [l.description, l.qty])).toEqual([["Landing (3x3)", 2]]);
  });

  it("makes no line for a zero count, rounds counts to whole pieces, and never a negative", () => {
    const r = expandProfile(WOOD, input({ steps: 12.4, openSideSteps: -1, spindles: 0.2, posts: Number.NaN }), cat);
    expect(r.lines.map((l) => [l.description, l.qty])).toEqual([["Riser", 12], ["Step (2 Side Close)", 12], ["Accents: Nosing", 1]]);
  });

  it("reports a linked item the card no longer offers instead of guessing, and a profile with no template at all", () => {
    const r = expandProfile(profile({ perBoxed: [STEP.id, "recGone000000000A"], perPost: ["recGone000000000A"] }), input({ steps: 3, posts: 2 }), cat);
    expect(r.lines.map((l) => l.description)).toEqual(["Step (2 Side Close)"]);
    expect(r.missing).toEqual(["recGone000000000A"]);
    const none = expandProfile(profile({}), input(), cat);
    expect([none.lines, none.untemplated]).toEqual([[], true]);
  });

  it("prices the pieces at the option's service level, like any Stair Item line", () => {
    const r = expandProfile(profile({ perBoxed: [STEP.id] }), input({ steps: 2 }), cat, "Premium");
    expect(r.lines[0].unitPriceSnap).toBe(184);
    expect(r.lines[0].unitCostSnap).toBe(75);
  });

  it("labels the lines with the stair type, or the area it is given", () => {
    expect(expandProfile(WOOD, input(), cat).lines.every((l) => l.area === "Main stairs")).toBe(true);
    expect(expandProfile(WOOD, input(), cat, "Standard", "Main stairs 2").lines.every((l) => l.area === "Main stairs 2")).toBe(true);
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
