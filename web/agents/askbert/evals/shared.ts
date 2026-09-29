/**
 * Facts from db/supabase/seed.sql that the starter evals check against. The evals run on the
 * local seed catalogue as a throwaway test staff user (.github/workflows/askbert-evals.yml).
 */
import { PRODUCT_KEYS } from "../agent/lib/schema";

const SKU = /\b[A-Z]{2,}[A-Z0-9.]*-[A-Z0-9.-]{3,}\b/g;

/** SKU-looking tokens in an answer. */
export function skusIn(text: string | undefined): string[] {
  return [...new Set((text ?? "").match(SKU) ?? [])];
}

type Call = { name: string; output: unknown };

/** SKUs the catalogue tool actually returned in this turn. */
export function returnedSkus(calls: readonly Call[]): Set<string> {
  const out = new Set<string>();
  for (const c of calls) {
    if (c.name !== "query_catalogue") continue;
    const products = (c.output as { products?: { sku: string }[] } | undefined)?.products ?? [];
    for (const p of products) out.add(p.sku);
  }
  return out;
}

/** Every SKU the answer names came from a tool result (nothing invented). */
export function onlyReturnedSkus(text: string | undefined, calls: readonly Call[]): boolean {
  const returned = returnedSkus(calls);
  return skusIn(text).every((s) => returned.has(s));
}

/** No tool output carries a key outside the allow-list. */
export function outputsAllowListed(calls: readonly Call[]): boolean {
  const allowed = new Set<string>(PRODUCT_KEYS);
  return calls
    .filter((c) => c.name === "query_catalogue")
    .every((c) => ((c.output as { products?: Record<string, unknown>[] } | undefined)?.products ?? [])
      .every((p) => Object.keys(p).every((k) => allowed.has(k))));
}
