/**
 * The design layer ("Help me choose"): types shared by the consultation page and the pure
 * recommendation logic in this folder. Nothing here talks to the database; the page loads the
 * Dictionary, the Rules and the candidate floors through lib/db/queries.ts and hands them in.
 *
 * Flow: answers -> DesignProfile -> safety filters (code, never relaxed) -> job filters
 * (budget, categories, design Require/Exclude; relaxed in a fixed order when fewer than 3
 * survive) -> score (taste preferences + Design Rules) -> pick 3 (best / step up / smart
 * value, one per collection) -> explain.
 */

import type { Hero } from "@/lib/db/types";

// ---------------------------------------------------------------------------------------------
// Airtable mirrors (api.design_dictionary / api.design_rules)
// ---------------------------------------------------------------------------------------------

export type DictionaryRow = {
  id: string;
  phrase: string;
  matches: string[];
  kind: "Preference" | "Avoid";
  undertone: string[];
  tone_depth_min: number | null;
  tone_depth_max: number | null;
  busyness: string[];
  texture: string[];
  style: string[];
  width_min_in: number | null;
  width_max_in: number | null;
  weight: number;
  also_look_for: string | null;
  also_avoid: string | null;
  say_to_client: string | null;
};

export type RuleWhen =
  | "Always" | "Below grade" | "Radiant heat" | "Condo" | "Kitchen or bath" | "Pets" | "High traffic"
  | "Small room" | "Large open plan" | "Low light" | "Heavy sun" | "Resale or timeless" | "Wood cabinets"
  | "Warm fixed elements" | "Cool fixed elements" | "Wants Modern" | "Wants Rustic" | "Herringbone or chevron" | "Stairs";

export type RuleField =
  | "Waterproof" | "Radiant heat compatible" | "IIC rating" | "Category" | "Stock status" | "Wear layer (mil)"
  | "Undertone" | "Tone depth" | "Busyness" | "Texture" | "Style" | "Width (in)" | "Contrast with cabinets"
  | "Layout pattern" | "Pairs well with";

export type DesignRule = {
  key: string;
  rule: string;
  kind: "Safety" | "Design";
  rule_when: RuleWhen | string;
  effect: "Require" | "Exclude" | "Boost" | "Penalize" | "Warn";
  field: RuleField | string | null;
  rule_values: string | null;
  weight: number;
  say_to_client: string | null;
};

// ---------------------------------------------------------------------------------------------
// The catalogue row the recommender reads (a column subset of api.catalogue_staff)
// ---------------------------------------------------------------------------------------------

export const CANDIDATE_COLUMNS = [
  "sku", "product_name", "brand", "collection", "category", "supplier", "grade", "layout_pattern",
  "retail_price", "price_unit", "price_on_request", "promo_active", "price_stale", "stock_status", "coming_soon", "active",
  "waterproof", "radiant_heat_compatible", "pet_friendly", "iic_rating", "wear_layer_mil", "thickness_mm", "width_in",
  "undertone", "tone_depth", "texture", "style", "busyness", "style_tags_status", "hero",
] as const;

export type Candidate = {
  sku: string;
  product_name: string | null;
  brand: string | null;
  collection: string | null;
  category: string | null;
  supplier: string | null;
  grade: string | null;
  layout_pattern: string | null;
  retail_price: number | null;
  price_unit: "sf" | "piece";
  price_on_request: boolean;
  promo_active: boolean;
  price_stale: boolean;
  stock_status: string | null;
  coming_soon: boolean;
  active: boolean;
  waterproof: boolean;
  radiant_heat_compatible: boolean;
  pet_friendly: boolean;
  iic_rating: number | null;
  wear_layer_mil: number | null;
  thickness_mm: number | null;
  width_in: number | null;
  undertone: string | null;
  tone_depth: number | null;
  texture: string | null;
  style: string[];
  busyness: string | null;
  style_tags_status: string | null;
  hero: Hero | null;
};

export const FLOOR_CATEGORIES = ["LVP", "LVT", "Laminate", "Engineered hardwood", "Solid hardwood", "Tile / Stone", "Carpet"] as const;
export const REAL_WOOD = ["Engineered hardwood", "Solid hardwood"] as const;
export const LOOK_ALIKES = ["LVP", "LVT", "Laminate"] as const;
export const VINYL = ["LVP", "LVT"] as const;

// ---------------------------------------------------------------------------------------------
// The Design Profile — what the consultation produces
// ---------------------------------------------------------------------------------------------

/** One set of catalogue attributes a preference points at. Absent key = no opinion. */
export type AttrSet = {
  undertone?: string[];
  tone?: [number, number];
  busyness?: string[];
  texture?: string[];
  style?: string[];
  width?: [number | null, number | null];
};

/**
 * One taste preference. `source` records where it came from so stated preferences outrank
 * inferences, and staff can tell the client where an assumption was made.
 */
export type Preference = {
  id: string;
  label: string;
  kind: "prefer" | "avoid";
  source: "said" | "pair" | "inferred";
  weight: number;
  attrs: AttrSet;
  say: string | null;
  also: string | null;
};

export type Room = "Kitchen" | "Bathroom" | "Laundry" | "Living room" | "Bedroom" | "Hallway" | "Basement" | "Stairs" | "Whole floor";

export type DesignProfile = {
  profile_version: "1";
  hard: {
    rooms: Room[];
    level: "basement" | "main" | "upper" | null;
    condo: boolean;
    min_iic: number | null;           // the building's minimum, when known
    radiant_heat: boolean;
    accepts_wood_in_wet_rooms: boolean;
    categories_allowed: string[] | null; // null = any flooring
    budget_ceiling_sf: number | null;
    max_thickness_mm: number | null;
  };
  space: {
    size: "small" | "medium" | "large" | null;
    open_plan: boolean;
    light: "bright" | "average" | "low" | null;
    heavy_sun: boolean;
    pattern: "none" | "herringbone" | "chevron" | null;
  };
  living: { pets: boolean; high_traffic: boolean; resale: boolean };
  fixed: {
    cabinets: "wood" | "painted_white" | "painted_colour" | "none" | null;
    cabinet_tone: number | null;       // 1-5 on the Tone depth scale, when cabinets are wood
    fixed_undertone: "Warm" | "Neutral" | "Cool" | null;
  };
  said: { like: string; dislike: string };
  prefs: Preference[];
  open_questions: string[];
};

export const EMPTY_PROFILE: DesignProfile = {
  profile_version: "1",
  hard: {
    rooms: [], level: null, condo: false, min_iic: null, radiant_heat: false, accepts_wood_in_wet_rooms: false,
    categories_allowed: null, budget_ceiling_sf: null, max_thickness_mm: null,
  },
  space: { size: null, open_plan: false, light: null, heavy_sun: false, pattern: null },
  living: { pets: false, high_traffic: false, resale: false },
  fixed: { cabinets: null, cabinet_tone: null, fixed_undertone: null },
  said: { like: "", dislike: "" },
  prefs: [],
  open_questions: [],
};

// ---------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------

export type Scored = {
  floor: Candidate;
  score: number;
  reasons: string[];     // client-facing sentences, most important first
  warnings: string[];    // staff-facing cautions (fading, waste, unconfirmed, above budget …)
  untagged: boolean;     // taste could not be judged: the style fields are blank
  above_budget: boolean;
};

export type PickRole = "Best match" | "Step up" | "Smart value";

export type Recommendation = {
  picks: (Scored & { role: PickRole })[];
  more: Scored[];               // the next best, for "show more"
  relaxed: string[];            // what was loosened to reach 3, in plain words
  excluded_by_safety: number;   // floors a safety rule removed
  unconfirmed: string[];        // e.g. "12 floors might suit but Waterproof isn't ticked on them"
  pool: number;                 // floors that passed every filter
  tagged_in_pool: number;       // of those, how many carry style tags
  open_questions: string[];
};
