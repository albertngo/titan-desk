import { describe, expect, it, vi } from "vitest";
vi.mock("../src/app/new/actions", () => ({ searchProductsAction: async () => [] }));
import { estimateWork, glueWait, initialWork, materialWaits, tiedMaterial, workInput, type WorkState } from "../src/components/QuickWork";
import type { QuickChoice, QuickPart, QuickProduct } from "../src/lib/quick/plan";

// INVENTED rates, ids and products only: this repo is public.
const part = (recordId: string, rate: number): QuickPart => ({ kind: "rate", recordId, labourType: "Install", spec: recordId, description: recordId, contractor: null, uom: "sqft", rate, cost: null, minCharge: null });
const PROD: QuickProduct = { recordId: "recProdEng0000000", sku: "STD-ENG", name: "Engineered plank", rate: 4, cost: null };
const TILE_PROD: QuickProduct = { recordId: "recProdTile000000", sku: "STD-TILE", name: "Porcelain tile", rate: 5, cost: null };
const MAT_ENG: QuickChoice = { id: "recMatEng00000000", group: "Material", label: "Engineered (3/4\")", sort: 1, times: 1, parts: [], product: PROD };
const MAT_TILE: QuickChoice = { id: "recMatTile0000000", group: "Material", label: "Porcelain Tiles", sort: 2, times: 1, parts: [], product: TILE_PROD };
const ENG_NAIL: QuickChoice = { id: "recEngNail0000000", group: "Install", label: "Engineered T&G (Nail Down)", sort: 3, times: 1, path: ["Engineered T&G", "Nail down"], parts: [part("recRateTG00000000", 2.3)], product: null, suggestMaterial: MAT_ENG.id };
const ENG_FULL: QuickChoice = { id: "recEngFull0000000", group: "Install", label: "Engineered T&G (Full Gluedown)", sort: 5, times: 1, path: ["Engineered T&G", "Full gluedown"], parts: [part("recRateFull000000", 2.3)], product: null, suggestMaterial: MAT_ENG.id };
const TILES: QuickChoice = { id: "recTiles000000000", group: "Install", label: "Tiles", sort: 8, times: 1, parts: [part("recRateTile000000", 15)], product: null, suggestMaterial: MAT_TILE.id };
const SAND: QuickChoice = { id: "recSand0000000000", group: "Install", label: "Sand and Stain", sort: 7, times: 1, parts: [part("recRateSand000000", 3)], product: null };
const choices = [MAT_ENG, MAT_TILE, ENG_NAIL, ENG_FULL, TILES, SAND];
const byId = new Map(choices.map((c) => [c.id, c]));

const withInstall = (choiceId: string, amount: string, more: Partial<WorkState["rows"][number]> = {}): WorkState => {
  const w = initialWork(choices);
  return { ...w, rows: w.rows.map((r) => (r.group === "Install" ? { ...r, choiceId, amount, ...more } : r)) };
};

describe("material tied to the install (Albert, 2026-11-06)", () => {
  it("has no Material section of its own", () => {
    expect(initialWork(choices).rows.map((r) => r.group)).toEqual(["Install"]);
  });

  it("starts Needed on the install's suggestion, Not needed when it has none", () => {
    expect(tiedMaterial(withInstall(ENG_NAIL.id, "820").rows[0], byId)).toEqual({ choiceId: MAT_ENG.id, product: null });
    expect(tiedMaterial(withInstall(SAND.id, "500").rows[0], byId)).toBeNull();
  });

  it("goes as a Material row at the install's square feet, which the server prices with the waste", () => {
    const w = withInstall(ENG_NAIL.id, "820");
    expect(workInput(w, choices).rows).toEqual([
      { choiceId: ENG_NAIL.id, amount: 820, productId: null },
      { choiceId: MAT_ENG.id, amount: 820, productId: null },
    ]);
    // 820 × 2.30 install + 820 × 1.10 × 4 material = 1,886 + 3,608.
    expect(estimateWork(choices, [], w).total).toBe(5494);
    // Change the install's square feet and the material follows.
    expect(workInput(withInstall(ENG_NAIL.id, "1000"), choices).rows[1].amount).toBe(1000);
  });

  it("Not needed sends no material; a product picked on the card goes with it", () => {
    expect(workInput(withInstall(ENG_NAIL.id, "820", { mat: null }), choices).rows).toHaveLength(1);
    const other = { recordId: "recProdOther00000", sku: "OTH", name: "Other plank", rate: 6 };
    const rows = workInput(withInstall(ENG_NAIL.id, "820", { mat: { choiceId: MAT_ENG.id, product: other } }), choices).rows;
    expect(rows[1]).toEqual({ choiceId: MAT_ENG.id, amount: 820, productId: other.recordId });
  });

  it("follows the new install's suggestion when the install type changes; a method change keeps it", () => {
    // The form clears `mat` on an install change, so the tile install's suggestion comes in.
    const changed = withInstall(TILES.id, "120", { mat: undefined });
    expect(tiedMaterial(changed.rows[0], byId)?.choiceId).toBe(MAT_TILE.id);
    // A method change keeps whatever was set on the row.
    const kept = withInstall(ENG_FULL.id, "820", { mat: { choiceId: MAT_TILE.id, product: null } });
    expect(tiedMaterial(kept.rows[0], byId)?.choiceId).toBe(MAT_TILE.id);
  });

  it("waits for a material that is Needed but not picked", () => {
    const w = withInstall(SAND.id, "500", { mat: { choiceId: "", product: null } });
    expect(materialWaits(choices, w)).toEqual(["Sand and Stain"]);
    expect(glueWait([], materialWaits(choices, w))).toBe("Pick the material: Sand and Stain.");
    expect(materialWaits(choices, withInstall(ENG_NAIL.id, "820"))).toEqual([]);
    expect(workInput(w, choices).rows).toHaveLength(1);
  });
});
