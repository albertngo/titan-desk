import { describe, expect, it } from "vitest";
import { lineFlags, lineTotal } from "../src/lib/calc";
import { CLOSING_SENTENCE, METHOD_PHRASE, modifierFor, parseProfile, profileLine, profileName, profileOf, profileUses, profileWording, STAIR_METHODS, STAIR_TYPES, stairDescription, stairProfileLine, syncStairWording } from "../src/lib/quick/stairs";
import { blankQuote, manualLine } from "../src/lib/editor/model";

/* Invented prices only (quote/CLAUDE.md rule 4). The phrases are customer copy, not data. */

describe("stair profiles (2026-10-18)", () => {
  it("names a profile by its type and method, and reads the name back, nothing else", () => {
    for (const type of STAIR_TYPES) for (const method of STAIR_METHODS) expect(parseProfile(profileName({ type, method }))).toEqual({ type, method });
    expect(parseProfile("Main stairs - sand & stain")).toEqual({ type: "Main stairs", method: "Sand & stain" });
    expect(parseProfile("Main stairs · Vinyl treads")).toEqual({ type: "Main stairs", method: "Vinyl treads" });
    for (const bad of ["Main stairs", "Attic – Sand & stain", "Main stairs – Carpet", "Click install", "", null]) expect(parseProfile(bad)).toBeNull();
  });

  it("prices an unlinked Stair Profiles row at its stored figures, the row as the source, no typed price (2026-11-02)", () => {
    const row = { id: "recProf000000000A", name: "Wood on main stairs", type: "Main stairs" as const, method: "Solid red oak caps" as const, price: 4000, cost: 2600 };
    const l = profileLine(row);
    expect([l.section, l.lineType, l.sourceKind, l.sourceId, l.hasSource, l.uom, l.qty, l.unitPriceSnap, l.unitCostSnap, l.unitPrice, l.description]).toEqual(["Stairs", "Stairs", "profile", row.id, true, "each", 1, 4000, 2600, null, "Wood on main stairs"]);
    expect(lineTotal(l)).toBe(4000);
    expect(lineFlags(l)).toEqual([]);
    expect(profileOf(row)).toEqual({ type: "Main stairs", method: "Solid red oak caps" });
  });

  it("makes a flat, hand-priced line in the Stairs section with no card source (the fallback)", () => {
    const l = stairProfileLine("Basement", "Vinyl flooring", 950);
    expect([l.section, l.lineType, l.sourceKind, l.sourceId, l.hasSource, l.uom, l.qty, l.unitPrice, l.description]).toEqual(["Stairs", "Stairs", "manual", null, false, "flat", 1, 950, "Basement – Vinyl flooring"]);
    expect(lineTotal(l)).toBe(950);
    expect(lineFlags(l)).toEqual(["NOSRC"]);
    expect(stairProfileLine("Basement", "Vinyl flooring", null).unitPrice).toBeNull();
  });
});

describe("the stair description", () => {
  it("is empty when there are no staircases", () => {
    expect(stairDescription([])).toBe("");
  });

  it("gives each staircase its own bullet: its name, the method, then the stair type's sentence", () => {
    const d = stairDescription([{ type: "Main stairs", method: "Sand & stain" }]);
    expect(d).toBe(`* Main stairs – Sand & stain ${METHOD_PHRASE["Sand & stain"]} Up to 30 new spindles are included.`);
    expect(stairDescription([{ type: "Townhome", method: "Vinyl treads" }])).toBe(
      `* Townhome – Vinyl treads ${METHOD_PHRASE["Vinyl treads"]} The handrails will be sanded and refinished to match, and up to 50 spindles are included.`,
    );
  });

  it("adds nothing for a basement or half staircase, and closes with the posts-and-handrails sentence only then", () => {
    expect(modifierFor("Basement")).toBeNull();
    expect(modifierFor("Half staircase")).toBeNull();
    const d = stairDescription([
      { type: "Basement", method: "Vinyl flooring" },
      { type: "Half staircase", method: "Solid red oak caps" },
    ]);
    expect(d).toBe(`* Basement – Vinyl flooring ${METHOD_PHRASE["Vinyl flooring"]}\n* Half staircase – Solid red oak caps ${METHOD_PHRASE["Solid red oak caps"]}\n\n${CLOSING_SENTENCE}`);
  });

  it("drops the closing sentence as soon as any staircase got a sentence of its own", () => {
    const d = stairDescription([
      { type: "Basement", method: "Vinyl flooring" },
      { type: "Main stairs", method: "Vinyl flooring" },
    ]);
    expect(d.split("\n")).toHaveLength(2);
    expect(d).not.toContain(CLOSING_SENTENCE);
    expect(d).toContain("Up to 30 new spindles are included.");
  });

  it("keeps two staircases with the same method as two bullets, never merged", () => {
    const d = stairDescription([
      { type: "Main stairs", method: "Sand & stain" },
      { type: "Townhome", method: "Sand & stain" },
    ]);
    expect(d.match(/^\* /gm)).toHaveLength(2);
  });
});

describe("the wording follows the option's Stair Profile lines (2026-11-07)", () => {
  // Invented ids and names only (quote/CLAUDE.md rule 4).
  const MAIN = { id: "recProfMain00000A", name: "Wood on main stairs", type: "Main stairs" as const, method: "Solid red oak caps" as const, standardItemId: "recStdMain000000A" };
  const HALF = { id: "recProfHalf00000A", name: "Sand half staircase", type: "Half staircase" as const, method: "Sand & stain" as const, standardItemId: "recStdHalf000000A" };
  const BASE = { id: "recProfBase00000A", name: "Vinyl basement steps", type: "Basement" as const, method: "Vinyl flooring" as const, standardItemId: "recStdBase000000A" };
  const PROFILES = [MAIN, HALF, BASE];
  const std = (p: { standardItemId: string }, qty = 1, include = true) => ({ ...manualLine("Stairs", "x"), sourceKind: "stair" as const, sourceId: p.standardItemId, qty, include });

  it("names one profile, then its words", () => {
    expect(profileWording(profileUses([std(MAIN)], PROFILES))).toBe(`Wood on main stairs\n${METHOD_PHRASE["Solid red oak caps"]} Up to 30 new spindles are included.`);
  });

  it("makes each of several profiles clear: its name, a count when there are two, its words; the closing only when none had a sentence", () => {
    const uses = profileUses([std(MAIN), std(BASE), std(MAIN), std(HALF, 1, false)], PROFILES);
    expect(uses.map((u) => [u.name, u.count])).toEqual([["Wood on main stairs", 2], ["Vinyl basement steps", 1]]);
    const w = profileWording(uses);
    expect(w).toBe(`Wood on main stairs (× 2)\n${METHOD_PHRASE["Solid red oak caps"]} Up to 30 new spindles are included.\n\nVinyl basement steps\n${METHOD_PHRASE["Vinyl flooring"]}`);
    expect(profileWording(profileUses([std(BASE), std(HALF)], PROFILES)).endsWith(`\n\n${CLOSING_SENTENCE}`)).toBe(true);
    expect(profileWording([])).toBe("");
  });

  it("counts an older one-line preset of a profile too", () => {
    expect(profileUses([{ ...manualLine("Stairs", "Old"), sourceKind: "profile" as const, sourceId: MAIN.id, qty: 1 }], PROFILES).map((u) => u.name)).toEqual(["Wood on main stairs"]);
  });

  it("rewrites an option's wording when its staircases change, and keeps a typed edit otherwise", () => {
    const q0 = blankQuote();
    const opt = { ...q0.options[0], id: "opt1", description: "", lines: [std(MAIN)] };
    const before = { ...q0, options: [opt] };
    // A new option with staircases and no wording gets one.
    expect(syncStairWording({ ...q0, options: [] }, before, PROFILES).options[0].description).toContain("Wood on main stairs");
    // A typed edit with the same staircases stays.
    const typed = { ...before, options: [{ ...opt, description: "Our own words" }] };
    expect(syncStairWording(before, typed, PROFILES).options[0].description).toBe("Our own words");
    // Adding a staircase rewrites it with both.
    const added = { ...typed, options: [{ ...typed.options[0], lines: [std(MAIN), std(HALF)] }] };
    const w = syncStairWording(typed, added, PROFILES).options[0].description;
    expect(w).toContain("Wood on main stairs\n");
    expect(w).toContain("Sand half staircase\n");
    // Taking the last staircase off leaves the words for a person to clear.
    const none = { ...typed, options: [{ ...typed.options[0], lines: [] }] };
    expect(syncStairWording(typed, none, PROFILES).options[0].description).toBe("Our own words");
  });
});
