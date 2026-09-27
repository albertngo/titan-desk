/**
 * Types for the `api` schema (views + RPC). Hand-maintained to match migration 001 (type aliases,
 * not interfaces: supabase-js needs the implicit index signature); regenerate
 * with `make types` (supabase gen types --schema api) once a Supabase project is available,
 * then keep the NOT NULL overrides below: generated view types are all-nullable.
 */

import type { DesignRule, DictionaryRow } from "@/lib/design/types";

export type ImageKind = "swatch" | "room" | "detail";

export type ImageVariant = {
  kind: ImageKind;
  sort: number;
  w: number | null;
  h: number | null;
  blurhash: string | null;
  thumb: string | null;
  card: string | null;
  full: string | null;
  low_res?: boolean; // staff view only
};

export type Hero = {
  kind: ImageKind;
  w: number | null;
  h: number | null;
  blurhash: string | null;
  thumb: string | null;
  card: string | null;
  full: string | null;
  low_res?: boolean;
};

export type PairRef = {
  sku: string;
  product_name: string | null;
  active?: boolean;
};

export type VariantRef = {
  sku: string;
  product_name: string | null;
  grade: string | null;
  variant_label: string | null;
  active?: boolean;
};

/** Columns shared by api.catalogue_public and api.catalogue_staff. */
export type CataloguePublicRow = {
  sku: string;
  product_name: string | null;
  brand: string | null;
  collection: string | null;
  product_type: string | null;
  category: string | null;
  material_type: string | null;
  species: string | null;
  colour_tone: string | null;
  grade: string | null;
  layout_pattern: string | null;
  width_in: number | null;
  length: string | null;
  thickness_mm: number | null;
  wear_layer_mil: number | null;
  veneer_mm: number | null;
  veneer_cut_type: string | null;
  ac_rating: string | null;
  finish_type: string | null;
  install_profile: string | null;
  install_method: string | null;
  locking_system: string | null;
  underpad_included: boolean;
  underpad_type: string | null;
  iic_rating: number | null;
  stc_rating: number | null;
  tile_format: string | null;
  weight_per_piece_kg: number | null;
  certifications: string[];
  retail_price: number | null;
  price_on_request: boolean;
  price_unit: "sf" | "piece";
  promo_active: boolean;
  box_size_sf: number | null;
  pieces_per_box: number | null;
  stock_status: string | null;
  coming_soon: boolean;
  waterproof: boolean;
  pet_friendly: boolean;
  radiant_heat_compatible: boolean;
  traffic_rating: string | null;
  suitable_rooms: string[];
  residential_warranty_yrs: number | null;
  commercial_warranty_yrs: number | null;
  undertone: string | null;
  tone_depth: number | null;
  texture: string | null;
  style: string[];
  busyness: string | null;
  pairs_well_with: PairRef[] | null;
  variants: VariantRef[] | null;
  images: ImageVariant[] | null;
  hero: Hero | null;
};

/** api.catalogue_staff = public columns + the staff tier. */
export type CatalogueStaffRow = CataloguePublicRow & {
  supplier: string | null;
  supplier_sku: string | null;
  cost: number | null;
  map_price: number | null;
  pallet_price: number | null;
  promo_cost: number | null;
  promo_end_date: string | null;
  volume_pricing_notes: string | null;
  last_price_update: string | null;
  price_last_changed_by: string | null;
  price_stale: boolean;
  promo_open_ended: boolean;
  boxes_per_skid: number | null;
  pieces_per_pallet: number | null;
  active: boolean;
  salesperson_notes: string | null;
  internal_notes: string | null;
  price_list_url: string | null;
  promo_list_url: string | null;
  rep_cost: number | null;
  rep_cost_end_date: string | null;
  rep_cost_note: string | null;
  rep_cost_active: boolean;
  style_tags_status: string | null;
  style_tags_evidence: string | null;
  airtable_url: string;
};

export type ParsedQuery = {
  free_text: string;
  width_in: number | null;
  thickness_mm: number | null;
  install_profile: string | null;
  promo: boolean;
  clearance: boolean;
  waterproof: boolean;
  pet: boolean;
  radiant: boolean;
  category_in: string[] | null;
  price_min: number | null;
  price_max: number | null;
};

/** One row of api.search_staff(). */
export type SearchHit = {
  sku: string;
  product_name: string | null;
  brand: string | null;
  category: string | null;
  supplier: string | null;
  retail_price: number | null;
  price_unit: "sf" | "piece";
  price_on_request: boolean;
  promo_active: boolean;
  coming_soon: boolean;
  stock_status: string | null;
  hero: Hero | null;
  total_count: number;
  rank: number;
  parsed: ParsedQuery;
};

export type SearchArgs = {
  q?: string;
  f_supplier?: string[] | null;
  f_category?: string[] | null;
  f_price_min?: number | null;
  f_price_max?: number | null;
  f_waterproof?: boolean | null;
  f_radiant?: boolean | null;
  f_pet?: boolean | null;
  f_hide_unavailable?: boolean;
  f_undertone?: string[] | null;
  f_tone_depth_min?: number | null;
  f_tone_depth_max?: number | null;
  f_texture?: string[] | null;
  f_style?: string[] | null;
  f_busyness?: string[] | null;
  lim?: number;
  off?: number;
};

export type FacetRow = {
  facet: "supplier" | "category" | "undertone" | "texture" | "busyness" | "style";
  value: string;
  n: number;
};

export type SyncStatusRow = {
  last_success_at: string | null;
  last_started_at: string | null;
  last_status: string | null;
  last_mode: string | null;
  rows: number;
};

export type SearchLogInsert = {
  query: string;
  filters?: Record<string, unknown> | null;
  result_count?: number | null;
  took_ms?: number | null;
};

/** supabase-js Database shape for `createClient<Database, "api">`. */
export interface Database {
  api: {
    Tables: {
      search_log: {
        Row: SearchLogInsert & { id: number; user_id: string; user_email: string | null; created_at: string };
        Insert: SearchLogInsert;
        Update: Partial<SearchLogInsert>;
        Relationships: [];
      };
    };
    Views: {
      catalogue_public: { Row: CataloguePublicRow; Relationships: [] };
      catalogue_staff: { Row: CatalogueStaffRow; Relationships: [] };
      catalogue_facets: { Row: FacetRow; Relationships: [] };
      sync_status: { Row: SyncStatusRow; Relationships: [] };
      design_dictionary: { Row: DictionaryRow; Relationships: [] };
      design_rules: { Row: DesignRule; Relationships: [] };
    };
    Functions: {
      search_staff: { Args: SearchArgs; Returns: SearchHit[] };
      search_public: { Args: Omit<SearchArgs, "f_supplier">; Returns: Omit<SearchHit, "supplier">[] };
      parse_query: { Args: { q: string }; Returns: ParsedQuery };
      today: { Args: Record<string, never>; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: { parsed_query: ParsedQuery };
  };
}
