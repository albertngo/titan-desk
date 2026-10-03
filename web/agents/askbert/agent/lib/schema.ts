/**
 * askBert's catalogue tool contract: what the model may ask for (input) and exactly what it
 * gets back (output). The output is an allow-list; lib/query.ts builds it key by key from
 * api.askbert_search, which runs as the signed-in staff member (staff see cost; decided
 * 2026-09-28).
 *
 * Pure (zod only), so the web UI can import the types and tests can import the schemas.
 */
import { z } from "zod";

import { AVAILABILITY, CATEGORIES, INSTALL, MAX_LIMIT, REQUIREMENTS } from "./constants";

export { AVAILABILITY, CATEGORIES, INSTALL, MAX_LIMIT, REQUIREMENTS };

export const queryInput = z
  .object({
    keyword: z.string().trim().min(2).max(80).optional()
      .describe("Words to match in the product name, SKU, brand, collection, category or colour, e.g. \"macaroon\", \"white oak\"."),
    sku: z.string().trim().min(2).max(40).optional().describe("An exact SKU, e.g. \"ENG-VIDR-0100C\"."),
    categories: z.array(z.enum(CATEGORIES)).min(1).max(5).optional()
      .describe("Vinyl plank = LVP, vinyl tile = LVT; porcelain/ceramic = \"Tile / Stone\"; marble/quartz pieces = STONE."),
    brand: z.string().trim().min(2).max(40).optional(),
    suppliers: z.array(z.string().trim().min(2).max(40)).min(1).max(5).optional()
      .describe("Supplier names as stored, e.g. \"VIDAR\", \"OLYMPIA TILE\" (case-insensitive)."),
    price_min: z.number().nonnegative().max(1000).optional(),
    price_max: z.number().nonnegative().max(1000).optional().describe("Retail price ceiling in CAD."),
    price_unit: z.enum(["sf", "piece"]).default("sf")
      .describe("Unit the price bounds apply to: per square foot (flooring) or per piece (tile pieces, stone, accessories)."),
    requires: z.array(z.enum(REQUIREMENTS)).min(1).max(4).optional()
      .describe("Only products whose catalogue field CONFIRMS these. Unconfirmed products are excluded, not proven unsuitable."),
    room: z.string().trim().min(2).max(30).optional().describe("A room listed in the product's suitable rooms, e.g. \"Basement\"."),
    colour: z.string().trim().min(2).max(30).optional().describe("Free text matched against the colour/tone field."),
    undertone: z.enum(["Warm", "Neutral", "Cool"]).optional(),
    tone: z.enum(["light", "medium", "dark"]).optional(),
    width_min_in: z.number().min(0).max(48).optional(),
    width_max_in: z.number().min(0).max(48).optional(),
    min_wear_layer_mil: z.number().min(0).max(40).optional(),
    install: z.enum(INSTALL).optional(),
    availability: z.enum(AVAILABILITY).default("any")
      .describe("any = every product incl. archived/discontinued (flagged); current_only = not archived or discontinued; hide_unavailable = also no special order or coming soon; confirmed_in_stock = stock status In stock or Low stock."),
    promo_only: z.boolean().optional(),
    sort: z.enum(["relevance", "price_asc", "price_desc"]).default("relevance"),
    limit: z.number().int().min(1).max(MAX_LIMIT).default(5),
  })
  .strict();

export type QueryInput = z.infer<typeof queryInput>;
export type QueryInputRaw = z.input<typeof queryInput>;

const yesOrUnconfirmed = z.enum(["yes", "not confirmed"]);

export const productOut = z.object({
  sku: z.string(),
  name: z.string().nullable(),
  brand: z.string().nullable(),
  supplier: z.string().nullable(),
  supplier_sku: z.string().nullable(),
  category: z.string().nullable(),
  material: z.string().nullable(),
  colour: z.string().nullable(),
  grade: z.string().nullable(),
  price: z.object({ amount: z.number().nullable(), unit: z.enum(["sf", "piece"]), on_request: z.boolean() }),
  promo: z.boolean(),
  promo_ends: z.string().nullable(),
  price_as_of: z.string().nullable(),
  price_list_url: z.string().nullable(),
  cost: z.number().nullable(),
  map_price: z.number().nullable(),
  pallet_price: z.number().nullable(),
  promo_cost: z.number().nullable(),
  rep_cost: z.object({ amount: z.number().nullable(), until: z.string().nullable(), note: z.string().nullable() }).nullable(),
  volume_pricing_notes: z.string().nullable(),
  salesperson_notes: z.string().nullable(),
  internal_notes: z.string().nullable(),
  stock: z.string(),
  status: z.enum(["current", "archived", "discontinued"]),
  coming_soon: z.boolean(),
  width_in: z.number().nullable(),
  thickness_mm: z.number().nullable(),
  wear_layer_mil: z.number().nullable(),
  ac_rating: z.string().nullable(),
  install: z.string().nullable(),
  box_sf: z.number().nullable(),
  waterproof: yesOrUnconfirmed,
  radiant_heat: yesOrUnconfirmed,
  pet_friendly: yesOrUnconfirmed,
  underpad_attached: yesOrUnconfirmed,
  rooms: z.array(z.string()),
  thumb_url: z.string().nullable(),
  url: z.string(),
});

export const queryOutput = z.object({
  total_matches: z.number().int(),
  products: z.array(productOut),
  relaxations: z.array(z.object({ drop: z.string(), would_match: z.number().int() })).optional(),
  error: z.enum(["timeout", "unavailable"]).optional(),
});

export type ProductOut = z.infer<typeof productOut>;
export type QueryOutput = z.infer<typeof queryOutput>;

/** Keys a product row may carry. Anything else reaching the model or the UI is a bug. */
export const PRODUCT_KEYS = Object.keys(productOut.shape) as (keyof ProductOut)[];
