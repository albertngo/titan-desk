"use server";

import { findPastQuotes, pastOptions, type PastOptions, type PastQuote } from "@/lib/quotes/past";

/** + From a past quote (2026-11-16): the editor and New quote search past quotes and read one version's options. Read only; both check the quoter allowlist inside. */
export async function findPastQuotesAction(query: string, exceptVersionId: string | null = null): Promise<PastQuote[]> {
  return findPastQuotes(String(query ?? ""), exceptVersionId === null ? null : String(exceptVersionId));
}

export async function pastOptionsAction(versionId: string): Promise<PastOptions> {
  return pastOptions(String(versionId ?? ""));
}
