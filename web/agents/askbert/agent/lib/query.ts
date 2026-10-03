/**
 * The catalogue search behind `query_catalogue`. Pure: argument binding and row mapping, no
 * client, so it is unit-tested directly.
 *
 * The SQL lives in the database (migration 006: api.askbert_search / api.askbert_relax) and runs
 * with the signed-in staff member's own rights. Model input only ever travels as typed function
 * arguments; it never becomes SQL text. Rows are mapped to the output key by key.
 */
import { MAX_LIMIT } from "./constants";
import type { ProductOut, QueryInput } from "./schema";

/** Filters in api.askbert_relax's result, in the same order as the migration. */
export const FILTER_NAMES = [
  "keyword", "sku", "categories", "brand", "suppliers", "price", "requires", "room", "colour",
  "undertone", "tone", "width", "wear_layer", "install", "availability", "promo",
] as const;

/** LIKE pattern from free text: metacharacters escaped, then wrapped. */
export function likePattern(text: string, mode: "contains" | "prefix" = "contains"): string {
  const esc = text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return mode === "prefix" ? `${esc}%` : `%${esc}%`;
}

const TONE: Record<NonNullable<QueryInput["tone"]>, [number, number]> = { light: [1, 2], medium: [3, 3], dark: [4, 5] };

/** Named arguments for api.askbert_search / api.askbert_relax. */
export type SearchArgs = {
  p_kw: string | null; p_kw_like: string | null; p_sku: string | null; p_cats: string[] | null;
  p_brand_like: string | null; p_sups: string[] | null; p_pmin: number | null; p_pmax: number | null;
  p_unit: "sf" | "piece"; p_req_wp: boolean; p_req_rad: boolean; p_req_pet: boolean; p_req_pad: boolean;
  p_room: string | null; p_colour_like: string | null; p_undertone: string | null;
  p_tone_min: number | null; p_tone_max: number | null; p_wmin: number | null; p_wmax: number | null;
  p_wear_min: number | null; p_install_like: string | null; p_availability: string; p_promo_only: boolean;
  p_sort: string; p_lim: number;
};

/** Validated input → function arguments. */
export function bindArgs(input: QueryInput): SearchArgs {
  const req = new Set(input.requires ?? []);
  const tone = input.tone ? TONE[input.tone] : null;
  return {
    p_kw: input.keyword ?? null,
    p_kw_like: input.keyword ? likePattern(input.keyword) : null,
    p_sku: input.sku ?? null,
    p_cats: input.categories ? [...input.categories] : null,
    p_brand_like: input.brand ? likePattern(input.brand) : null,
    p_sups: input.suppliers ? input.suppliers.map((s) => s.toUpperCase()) : null,
    p_pmin: input.price_min ?? null,
    p_pmax: input.price_max ?? null,
    p_unit: input.price_unit,
    p_req_wp: req.has("waterproof"),
    p_req_rad: req.has("radiant_heat"),
    p_req_pet: req.has("pet_friendly"),
    p_req_pad: req.has("underpad_attached"),
    p_room: input.room ?? null,
    p_colour_like: input.colour ? likePattern(input.colour) : null,
    p_undertone: input.undertone ?? null,
    p_tone_min: tone ? tone[0] : null,
    p_tone_max: tone ? tone[1] : null,
    p_wmin: input.width_min_in ?? null,
    p_wmax: input.width_max_in ?? null,
    p_wear_min: input.min_wear_layer_mil ?? null,
    p_install_like: input.install ? likePattern(input.install, "prefix") : null,
    p_availability: input.availability,
    p_promo_only: input.promo_only ?? false,
    p_sort: input.sort,
    p_lim: Math.min(Math.max(1, input.limit), MAX_LIMIT),
  };
}

/** Filters the model actually used, so relaxations only mention those. */
export function activeFilters(input: QueryInput): Set<string> {
  const on = new Set<string>();
  if (input.keyword) on.add("keyword");
  if (input.sku) on.add("sku");
  if (input.categories) on.add("categories");
  if (input.brand) on.add("brand");
  if (input.suppliers) on.add("suppliers");
  if (input.price_min != null || input.price_max != null) on.add("price");
  if (input.requires?.length) on.add("requires");
  if (input.room) on.add("room");
  if (input.colour) on.add("colour");
  if (input.undertone) on.add("undertone");
  if (input.tone) on.add("tone");
  if (input.width_min_in != null || input.width_max_in != null) on.add("width");
  if (input.min_wear_layer_mil != null) on.add("wear_layer");
  if (input.install) on.add("install");
  if (input.availability !== "any") on.add("availability");
  if (input.promo_only) on.add("promo");
  return on;
}

/** A row as api.askbert_search returns it (numerics as float8, dates as text). */
export type CatalogueRow = {
  sku: string; product_name: string | null; brand: string | null; supplier: string | null;
  supplier_sku: string | null; category: string | null; material_type: string | null;
  colour_tone: string | null; grade: string | null;
  retail_price: number | null; price_unit: "sf" | "piece"; price_on_request: boolean; promo_active: boolean;
  promo_ends: string | null; price_as_of: string | null; price_list_url: string | null;
  cost: number | null; map_price: number | null; pallet_price: number | null; promo_cost: number | null;
  rep_cost_active: boolean; rep_cost: number | null; rep_cost_end_date: string | null; rep_cost_note: string | null;
  volume_pricing_notes: string | null; salesperson_notes: string | null; internal_notes: string | null;
  stock_status: string | null; archived: boolean; coming_soon: boolean;
  width_in: number | null; thickness_mm: number | null; wear_layer_mil: number | null;
  ac_rating: string | null; install_profile: string | null; box_size_sf: number | null;
  waterproof_confirmed: boolean; radiant_heat_confirmed: boolean; pet_friendly_confirmed: boolean;
  underpad_included: boolean; suitable_rooms: string[] | null; thumb_url: string | null;
  total_matches: number | string;
};

const yes = (v: boolean) => (v ? "yes" : "not confirmed") as "yes" | "not confirmed";

/** Long free text is cut so ten rows stay a small payload. */
const NOTE_MAX = 300;
const clip = (s: string | null) => (s && s.length > NOTE_MAX ? `${s.slice(0, NOTE_MAX - 1)}…` : s);

/** One database row → one tool output product. Explicit keys only. */
export function toProduct(r: CatalogueRow): ProductOut {
  return {
    sku: r.sku,
    name: r.product_name,
    brand: r.brand,
    supplier: r.supplier,
    supplier_sku: r.supplier_sku,
    category: r.category,
    material: r.material_type,
    colour: r.colour_tone,
    grade: r.grade,
    price: { amount: r.price_on_request ? null : r.retail_price, unit: r.price_unit, on_request: r.price_on_request },
    promo: r.promo_active,
    promo_ends: r.promo_active ? r.promo_ends : null,
    price_as_of: r.price_as_of,
    price_list_url: r.price_list_url,
    cost: r.cost,
    map_price: r.map_price,
    pallet_price: r.pallet_price,
    promo_cost: r.promo_active ? r.promo_cost : null,
    rep_cost: r.rep_cost_active ? { amount: r.rep_cost, until: r.rep_cost_end_date, note: clip(r.rep_cost_note) } : null,
    volume_pricing_notes: clip(r.volume_pricing_notes),
    salesperson_notes: clip(r.salesperson_notes),
    internal_notes: clip(r.internal_notes),
    stock: r.stock_status ?? "not confirmed",
    status: r.archived ? "archived" : r.stock_status === "Discontinued" ? "discontinued" : "current",
    coming_soon: r.coming_soon,
    width_in: r.width_in,
    thickness_mm: r.thickness_mm,
    wear_layer_mil: r.wear_layer_mil,
    ac_rating: r.ac_rating,
    install: r.install_profile,
    box_sf: r.box_size_sf,
    waterproof: yes(r.waterproof_confirmed),
    radiant_heat: yes(r.radiant_heat_confirmed),
    pet_friendly: yes(r.pet_friendly_confirmed),
    underpad_attached: yes(r.underpad_included),
    rooms: r.suitable_rooms ?? [],
    thumb_url: r.thumb_url,
    url: `/p/${encodeURIComponent(r.sku)}`,
  };
}

/** Relaxation counts → the hints the model sees, only for filters it used, best first. */
export function toRelaxations(counts: Record<string, number>, used: Set<string>): { drop: string; would_match: number }[] {
  return FILTER_NAMES.filter((name) => used.has(name) && Number(counts[name] ?? 0) > 0)
    .map((name) => ({ drop: name, would_match: Number(counts[name]) }))
    .sort((a, b) => b.would_match - a.would_match);
}
