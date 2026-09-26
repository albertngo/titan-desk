/**
 * The ONLY module that talks to the database. It knows exactly five objects in schema `api`:
 * catalogue_staff, search_staff, catalogue_facets, sync_status, and an INSERT into search_log.
 * Never read schema `mirror`; never chain .select() on the search_log insert (no SELECT grant).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, FacetRow, SearchArgs, SearchHit, SyncStatusRow, CatalogueStaffRow } from "./types";

export type Client = SupabaseClient<Database, "api">;

export async function searchStaff(client: Client, args: SearchArgs, signal?: AbortSignal): Promise<SearchHit[]> {
  let q = client.rpc("search_staff", args);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SearchHit[];
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
