import { describe, expect, it } from "vitest";
import { browseLevel, crumbs, supplierCategories, supplierTiles, typeForCategories, typeOf, typeTiles } from "@/lib/browse";
import { EMPTY_FILTERS, filtersFromSearchParams, filtersToSearchParams, type Filters } from "@/lib/db/filters";
import type { BrowseRow } from "@/lib/db/types";

const ROWS: BrowseRow[] = [
  { supplier: "VIDAR", category: "Engineered hardwood", products: 7, collections: 5 },
  { supplier: "BIYORK", category: "LVP", products: 40, collections: 6 },
  { supplier: "BIYORK", category: "Engineered hardwood", products: 20, collections: 4 },
  { supplier: "BIYORK", category: "Laminate", products: 10, collections: 2 },
  { supplier: "WODEN", category: "LVT", products: 3, collections: 1 },
  { supplier: "OLYMPIA TILE", category: "Tile / Stone", products: 3000, collections: 400 },
  { supplier: "CIF DISTRIBUTORS", category: "STONE", products: 5, collections: 5 },
  { supplier: "CIF DISTRIBUTORS", category: "Wall panel", products: 2, collections: 1 },
];

const f = (over: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...over });

describe("product types", () => {
  it("folds LVP and LVT into Vinyl and tile with stone", () => {
    expect(typeOf("LVT").label).toBe("Vinyl");
    expect(typeOf("STONE").categories).toEqual(["Tile / Stone", "STONE"]);
  });

  it("keeps an unknown category as its own type, never hidden", () => {
    expect(typeOf("Wall panel")).toEqual({ label: "Wall panel", categories: ["Wall panel"] });
  });

  it("recognises a type only from its exact category set", () => {
    expect(typeForCategories(["LVT", "LVP"])?.label).toBe("Vinyl");
    expect(typeForCategories(["LVP"])).toBeNull();
    expect(typeForCategories(["LVP", "Laminate"])).toBeNull();
  });
});

describe("tiles", () => {
  it("lists suppliers A–Z with their types in staff order", () => {
    const tiles = supplierTiles(ROWS);
    expect(tiles.map((t) => t.label)).toEqual(["BIYORK", "CIF DISTRIBUTORS", "OLYMPIA TILE", "VIDAR", "WODEN"]);
    expect(tiles[0]).toMatchObject({ products: 70, collections: 12, sub: ["Vinyl", "Laminate", "Engineered hardwood"] });
  });

  it("lists types in staff order, unknown ones last, with their suppliers", () => {
    const tiles = typeTiles(ROWS);
    expect(tiles.map((t) => t.label)).toEqual(["Vinyl", "Laminate", "Engineered hardwood", "Tile & stone", "Wall panel"]);
    expect(tiles[0]).toMatchObject({ products: 43, collections: 7, sub: ["BIYORK", "WODEN"] });
  });

  it("narrows to one supplier's types, or one type's suppliers", () => {
    expect(typeTiles(ROWS, "BIYORK").map((t) => t.label)).toEqual(["Vinyl", "Laminate", "Engineered hardwood"]);
    expect(supplierTiles(ROWS, typeOf("LVP")).map((t) => t.label)).toEqual(["BIYORK", "WODEN"]);
    expect(supplierCategories(ROWS, "BIYORK")).toEqual(["Engineered hardwood", "LVP", "Laminate"]);
  });
});

describe("browseLevel", () => {
  it("is the home tiles with nothing chosen", () => {
    expect(browseLevel(EMPTY_FILTERS)).toEqual({ level: "home" });
  });

  it("is one supplier's types, or one type's suppliers", () => {
    expect(browseLevel(f({ supplier: ["VIDAR"] }))).toEqual({ level: "supplier", supplier: "VIDAR" });
    expect(browseLevel(f({ category: ["LVP", "LVT"] }))).toMatchObject({ level: "type", type: { label: "Vinyl" } });
  });

  it("is the collections list once both are chosen, or on any search or other filter", () => {
    expect(browseLevel(f({ supplier: ["BIYORK"], category: ["LVP", "LVT"] }))).toBeNull();
    expect(browseLevel(f({ q: "oak" }))).toBeNull();
    expect(browseLevel(f({ waterproof: true }))).toBeNull();
    expect(browseLevel(f({ supplier: ["VIDAR"], all: true }))).toBeNull();
    expect(browseLevel(f({ supplier: ["VIDAR", "BIYORK"] }))).toBeNull();
  });
});

describe("crumbs", () => {
  it("follows the path taken: supplier first or type first", () => {
    const bySupplier = crumbs(f({ supplier: ["BIYORK"], category: ["LVP", "LVT"] }), ROWS);
    expect(bySupplier.map((c) => c.label)).toEqual(["All", "BIYORK", "Vinyl"]);
    expect(bySupplier[1].filters).toMatchObject({ supplier: ["BIYORK"], category: [], q: "" });

    const byType = crumbs(f({ by: "type", supplier: ["BIYORK"], category: ["LVP", "LVT"] }), ROWS);
    expect(byType.map((c) => c.label)).toEqual(["All", "Vinyl", "BIYORK"]);
    expect(byType[1].filters).toMatchObject({ supplier: [], category: ["LVP", "LVT"], by: "type" });
  });

  it("goes All the way back to the home tiles, clearing a search typed inside", () => {
    const [all] = crumbs(f({ q: "oak", supplier: ["BIYORK"], waterproof: true }), ROWS);
    expect(all.filters).toEqual(EMPTY_FILTERS);
  });

  it("names a supplier's All types view", () => {
    const trail = crumbs(f({ supplier: ["BIYORK"], category: supplierCategories(ROWS, "BIYORK") }), ROWS);
    expect(trail.map((c) => c.label)).toEqual(["All", "BIYORK", "All types"]);
  });

  it("shows no trail for a hand-picked mix from the filter sheet", () => {
    expect(crumbs(f({ supplier: ["BIYORK", "VIDAR"] }), ROWS)).toEqual([]);
    expect(crumbs(f({ category: ["LVP", "Laminate"] }), ROWS)).toEqual([]);
    expect(crumbs(EMPTY_FILTERS, ROWS)).toEqual([]);
  });
});

describe("the browse path in the URL", () => {
  it("round-trips by=type and leaves the default out", () => {
    const p = filtersToSearchParams(f({ by: "type", category: ["LVP", "LVT"] }));
    expect(p.get("by")).toBe("type");
    expect(filtersFromSearchParams(p).by).toBe("type");
    expect(filtersToSearchParams(EMPTY_FILTERS).has("by")).toBe(false);
  });
});
