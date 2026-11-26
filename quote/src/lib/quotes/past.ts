import "server-only";
import { requireQuoter } from "@/lib/auth";
import { optionTotals } from "@/lib/calc";
import { detachVersionDiscount, fromQuote, type EditorOption } from "@/lib/editor/model";
import { matchesSearch } from "./group";
import { getQuote, listQuoteGroups } from "./load";

/**
 * Copy options from a past quote (Albert, 2026-11-16): the two reads the + From a past quote panel needs.
 * Read only: nothing here writes, and the copying itself is `copyPastOptions()` in src/lib/editor/past.ts,
 * an unsaved editor change. Both check the quoter allowlist first.
 */

export type PastVersion = { id: string; version: number | null; label: string | null; status: string | null; basis: string | null; optionCount: number; sentAt: string | null; changeNo: number | null };
export type PastQuote = { quoteRecordId: string | null; /** The quote being edited: only its other versions are listed (2026-11-26). */ current?: boolean; customerName: string | null; quoteNumber: string | null; siteCity: string | null; description: string | null; versions: PastVersion[] };
export type PastOption = EditorOption & { price: number };
export type PastOptions = { ok: true; versionId: string; label: string | null; version: number | null; basis: string | null; customerName: string | null; options: PastOption[] } | { ok: false; message: string };

const MAX_RESULTS = 12;
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

/** Past quotes matching what was typed (All quotes' own search), newest first; empty finds the latest. */
export async function findPastQuotes(query: string, exceptVersionId: string | null = null): Promise<PastQuote[]> {
  await requireQuoter();
  const q = query.trim().slice(0, 80);
  const groups = await listQuoteGroups();
  const out: PastQuote[] = [];
  let own: PastQuote | null = null;
  for (const g of groups) {
    // The quote being edited (Albert, 2026-11-26: "copy from the same quote; but a different version"): its other
    // versions are offered first, whatever was typed. The version being edited is left out: its options are already there.
    const isOwn = Boolean(exceptVersionId) && g.versions.some((v) => v.id === exceptVersionId);
    if (!isOwn && !matchesSearch(g, q)) continue;
    const versions = g.versions
      .filter((v) => v.optionCount > 0 && v.id !== exceptVersionId)
      .map((v) => ({ id: v.id, version: v.version, label: v.label, status: v.status, basis: v.basis, optionCount: v.optionCount, sentAt: v.sentAt ?? null, changeNo: v.changeNo ?? null }));
    if (!versions.length) continue;
    const found: PastQuote = { quoteRecordId: g.quoteRecordId, customerName: g.customerName, quoteNumber: g.quoteNumber, siteCity: g.siteCity, description: g.description ?? null, versions };
    if (isOwn) own = { ...found, current: true };
    else if (out.length < MAX_RESULTS) out.push(found);
  }
  return own ? [own, ...out] : out;
}

/** One version's options, as the editor holds them, each with its price after its discounts, before HST. A version-wide discount rate is handed to each option first, so a copy keeps it. */
export async function pastOptions(versionId: string): Promise<PastOptions> {
  await requireQuoter();
  if (!RECORD_ID.test(versionId)) return { ok: false, message: "That quote couldn't be found." };
  const quote = await getQuote(versionId);
  if (!quote) return { ok: false, message: "That quote couldn't be found." };
  const options = detachVersionDiscount(fromQuote(quote)).options.map((o) => ({ ...o, price: optionTotals(o.lines, 0, false).subtotal }));
  if (!options.length) return { ok: false, message: "That version has no options to copy." };
  return { ok: true, versionId: quote.id, label: quote.quoteId, version: quote.version, basis: quote.basis, customerName: quote.customerName, options };
}

export type DuplicateOf = { versionId: string; words: string; basis: "Preliminary" | "Measured"; optionCount: number };

/** Duplicate quote (Albert, 2026-11-16): what New quote says it is duplicating, or null for an id that isn't a version with options. */
export async function duplicateOf(versionId: string): Promise<DuplicateOf | null> {
  await requireQuoter();
  const r = await pastOptions(versionId);
  if (!r.ok) return null;
  const words = [r.customerName ?? "No name", r.label ?? (r.version != null ? `v${r.version}` : null)].filter(Boolean).join(" · ");
  return { versionId: r.versionId, words, basis: r.basis === "Measured" ? "Measured" : "Preliminary", optionCount: r.options.length };
}
