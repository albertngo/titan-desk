import "server-only";
import { requireQuoter } from "@/lib/auth";
import { optionTotals } from "@/lib/calc";
import { fromQuote, type EditorOption } from "@/lib/editor/model";
import { isAdjustmentLine, isDiscountLine } from "@/lib/pricing/discounts";
import { matchesSearch } from "./group";
import { getQuote, listQuoteGroups } from "./load";

/**
 * Copy options from a past quote (Albert, 2026-11-16): the two reads the + From a past quote panel needs.
 * Read only: nothing here writes, and the copying itself is `copyPastOptions()` in src/lib/editor/past.ts,
 * an unsaved editor change. Both check the quoter allowlist first.
 */

export type PastVersion = { id: string; version: number | null; label: string | null; status: string | null; basis: string | null; optionCount: number; sentAt: string | null; changeNo: number | null };
export type PastQuote = { quoteRecordId: string | null; customerName: string | null; quoteNumber: string | null; siteCity: string | null; description: string | null; versions: PastVersion[] };
export type PastOption = EditorOption & { listPrice: number };
export type PastOptions = { ok: true; versionId: string; label: string | null; version: number | null; customerName: string | null; options: PastOption[] } | { ok: false; message: string };

const MAX_RESULTS = 12;
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

/** Past quotes matching what was typed (All quotes' own search), newest first; empty finds the latest. */
export async function findPastQuotes(query: string, exceptVersionId: string | null = null): Promise<PastQuote[]> {
  await requireQuoter();
  const q = query.trim().slice(0, 80);
  const groups = await listQuoteGroups();
  const out: PastQuote[] = [];
  for (const g of groups) {
    // The quote being edited is left out: its own options are already there to Duplicate.
    if (exceptVersionId && g.versions.some((v) => v.id === exceptVersionId)) continue;
    if (!matchesSearch(g, q)) continue;
    const versions = g.versions
      .filter((v) => v.optionCount > 0)
      .map((v) => ({ id: v.id, version: v.version, label: v.label, status: v.status, basis: v.basis, optionCount: v.optionCount, sentAt: v.sentAt ?? null, changeNo: v.changeNo ?? null }));
    if (!versions.length) continue;
    out.push({ quoteRecordId: g.quoteRecordId, customerName: g.customerName, quoteNumber: g.quoteNumber, siteCity: g.siteCity, description: g.description ?? null, versions });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

/** One version's options, as the editor holds them, each with its list price (before discounts and HST). */
export async function pastOptions(versionId: string): Promise<PastOptions> {
  await requireQuoter();
  if (!RECORD_ID.test(versionId)) return { ok: false, message: "That quote couldn't be found." };
  const quote = await getQuote(versionId);
  if (!quote) return { ok: false, message: "That quote couldn't be found." };
  const options = fromQuote(quote).options.map((o) => ({
    ...o,
    listPrice: optionTotals(o.lines.filter((l) => !isDiscountLine(l) && !isAdjustmentLine(l)), 0, false).subtotal,
  }));
  if (!options.length) return { ok: false, message: "That version has no options to copy." };
  return { ok: true, versionId: quote.id, label: quote.quoteId, version: quote.version, customerName: quote.customerName, options };
}
