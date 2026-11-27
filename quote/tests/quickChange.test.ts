import { describe, expect, it } from "vitest";
import { coLineAmount } from "@/lib/calc";
import { CO_SECTIONS, coLineProblem, type CoLine } from "@/lib/change/quick";

/** +C/O, the quick change order (Albert, 2026-11-27). Invented numbers only. */

const line = (over: Partial<CoLine> = {}): CoLine => ({ section: "Moulding", entryKey: null, description: "Quarter round", qty: 42, uom: "lf", rate: 3.5, credit: false, ...over });

describe("+C/O lines", () => {
  it("offers the mockup's sections", () => {
    expect([...CO_SECTIONS]).toEqual(["Install", "Moulding", "Materials", "Stairs", "Other"]);
  });
  it("adds work and takes off a credit, to the cent", () => {
    expect(coLineAmount(line())).toBe(147);
    expect(coLineAmount(line({ credit: true, qty: 18, rate: 10 }))).toBe(-180);
    expect(coLineAmount(line({ qty: 3, rate: 0.333 }))).toBe(1);
  });
  it("refuses a line that can't go on the change, in plain words", () => {
    expect(coLineProblem(line())).toBeNull();
    expect(coLineProblem(line({ section: "Private" }))).toBe("Pick a section for each line.");
    expect(coLineProblem(line({ description: "  " }))).toBe("Each line needs what it is.");
    expect(coLineProblem(line({ qty: 0 }))).toMatch(/quantity above zero/);
    expect(coLineProblem(line({ rate: -5 }))).toMatch(/rate above zero/);
    expect(coLineProblem(line({ qty: 1000, rate: 200 }))).toMatch(/full editor/);
    expect(coLineProblem(null)).toBe("A line is missing.");
  });
});
