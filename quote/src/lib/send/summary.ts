import { isPriced, sectionOf } from "@/lib/calc";
import type { QuoteLine, QuoteOption } from "@/lib/quotes/types";
import type { CopyItem, CopyOption, CustomerCopy } from "./copy";

/**
 * The words that go with a quote (Albert, 2026-10-18), replacing the GHL mobile-quote workflow's
 * "Type of Quote" branch and its ChatGPT summary step. Pure and deterministic; tested in
 * tests/summary.test.ts.
 *
 * - quoteKind / copyKind: flooring, stairs or both, read from the lines (live) or the frozen copy.
 * - kindPhrase: the words the email and text use for the quote.
 * - flooringSummary: the old SMS summary, built from the frozen customer copy only, so nothing
 *   internal can reach it: one line per section with the work and its square footage.
 */

export type QuoteKind = "flooring" | "stairs" | "both" | "none";

/** Sections that count as flooring work. "Other" (the quick form's additional cost) decides nothing. */
const FLOORING = new Set(["Install", "Removal", "Disposal", "Prep", "Materials", "Delivery"]);

/** A stair line: a Stair Item, a stair profile, or anything filed under Stairs. */
export const isStairLine = (l: Pick<QuoteLine, "lineType" | "sourceKind" | "section">) =>
  l.lineType === "Stairs" || l.sourceKind === "stair" || sectionOf(l) === "Stairs";

const kindOf = (stairs: boolean, flooring: boolean): QuoteKind => (stairs && flooring ? "both" : stairs ? "stairs" : flooring ? "flooring" : "none");

/** What an option quotes, from its included, priced lines. */
export function quoteKind(o: Pick<QuoteOption, "lines">): QuoteKind {
  const live = o.lines.filter((l) => isPriced(l) && l.include);
  return kindOf(
    live.some(isStairLine),
    live.some((l) => !isStairLine(l) && FLOORING.has(sectionOf(l))),
  );
}

/** What a copy quotes, across its options, from the sections that hold a counted item. */
export function copyKind(copy: Pick<CustomerCopy, "options">): QuoteKind {
  const counted = (name: string) => copy.options.some((o) => o.sections.some((s) => s.name === name && s.lines.some((l) => l.kind === "item" && !l.optional)));
  return kindOf(counted("Stairs"), [...FLOORING].some(counted));
}

/** "preliminary flooring and stairs quote", "stair quote", "quote"… for a sentence. */
export function kindPhrase(kind: QuoteKind, preliminary: boolean): string {
  const what = kind === "both" ? "flooring and stairs quote" : kind === "stairs" ? "stair quote" : kind === "flooring" ? "flooring quote" : "quote";
  return preliminary ? `preliminary ${what}` : what;
}

/* ---------- the flooring summary ---------- */

const UNIT: Record<string, string> = { sqft: "sq ft", "linear ft": "lin ft", piece: "pcs", each: "each" };
const LABEL: Record<string, string> = { Prep: "Subfloor prep" };

const num = (x: number) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100));

function extent(l: CopyItem): { qty: number; unit: string } | null {
  const unit = l.uom ? UNIT[l.uom] : undefined;
  return unit && l.qty !== null && l.qty > 0 ? { qty: l.qty, unit } : null;
}

/**
 * One line per section, in the order the copy has them, Stairs left out: the work and how much
 * of it, and a total where two or more items share a unit. Add-ons and text rows are skipped;
 * prices are not repeated here (the email's table and the link carry them).
 *
 *   Removal: Carpet removal · 200 sq ft; Tile removal · 50 sq ft
 *   Total removal: 250 sq ft
 */
export function flooringSummary(o: Pick<CopyOption, "sections">): string[] {
  const out: string[] = [];
  for (const s of o.sections) {
    if (s.name === "Stairs") continue;
    const items = s.lines.filter((l): l is CopyItem => l.kind === "item" && !l.optional);
    if (items.length === 0) continue;
    const label = LABEL[s.name] ?? s.name;
    out.push(`${label}: ${items.map((l) => (extent(l) ? `${l.description} · ${num(extent(l)!.qty)} ${extent(l)!.unit}` : l.description)).join("; ")}`);
    const units = new Map<string, number>();
    for (const l of items) {
      const e = extent(l);
      if (e) units.set(e.unit, (units.get(e.unit) ?? 0) + e.qty);
    }
    const shared = [...units].filter(([unit]) => items.filter((l) => extent(l)?.unit === unit).length >= 2);
    for (const [unit, qty] of shared) out.push(`Total ${label.toLowerCase()}: ${num(Math.round(qty * 100) / 100)} ${unit}`);
  }
  return out;
}
