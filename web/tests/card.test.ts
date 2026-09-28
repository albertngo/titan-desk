import { describe, expect, it } from "vitest";
import { boxPrice, groupTitle, priceRange, specChips, splitName, supplierIfDifferent } from "@/lib/card";

// Real names from the catalogue, one per naming pattern.
describe("splitName", () => {
  it("lifts the colour out of a flooring name and keeps the size apart", () => {
    expect(splitName('Purelux Betten Laminate — Banwell (7.72" x 14.3mm)', "Purelux", "LAM-PLUX-0009")).toEqual({
      line: "Purelux Betten Laminate", title: "Banwell", badge: null, detail: null, size: '7.72" x 14.3mm',
    });
  });

  it("turns a grade in brackets into a badge", () => {
    expect(splitName('Grandeur 6" EWO — Cocoa Beach (ABCD)', "Grandeur", "x")).toMatchObject({
      line: 'Grandeur 6" EWO', title: "Cocoa Beach", badge: "ABCD",
    });
    expect(splitName('Dragona 4.25" Summit II — Biscuit (Select & Better)', "Dragona", "x").badge).toBe("Select & Better");
  });

  it("reads a tile name as series, colour, then size and finish", () => {
    expect(splitName("Brick — WHITE (Gloss) — 7.87 x 11.81", "Olympia", "x")).toEqual({
      line: "Olympia Brick", title: "WHITE", badge: "Gloss", detail: "7.87 x 11.81", size: null,
    });
    expect(splitName("Floor & Decor Porcelain — Noor Statuario — 24 x 48 (Polished)", "Floor & Decor", "x")).toMatchObject({
      title: "Noor Statuario", detail: "24 x 48 (Polished)",
    });
  });

  it("shows a name that doesn't follow the pattern whole", () => {
    const n = "Canadian Standard - Sundry | Underpad | 3mm EVA foam";
    expect(splitName(n, "Canadian Standard", "x")).toEqual({ line: null, title: n, badge: null, detail: null, size: null });
    expect(splitName(null, null, "SKU-1").title).toBe("SKU-1");
  });

  it("does not repeat a brand the line already carries", () => {
    expect(splitName("IMPRESSIVE Regal — LINEN", "Impressive", "x").line).toBe("IMPRESSIVE Regal");
  });
});

describe("card helpers", () => {
  it("hides a supplier that is just the brand again", () => {
    expect(supplierIfDifferent("Purelux", "PURELUX")).toBeNull();
    expect(supplierIfDifferent("NAF", "FLOORS AT WORK")).toBe("FLOORS AT WORK");
  });

  it("builds spec chips from fields, skipping blanks", () => {
    expect(specChips({ width_in: 7.72, thickness_mm: 14.3, wear_layer_mil: null, install_profile: "Click", waterproof: true }))
      .toEqual(['7.72"', "14.3mm", "Click", "Waterproof"]);
    expect(specChips({ width_in: null, thickness_mm: null, wear_layer_mil: null, install_profile: null, waterproof: false })).toEqual([]);
    // a search served before migration 004 has none of these keys
    expect(specChips({} as Parameters<typeof specChips>[0])).toEqual([]);
  });

  it("titles a collection by its line, with the brand only when missing", () => {
    expect(groupTitle("Purelux Betten Laminate", "Purelux", "x")).toBe("Purelux Betten Laminate");
    expect(groupTitle("Brick", "Olympia", "x")).toBe("Olympia Brick");
    expect(groupTitle(null, "Olympia", "SKU-1")).toBe("SKU-1");
  });

  it("shows one price or a range", () => {
    expect(priceRange(2.99, 2.99, "sf")).toBe("$2.99 /sf");
    expect(priceRange(4.99, 5.79, "sf")).toBe("$4.99–$5.79 /sf");
    expect(priceRange(12, 12, "piece")).toBe("$12.00 /pc");
    expect(priceRange(null, null, "sf")).toBe("Price on request");
  });

  it("prices a box only for per-sf products with a box size", () => {
    expect(boxPrice(2.99, "sf", false, 19.52)).toBe(58.36);
    expect(boxPrice(2.99, "piece", false, 19.52)).toBeNull();
    expect(boxPrice(null, "sf", false, 19.52)).toBeNull();
    expect(boxPrice(2.99, "sf", true, 19.52)).toBeNull();
    expect(boxPrice(2.99, "sf", false, null)).toBeNull();
  });
});
