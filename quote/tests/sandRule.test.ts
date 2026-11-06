import { describe, expect, it } from "vitest";
import { SAND_DISCLAIMER, sandBlocks, sandFlag, sandRole, sandState } from "../src/lib/editor/sandRule";
import { manualLine, wasteMath } from "../src/lib/editor/model";
import { lineTotal } from "../src/lib/calc";

/* Sand steps → painted risers and stringers only (Albert, 2026-11-06). Item names as on the card; ids from src/lib/sitesheet/options.ts. */

const item = (id: string, name: string, category: string | null = null) => ({ id, name, category });
const SAND = item("recnYAG8K2Upy1rQR", "Keep Existing Steps (Sand + Stain)", "task");
const SKIN = item("recDTQT0pVFOWykrn", "2 Side Oak Skin (Glue and Stain)", "task");
const STR_PAINT = item("rec4dOhd8fcJfHYIh", "2 Side Paint (White)", "task");
const STR_SAND = item("recnEZHtLFbPFohsV", "2 Side Oak (Sand & Stain)", "task");
const NEW_RISER = item("rec0WAUmD4A8LowMB", "New Riser", "step");
const WHITE_RISER = item("recGmnXAUUEfi4pCp", "Paint Risers White", "riser");

const line = (x: { id: string; name: string; category: string | null }, include = true) => ({ sourceKind: "stair", sourceId: x.id, description: x.name, stairCategory: x.category, include, section: "Stairs" });

describe("sand steps take painted risers and white or sanded stringers only (2026-11-06)", () => {
  it("knows each item's part in the rule, by id first and then by name", () => {
    expect([SAND, SKIN, STR_PAINT, STR_SAND, NEW_RISER, WHITE_RISER].map(sandRole)).toEqual(["sand", "badStringer", null, null, "badRiser", null]);
    // Renamed or typed: the name still says it.
    expect(sandRole({ name: "Task: Sand Steps" })).toBe("sand");
    expect(sandRole({ name: "Main stairs – Sand & stain" })).toBe("sand");
    expect(sandRole({ name: "Stringers Oak Skin, Glue and Stain (per staircase)" })).toBe("badStringer");
    expect(sandRole({ name: "Stained riser", category: "riser" })).toBe("badRiser");
    expect(sandRole({ name: "Riser (Paint White)" })).toBeNull();
    expect(sandRole({ name: "Keep Nosing (Sand + Stain)" })).toBeNull();
    expect(sandRole({ name: "Step (2 Side Close)", category: "step" })).toBeNull();
  });

  it("greys out the clashing items once sanding is on the option, and sanding once a clashing item is", () => {
    const sanded = [line(SAND)];
    expect(sandBlocks(SKIN, sanded)).toMatch(/never glue and stain/);
    expect(sandBlocks(NEW_RISER, sanded)).toMatch(/painted white only/);
    expect(sandBlocks(STR_PAINT, sanded)).toBeNull();
    expect(sandBlocks(STR_SAND, sanded)).toBeNull();
    expect(sandBlocks(WHITE_RISER, sanded)).toBeNull();
    expect(sandBlocks(SAND, [line(SKIN)])).toMatch(/Not with/);
    expect(sandBlocks(SAND, [line(NEW_RISER)])).toMatch(/Not with/);
    expect(sandBlocks(SAND, [line(WHITE_RISER), line(STR_PAINT)])).toBeNull();
    // A line left out of the total doesn't count.
    expect(sandBlocks(SKIN, [line(SAND, false)])).toBeNull();
    expect(sandState([line(SAND), line(SKIN)])).toEqual({ sand: true, clash: true });
  });

  it("flags lines that clash anyway, and says nothing on an option that follows the rule", () => {
    const lines = [line(SAND), line(SKIN), line(WHITE_RISER)];
    expect(lines.map((l) => sandFlag(l, lines))).toEqual([expect.stringMatching(/Sand steps take/), expect.stringMatching(/Not with sanded steps/), null]);
    const fine = [line(SAND), line(STR_SAND), line(WHITE_RISER)];
    expect(fine.map((l) => sandFlag(l, fine))).toEqual([null, null, null]);
    // A preliminary's preset staircase line counts as sanding.
    const preset = { ...manualLine("Stairs", "Main stairs – Sand & stain"), sourceKind: "profile" as const };
    expect(sandFlag(line(NEW_RISER), [preset, line(NEW_RISER)])).toMatch(/painted white only/);
  });

  it("has one disclaimer, in plain words", () => {
    expect(SAND_DISCLAIMER).toMatch(/risers are painted white only/);
    expect(SAND_DISCLAIMER).toMatch(/painted white or sanded and stained/);
  });
});

describe("the material's math is shown (2026-11-06)", () => {
  it("typed + waste % = what is ordered, as calc.ts prices it", () => {
    expect(wasteMath({ qty: 820, waste: 0.1 })).toEqual({ typed: 820, pct: 10, actual: 902 });
    expect(wasteMath({ qty: 333, waste: 0.15 })).toEqual({ typed: 333, pct: 15, actual: 382.95 });
    expect(wasteMath({ qty: 100, waste: null })).toEqual({ typed: 100, pct: 0, actual: 100 });
    expect(wasteMath({ qty: null, waste: 0.1 })).toBeNull();
    const l = { ...manualLine("Materials", "Oak"), qty: 820, waste: 0.1, unitPrice: 5 };
    expect(lineTotal(l)).toBe(wasteMath(l)!.actual * 5);
  });
});
