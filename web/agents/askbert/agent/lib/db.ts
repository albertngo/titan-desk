/**
 * askBert's database access: PostgREST with the signed-in staff member's own access token,
 * exactly like the app's search box. No service key, no separate database account: the
 * functions run with that person's rights (api.askbert_search / api.askbert_relax, staff only).
 */
import { createClient } from "@supabase/supabase-js";
import type { CatalogueRow, SearchArgs } from "./query";

function client(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set");
  return createClient(url, key, {
    db: { schema: "api" },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** A PostgREST error carrying Postgres' SQLSTATE in `code`. */
export class DbError extends Error {
  constructor(message: string, readonly code: string | undefined) {
    super(message);
  }
}

export async function searchCatalogue(accessToken: string, args: SearchArgs, signal?: AbortSignal): Promise<CatalogueRow[]> {
  let q = client(accessToken).rpc("askbert_search", args);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw new DbError(error.message, error.code);
  return (data ?? []) as CatalogueRow[];
}

export async function relaxationCounts(accessToken: string, args: SearchArgs, signal?: AbortSignal): Promise<Record<string, number>> {
  let q = client(accessToken).rpc("askbert_relax", args);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw new DbError(error.message, error.code);
  return (data ?? {}) as Record<string, number>;
}
