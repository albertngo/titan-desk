import { describe, expect, it } from "vitest";
import { lineFlags, lineTotal } from "../src/lib/calc";
import { CLOSING_SENTENCE, METHOD_PHRASE, modifierFor, parseProfile, profileName, STAIR_METHODS, STAIR_TYPES, stairDescription, stairProfileLine } from "../src/lib/quick/stairs";

/* Invented prices only (quote/CLAUDE.md rule 4). The phrases are customer copy, not data. */

describe("stair profiles (2026-10-18)", () => {
  it("names a profile by its type and method, and reads the name back, nothing else", () => {
    for (const type of STAIR_TYPES) for (const method of STAIR_METHODS) expect(parseProfile(profileName({ type, method }))).toEqual({ type, method });
    expect(parseProfile("Main stairs - sand & stain")).toEqual({ type: "Main stairs", method: "Sand & stain" });
    expect(parseProfile("Main stairs · Vinyl treads")).toEqual({ type: "Main stairs", method: "Vinyl treads" });
    for (const bad of ["Main stairs", "Attic – Sand & stain", "Main stairs – Carpet", "Click install", "", null]) expect(parseProfile(bad)).toBeNull();
  });

  it("makes a flat, hand-priced line in the Stairs section with no card source", () => {
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
