import { z } from "zod";
import type { SearchArgs } from "./types";

/** Filter state lives in the URL so results are shareable and survive PWA relaunch. */
export const FilterSchema = z.object({
  q: z.string().default(""),
  supplier: z.array(z.string()).default([]),
  category: z.array(z.string()).default([]),
  min: z.number().nonnegative().nullable().default(null),
  max: z.number().nonnegative().nullable().default(null),
  waterproof: z.boolean().default(false),
  radiant: z.boolean().default(false),
  pet: z.boolean().default(false),
  hide: z.boolean().default(false), // hide special order / discontinued / coming soon
  undertone: z.array(z.string()).default([]),
  tone_min: z.number().int().min(1).max(5).nullable().default(null),
  tone_max: z.number().int().min(1).max(5).nullable().default(null),
  texture: z.array(z.string()).default([]),
  style: z.array(z.string()).default([]),
  busyness: z.array(z.string()).default([]),
});
export type Filters = z.infer<typeof FilterSchema>;

export const EMPTY_FILTERS: Filters = FilterSchema.parse({});

const LIST_KEYS = ["supplier", "category", "undertone", "texture", "style", "busyness"] as const;
const BOOL_KEYS = ["waterproof", "radiant", "pet", "hide"] as const;
const NUM_KEYS = ["min", "max", "tone_min", "tone_max"] as const;

export function filtersFromSearchParams(params: URLSearchParams): Filters {
  const raw: Record<string, unknown> = { q: params.get("q") ?? "" };
  for (const k of LIST_KEYS) raw[k] = params.getAll(k).filter(Boolean);
  for (const k of BOOL_KEYS) raw[k] = params.get(k) === "1";
  for (const k of NUM_KEYS) {
    const v = params.get(k);
    raw[k] = v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
  }
  const parsed = FilterSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // an out-of-range value drops only its own field (back to the default); the rest of the URL survives
  for (const issue of parsed.error.issues) delete raw[String(issue.path[0])];
  return FilterSchema.parse(raw);
}

export function filtersToSearchParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  for (const k of LIST_KEYS) for (const v of f[k]) p.append(k, v);
  for (const k of BOOL_KEYS) if (f[k]) p.set(k, "1");
  for (const k of NUM_KEYS) if (f[k] !== null) p.set(k, String(f[k]));
  return p;
}

/** Only the parts that go to the database (for search_log.filters and the RPC). */
export function filtersToArgs(f: Filters, page = 0, lim = 30): SearchArgs {
  const list = (a: string[]) => (a.length ? a : null);
  return {
    q: f.q,
    f_supplier: list(f.supplier),
    f_category: list(f.category),
    f_price_min: f.min,
    f_price_max: f.max,
    f_waterproof: f.waterproof ? true : null,
    f_radiant: f.radiant ? true : null,
    f_pet: f.pet ? true : null,
    f_hide_unavailable: f.hide,
    f_undertone: list(f.undertone),
    f_tone_depth_min: f.tone_min,
    f_tone_depth_max: f.tone_max,
    f_texture: list(f.texture),
    f_style: list(f.style),
    f_busyness: list(f.busyness),
    lim,
    off: page * lim,
  };
}

export function activeFilterCount(f: Filters): number {
  let n = 0;
  for (const k of LIST_KEYS) n += f[k].length;
  for (const k of BOOL_KEYS) if (f[k]) n += 1;
  for (const k of NUM_KEYS) if (f[k] !== null) n += 1;
  return n;
}
