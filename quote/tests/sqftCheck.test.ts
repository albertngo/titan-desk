import { describe, expect, it } from "vitest";
import { sqftCheck, sqftFlag, sqftKey, sqftWords } from "../src/lib/quotes/sqftCheck";

// INVENTED quantities only.
const L = (o: Partial<{ section: string; uom: string; qty: number; waste: number | null; include: boolean; labourType: string | null; spec: string | null }>) => ({ section: "Install", uom: "sqft", qty: 0, waste: null, include: true, labourType: "Install", spec: "T&G", ...o });
const install = (qty: number) => L({ qty });
const material = (qty: number, waste = 0.1) => L({ section: "Materials", labourType: null, spec: null, qty, waste });

describe("material against the install (Albert, 2026-11-06)", () => {
  it("is in the band at 10 to 15% over, and flagged outside it", () => {
    expect(sqftCheck([install(820), material(820)])).toMatchObject({ install: 820, material: 902, inBand: true });
    expect(sqftCheck([install(820), material(820, 0.15)])?.inBand).toBe(true);
    expect(sqftCheck([install(820), material(650)])?.inBand).toBe(false);
    expect(sqftCheck([install(820), material(820, 0.3)])?.inBand).toBe(false);
  });

  it("checks nothing with no material, or no install", () => {
    expect(sqftCheck([install(820)])).toBeNull();
    expect(sqftCheck([material(500)])).toBeNull();
  });

  it("leaves refinishing, a stand-alone glue assist, other units and optional lines out of the install", () => {
    const lines = [install(500), L({ qty: 500, labourType: "Refinish" }), L({ qty: 500, spec: "GLUE ASSIST - Hardwood" }), L({ qty: 120, uom: "linear ft" }), L({ qty: 300, include: false }), material(500)];
    expect(sqftCheck(lines)).toMatchObject({ install: 500, material: 550, inBand: true });
  });

  it("is OK'd only for the exact figures; changing either brings the flag back", () => {
    const lines = [install(820), material(650)];
    const c = sqftCheck(lines)!;
    expect(c.key).toBe(sqftKey(820, 715));
    expect(sqftFlag(lines, null)).not.toBeNull();
    expect(sqftFlag(lines, c.key)).toBeNull();
    expect(sqftFlag([install(900), material(650)], c.key)).not.toBeNull();
    expect(sqftWords(c)).toBe("Material is 715 sf for 820 sf of install, 13% under. It is usually 10 to 15% over.");
  });
});
