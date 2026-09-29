/**
 * The browse screen on the home page (search box empty): Suppliers or Product types, then one
 * level down, then the collections list (the grouped search with supplier + category set).
 * Pure, so it is unit-tested; counts come from api.catalogue_browse.
 */
import { EMPTY_FILTERS, type Filters } from "@/lib/db/filters";
import type { BrowseRow } from "@/lib/db/types";

/** Product types as staff say them. Each is one or more catalogue categories. */
export const PRODUCT_TYPES = [
  { label: "Vinyl", categories: ["LVP", "LVT"] },
  { label: "Laminate", categories: ["Laminate"] },
  { label: "Engineered hardwood", categories: ["Engineered hardwood"] },
  { label: "Solid hardwood", categories: ["Solid hardwood"] },
  { label: "Tile & stone", categories: ["Tile / Stone", "STONE"] },
  { label: "Carpet", categories: ["Carpet"] },
  { label: "Accessories", categories: ["Accessory"] },
] as const;

export type ProductType = { label: string; categories: string[] };

/** The type a category belongs to; a category not listed above is a type of its own. */
export function typeOf(category: string): ProductType {
  const t = PRODUCT_TYPES.find((p) => (p.categories as readonly string[]).includes(category));
  return t ? { label: t.label, categories: [...t.categories] } : { label: category, categories: [category] };
}

/** The type whose categories are exactly `cats` (any order), or null. */
export function typeForCategories(cats: string[]): ProductType | null {
  if (!cats.length) return null;
  const t = typeOf(cats[0]);
  const same = t.categories.length === cats.length && cats.every((c) => t.categories.includes(c));
  return same ? t : null;
}

export type Tile = { key: string; label: string; products: number; collections: number; sub: string[] };

const order = (label: string) => {
  const i = PRODUCT_TYPES.findIndex((p) => p.label === label);
  return i === -1 ? PRODUCT_TYPES.length : i;
};

function add(map: Map<string, Tile>, key: string, label: string, r: BrowseRow, sub: string) {
  const t = map.get(key) ?? { key, label, products: 0, collections: 0, sub: [] };
  t.products += r.products;
  t.collections += r.collections;
  if (!t.sub.includes(sub)) t.sub.push(sub);
  map.set(key, t);
}

/** Supplier tiles, A–Z, each with the product types it carries. */
export function supplierTiles(rows: BrowseRow[], type?: ProductType | null): Tile[] {
  const map = new Map<string, Tile>();
  for (const r of rows) {
    if (type && !type.categories.includes(r.category)) continue;
    add(map, r.supplier, r.supplier, r, typeOf(r.category).label);
  }
  for (const t of map.values()) t.sub.sort((a, b) => order(a) - order(b));
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Product-type tiles in the staff order above, each with how many suppliers carry it. */
export function typeTiles(rows: BrowseRow[], supplier?: string | null): Tile[] {
  const map = new Map<string, Tile>();
  for (const r of rows) {
    if (supplier && r.supplier !== supplier) continue;
    const t = typeOf(r.category);
    add(map, t.label, t.label, r, r.supplier);
  }
  return [...map.values()].sort((a, b) => order(a.label) - order(b.label) || a.label.localeCompare(b.label));
}

/** Every category a supplier carries (its "All types" view). */
export function supplierCategories(rows: BrowseRow[], supplier: string): string[] {
  return [...new Set(rows.filter((r) => r.supplier === supplier).map((r) => r.category))].sort();
}

/** What the home page shows for these filters: a browse level, or search results (null). */
export type BrowseLevel =
  | { level: "home" }
  | { level: "supplier"; supplier: string }
  | { level: "type"; type: ProductType };

/** True when only supplier/category are set: a browse position, not a search. */
function onlyBrowseFilters(f: Filters): boolean {
  return (
    !f.q.trim() && !f.all && !f.waterproof && !f.radiant && !f.pet && !f.hide &&
    f.min === null && f.max === null && f.tone_min === null && f.tone_max === null &&
    !f.undertone.length && !f.texture.length && !f.style.length && !f.busyness.length
  );
}

export function browseLevel(f: Filters): BrowseLevel | null {
  if (!onlyBrowseFilters(f)) return null;
  if (!f.supplier.length && !f.category.length) return { level: "home" };
  if (f.supplier.length === 1 && !f.category.length) return { level: "supplier", supplier: f.supplier[0] };
  const type = typeForCategories(f.category);
  if (!f.supplier.length && type) return { level: "type", type };
  return null;
}

export type Crumb = { label: string; filters: Filters };

/**
 * The trail above a drilled-down list: All › Supplier › Type (or All › Type › Supplier), each
 * step a way back. Only when the position is one supplier and/or one type (or a supplier's
 * "All types"); a hand-picked mix from the filter sheet gets no trail.
 */
export function crumbs(f: Filters, rows: BrowseRow[]): Crumb[] {
  const supplier = f.supplier.length === 1 ? f.supplier[0] : null;
  const type = typeForCategories(f.category);
  const allTypes = !!supplier && f.category.length > 0 && !type &&
    sameSet(f.category, supplierCategories(rows, supplier));
  if ((f.supplier.length && !supplier) || (f.category.length && !type && !allTypes)) return [];
  if (!supplier && !type) return [];

  const home: Filters = { ...EMPTY_FILTERS, by: f.by };
  const out: Crumb[] = [{ label: "All", filters: home }];
  const withSupplier: Filters = { ...home, supplier: supplier ? [supplier] : [] };
  const withType: Filters = { ...home, category: type ? type.categories : [] };
  if (f.by === "type" && type) {
    out.push({ label: type.label, filters: withType });
    if (supplier) out.push({ label: supplier, filters: { ...withType, supplier: [supplier] } });
  } else {
    if (supplier) out.push({ label: supplier, filters: withSupplier });
    if (type) out.push({ label: type.label, filters: { ...withSupplier, category: type.categories } });
    else if (allTypes) out.push({ label: "All types", filters: f });
  }
  return out;
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
