"use server";

import { redirect } from "next/navigation";
import { findCustomers, startQuote } from "@/lib/quotes/start";
import type { CustomerSearch } from "@/lib/quotes/types";

/** Server actions for the New quote screen. Both check the quoter allowlist inside. */

export async function searchCustomersAction(query: string): Promise<CustomerSearch> {
  return findCustomers(String(query ?? ""));
}

export async function startQuoteAction(input: unknown): Promise<{ ok: false; message: string }> {
  const r = await startQuote(input);
  if (!r.ok) return r;
  redirect(`/q/${r.versionId}/edit`);
}
