/**
 * The ONLY module that talks to the database. It knows exactly these objects in schema `api`:
 * catalogue_staff, search_staff, search_staff_grouped, catalogue_facets, sync_status,
 * design_dictionary, design_rules, and an INSERT into search_log.
 * Never read schema `mirror`; never chain .select() on the search_log insert (no SELECT grant).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CANDIDATE_COLUMNS, FLOOR_CATEGORIES, type Candidate, type DesignRule, type DictionaryRow } from "@/lib/design/types";
import type { Database, FacetRow, SearchArgs, SearchGroup, SearchHit, SyncStatusRow, CatalogueStaffRow } from "./types";

export type Client = SupabaseClient<Database, "api">;

export async function searchStaff(client: Client, args: SearchArgs, signal?: AbortSignal): Promise<SearchHit[]> {
  let q = client.rpc("search_staff", args);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SearchHit[];
}

/** Same match as searchStaff, one row per product line (colours inside), paged by line. */
export async function searchStaffGrouped(client: Client, args: SearchArgs, signal?: AbortSignal): Promise<SearchGroup[]> {
  let q = client.rpc("search_staff_grouped", args);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SearchGroup[];
}

export async function getProduct(client: Client, sku: string): Promise<CatalogueStaffRow | null> {
  const { data, error } = await client.from("catalogue_staff").select("*").eq("sku", sku).maybeSingle();
  if (error) throw error;
  return (data as CatalogueStaffRow | null) ?? null;
}

export type Facets = Record<FacetRow["facet"], { value: string; n: number }[]>;

export async function getFacets(client: Client): Promise<Facets> {
  const { data, error } = await client.from("catalogue_facets").select("facet,value,n").order("value");
  if (error) throw error;
  const out: Facets = { supplier: [], category: [], undertone: [], texture: [], busyness: [], style: [] };
  for (const row of (data ?? []) as FacetRow[]) out[row.facet]?.push({ value: row.value, n: row.n });
  return out;
}

export async function getSyncStatus(client: Client): Promise<SyncStatusRow | null> {
  const { data, error } = await client.from("sync_status").select("*").maybeSingle();
  if (error) throw error;
  return (data as SyncStatusRow | null) ?? null;
}

/** Fire-and-forget. `return=minimal` is the default; do NOT add .select(). */
export async function logSearch(client: Client, row: { query: string; filters: Record<string, unknown>; result_count: number; took_ms: number }): Promise<void> {
  const { error } = await client.from("search_log").insert(row);
  if (error) console.warn("search_log insert failed", error.message);
}

// ---- design layer (Help me choose) -----------------------------------------------------------

/** Active Design Dictionary phrases (api.design_dictionary; inactive rows never leave the db). */
export async function getDesignDictionary(client: Client): Promise<DictionaryRow[]> {
  const { data, error } = await client.from("design_dictionary").select("*").order("phrase");
  if (error) throw error;
  return (data ?? []) as DictionaryRow[];
}

/** Active Design rules plus every Safety rule (api.design_rules). */
export async function getDesignRules(client: Client): Promise<DesignRule[]> {
  const { data, error } = await client.from("design_rules").select("*").order("key");
  if (error) throw error;
  return (data ?? []) as DesignRule[];
}

/** How many floors the Help me choose page loads at once; style-tagged floors come first. */
export const DESIGN_CANDIDATE_LIMIT = 1000;

/**
 * Active flooring the recommender scores, style-tagged first (so taste can be judged on as many
 * floors as possible), then by SKU. Safety and job filters run in lib/design, not here, so the
 * page can re-rank instantly as answers change and say exactly what a filter removed.
 */
export async function getDesignCandidates(client: Client): Promise<Candidate[]> {
  const { data, error } = await client
    .from("catalogue_staff")
    .select(CANDIDATE_COLUMNS.join(","))
    .eq("product_type", "Flooring")
    .eq("active", true)
    .in("category", [...FLOOR_CATEGORIES])
    .or("stock_status.is.null,stock_status.neq.Discontinued")
    .order("style_tags_status", { ascending: true, nullsFirst: false })
    .order("sku")
    .limit(DESIGN_CANDIDATE_LIMIT);
  if (error) throw error;
  return ((data ?? []) as unknown as Candidate[]).map((c) => ({ ...c, style: c.style ?? [] }));
}
