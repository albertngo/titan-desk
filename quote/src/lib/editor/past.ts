/**
 * Copy options from a past quote (Albert, 2026-11-16: "REUSE a quote from the past, for another quote… while
 * 'creating another quote' or when I'm 'in a quote edit'"). Pure, no I/O: the editor's + From a past quote
 * panel loads a version's options (`src/lib/quotes/past.ts`) and this turns the ones picked into new options of
 * the quote being edited, as unsaved changes, saved like any other edit. Nothing is written to the old quote.
 *
 * What comes over: the option's name, description, sections and lines, service level, crew, scope, part, its
 * Private label and its own HST. What doesn't: Recommended, Not offered and a square-feet OK (they were about
 * that customer's choice), and every discount (the Discounts section, an accepted price, the contractor 10%,
 * which the editor works out again) and the accepted price adjustment.
 *
 * Prices: a line priced from the card takes today's Rate Card or Stair Items figure, at the option's service
 * level. A price or cost someone typed stays as typed. A line whose card row is gone keeps the figure it had and
 * is counted in `stale`, so the screen can say so.
 */
import { isAdjustmentLine, isDiscountLine } from "@/lib/pricing/discounts";
import { levelApplies, levelOf, levelPrice } from "@/lib/pricing/service";
import { entryFor, newId, rateSnap, type CardEntry, type EditorLine, type EditorOption, type EditorQuote } from "./model";

export type PastCopy = {
  quote: EditorQuote;
  /** The new options' ids, in the order added. */
  added: string[];
  /** Card lines whose row or material is no longer on the card: kept at the price they had. */
  stale: number;
  /** Discount and accepted-price lines left behind. */
  dropped: number;
};

/** A line's card figures as they are today. `null` when its row (or its material) is gone. */
export function refreshLine(l: EditorLine, entries: CardEntry[], level: ReturnType<typeof levelOf>): EditorLine | null {
  if (l.sourceKind !== "rate" && l.sourceKind !== "stair") return l;
  const e = entryFor(l, entries);
  if (!e) return null;
  if (e.kind === "stair") return { ...l, unitPriceSnap: levelPrice(e.rate, level, levelApplies(l)), unitCostSnap: e.cost };
  const c = e.contractors.find((x) => x.name === l.contractor);
  if (!c) return null;
  if (l.materialId && !c.material?.choices.some((m) => m.id === l.materialId)) return null;
  const s = rateSnap(e, c, l.materialId, level);
  return { ...l, sourceId: c.recordId, unitPriceSnap: s.price, unitCostSnap: s.cost, minChargeSnap: e.minCharge };
}

/** "Hardwood" when free, else "Hardwood (2)", "Hardwood (3)"… */
function freeName(name: string, taken: Set<string>): string {
  const base = name.trim() || "Option";
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const next = `${base} (${n})`;
    if (!taken.has(next.toLowerCase())) return next;
  }
}

/** The picked options added at the end of `q`, each a full, independent copy with fresh ids. */
export function copyPastOptions(q: EditorQuote, picked: EditorOption[], entries: CardEntry[]): PastCopy {
  const taken = new Set(q.options.map((o) => o.name.trim().toLowerCase()));
  const added: string[] = [];
  let stale = 0;
  let dropped = 0;
  const options = picked.map((src): EditorOption => {
    const level = levelOf(src);
    const lines: EditorLine[] = [];
    for (const l of src.lines) {
      if (isDiscountLine(l) || isAdjustmentLine(l)) {
        dropped++;
        continue;
      }
      const fresh = refreshLine(l, entries, level);
      if (!fresh) stale++;
      lines.push({ ...(fresh ?? l), id: newId("line") });
    }
    const name = freeName(src.name, taken);
    taken.add(name.toLowerCase());
    const id = newId("opt");
    added.push(id);
    return {
      id,
      name,
      description: src.description,
      recommended: false,
      serviceLevel: level,
      crew: src.crew ?? null,
      privateLabel: src.privateLabel ?? null,
      scope: src.scope ?? null,
      ...(src.part ? { part: src.part } : {}),
      ...(src.showHst !== undefined ? { showHst: src.showHst } : {}),
      lines,
    };
  });
  return { quote: { ...q, options: [...q.options, ...options] }, added, stale, dropped };
}

/** The panel's note after a copy, in plain words. */
export function pastNote(r: Pick<PastCopy, "added" | "stale" | "dropped">): string {
  const n = r.added.length;
  const parts = [`Copied ${n} option${n === 1 ? "" : "s"}. Card lines are at today's Rate Card; typed prices stayed as typed.`];
  if (r.stale) parts.push(`${r.stale} line${r.stale === 1 ? " is" : "s are"} no longer on the card and kept the old price: check ${r.stale === 1 ? "it" : "them"}.`);
  if (r.dropped) parts.push(`Discounts from the old quote were left off.`);
  return parts.join(" ");
}
