"use server";

import { redirect } from "next/navigation";
import type { QuickProduct } from "@/lib/quick/plan";
import { searchProducts } from "@/lib/quotes/load";
import { findCustomers, startQuote } from "@/lib/quotes/start";
import type { CustomerSearch, FoundCustomer } from "@/lib/quotes/types";

/** Server actions for the New quote screen. Both check the quoter allowlist inside. */

export async function searchCustomersAction(query: string): Promise<CustomerSearch> {
  return findCustomers(String(query ?? ""));
}

/**
 * `copyFrom` (2026-11-16): a past version picked under "Start from a past quote". The quote starts as usual; its
 * editor then opens on that version's options, ready to copy (an unsaved change, nothing written here).
 */
export async function startQuoteAction(input: unknown, copyFrom: string | null = null): Promise<{ ok: false; message: string; duplicates?: FoundCustomer[] }> {
  const r = await startQuote(input);
  if (!r.ok) return r;
  const copy = typeof copyFrom === "string" && /^rec[A-Za-z0-9]{14}$/.test(copyFrom) ? copyFrom : null;
  if (copy) redirect(`/q/${r.versionId}/edit?copy=${copy}`);
  redirect(r.filled ? `/q/${r.versionId}` : `/q/${r.versionId}/edit`);
}

/** The quick form's "choose a specific product" search. Prices shown are retail; costs never reach the browser. */
export async function searchProductsAction(query: string): Promise<Pick<QuickProduct, "recordId" | "sku" | "name" | "rate">[]> {
  return (await searchProducts(String(query ?? "").slice(0, 80))).map(({ recordId, sku, name, rate }) => ({ recordId, sku, name, rate }));
}
