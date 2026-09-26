/**
 * HTTP boundary: what an anonymous caller (the website agent, or anyone with the public anon
 * key) can and cannot reach through PostgREST. Runs against a local Supabase in CI:
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… npm run test:boundary
 */
import { describe, expect, it } from "vitest";

const URL_ = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const run = URL_ && ANON ? describe : describe.skip;

const STAFF_OR_SYSTEM = [
  "supplier", "supplier_sku", "cost", "map_price", "pallet_price", "promo_cost", "promo_end_date", "volume_pricing_notes",
  "last_price_update", "price_last_changed_by", "price_stale", "promo_open_ended", "boxes_per_skid", "pieces_per_pallet",
  "active", "salesperson_notes", "internal_notes", "price_list_url", "style_tags_status", "style_tags_evidence", "airtable_url",
  "search_staff", "airtable_record_id", "airtable_modified_at", "synced_at", "lightspeed_id", "ls_handle", "variant_group", "image_attachments",
];

function anon(path: string, init: RequestInit = {}) {
  return fetch(`${URL_}${path}`, {
    ...init,
    headers: { apikey: ANON!, Authorization: `Bearer ${ANON}`, "Accept-Profile": "api", "Content-Profile": "api", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

run("anonymous key against PostgREST", () => {
  it("can read catalogue_public and it carries no staff or system column", async () => {
    const r = await anon("/rest/v1/catalogue_public?select=*&limit=3");
    expect(r.status).toBe(200);
    const rows = (await r.json()) as Record<string, unknown>[];
    for (const row of rows) for (const k of STAFF_OR_SYSTEM) expect(row).not.toHaveProperty(k);
  });

  it("cannot read catalogue_staff, facets or sync_status", async () => {
    for (const v of ["catalogue_staff", "catalogue_facets", "sync_status"]) {
      const r = await anon(`/rest/v1/${v}?select=*&limit=1`);
      expect(r.status, v).not.toBe(200);
    }
  });

  it("cannot reach the base table by name and the mirror schema is not exposed", async () => {
    expect((await anon("/rest/v1/catalogue?select=*&limit=1")).status).toBe(404);
    const r = await anon("/rest/v1/catalogue?select=*&limit=1", { headers: { "Accept-Profile": "mirror" } });
    const body = (await r.json().catch(() => ({}))) as { code?: string };
    expect(r.status).not.toBe(200);
    expect(body.code).toBe("PGRST106");
  });

  it("can call search_public (no supplier key) but not search_staff", async () => {
    const ok = await anon("/rest/v1/rpc/search_public", { method: "POST", body: JSON.stringify({ q: "oak", lim: 3 }) });
    expect(ok.status).toBe(200);
    const rows = (await ok.json()) as Record<string, unknown>[];
    for (const row of rows) expect(row).not.toHaveProperty("supplier");
    const no = await anon("/rest/v1/rpc/search_staff", { method: "POST", body: JSON.stringify({ q: "oak" }) });
    expect(no.status).not.toBe(200);
  });

  it("cannot insert into search_log", async () => {
    const r = await anon("/rest/v1/search_log", { method: "POST", body: JSON.stringify({ query: "x" }) });
    expect(r.status).not.toBe(201);
  });

  it("public image variants are readable; originals are not", async () => {
    const list = await anon("/rest/v1/catalogue_public?select=hero&hero=not.is.null&limit=1");
    const rows = (await list.json()) as { hero: { thumb: string } }[];
    if (!rows.length) return; // no images synced locally
    const thumb = await fetch(rows[0].hero.thumb);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("cache-control") ?? "").toContain("max-age");
    const original = rows[0].hero.thumb.replace("/public/catalogue-images/", "/public/catalogue-originals/").replace(/_200\.webp.*$/, ".jpg");
    expect((await fetch(original)).status).not.toBe(200);
  });
});
