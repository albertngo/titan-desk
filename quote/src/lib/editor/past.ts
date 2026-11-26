/**
 * Copy options from old quotes (Albert, 2026-11-16: "REUSE a quote from the past, for another quote… while
 * 'creating another quote' or when I'm 'in a quote edit'"). Pure, no I/O: the editor's + From old quotes panel
 * loads a version's options (`src/lib/quotes/past.ts`) and this turns the ones picked into new options of the
 * quote being edited, as unsaved changes, saved like any other edit. Nothing is written to the old quote.
 *
 * An exact copy (Albert, same day: "Can we copy over the quotes exactly, including the discounts per option"):
 * every line at the price it had, every discount item, the accepted price and its adjustment, the contractor 10%,
 * Recommended, Not offered, the square-feet OK, service level, crew, scope, Part, Private label and the option's
 * own HST. Nothing is re-priced from today's card; `cardMoved` only counts the card lines whose Rate Card or Stair
 * Items figure has changed since, so the screen can say so. An old version-wide discount rate reaches the copy as
 * each option's own accepted price (`detachVersionDiscount()`, done where the options are read).
 */
import { levelOf, levelPrice, levelApplies } from "@/lib/pricing/service";
import { partKey } from "@/lib/quotes/scope";
import { detachVersionDiscount, entryFor, newId, rateSnap, type CardEntry, type EditorLine, type EditorOption, type EditorQuote } from "./model";

export type PastCopy = {
  quote: EditorQuote;
  /** The new options' ids, in the order added. */
  added: string[];
  /** Card lines whose card price today differs from the one copied (or whose row is gone). Kept as copied. */
  cardMoved: number;
};

/** Today's card price for a line priced from the card, or null when its row (or material) is gone. Others: undefined. */
export function cardPriceNow(l: EditorLine, entries: CardEntry[], level: ReturnType<typeof levelOf>): number | null | undefined {
  if (l.sourceKind !== "rate" && l.sourceKind !== "stair") return undefined;
  const e = entryFor(l, entries);
  if (!e) return null;
  if (e.kind === "stair") return levelPrice(e.rate, level, levelApplies(l));
  const c = e.contractors.find((x) => x.name === l.contractor);
  if (!c) return null;
  if (l.materialId && !c.material?.choices.some((m) => m.id === l.materialId)) return null;
  return rateSnap(e, c, l.materialId, level).price;
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

/** The picked options added at the end of `q`, each an exact, independent copy with fresh ids. */
export function copyPastOptions(q: EditorQuote, picked: EditorOption[], entries: CardEntry[]): PastCopy {
  // A quote still on a version-wide discount rate would take it off the copies too: hand it to its own options first.
  const base = detachVersionDiscount(q);
  const taken = new Set(base.options.map((o) => o.name.trim().toLowerCase()));
  // One recommended option per Part (2026-10-30): one already recommended here keeps it.
  const recommended = new Set(base.options.filter((o) => o.recommended).map((o) => partKey(o)));
  const added: string[] = [];
  let cardMoved = 0;
  // Flooring choices (2026-11-26): floorings copied together stay one option under a new key, sharing one name; a
  // flooring copied on its own is an ordinary option.
  const inGroup = new Map<string, number>();
  for (const o of picked) if (o.choiceGroup) inGroup.set(o.choiceGroup, (inGroup.get(o.choiceGroup) ?? 0) + 1);
  const newKey = new Map<string, string>();
  const groupName = new Map<string, string>();
  const options = picked.map((src0): EditorOption => {
    const together = !!src0.choiceGroup && (inGroup.get(src0.choiceGroup) ?? 0) > 1;
    const { choiceGroup: oldKey, ...bare } = src0;
    const src: EditorOption = together
      ? { ...bare, choiceGroup: newKey.get(oldKey!) ?? (newKey.set(oldKey!, `cg_${Math.random().toString(36).slice(2, 10)}`), newKey.get(oldKey!)!) }
      : { ...bare, lines: bare.lines.map(({ choiceLine: _c, ...l }) => (void _c, l)) };
    const level = levelOf(src);
    const lines = src.lines.map((l) => {
      const now = cardPriceNow(l, entries, level);
      if (now !== undefined && now !== l.unitPriceSnap) cardMoved++;
      return { ...l, id: newId("line") };
    });
    const name = src.choiceGroup && groupName.has(src.choiceGroup) ? groupName.get(src.choiceGroup)! : freeName(src.name, taken);
    taken.add(name.toLowerCase());
    if (src.choiceGroup) groupName.set(src.choiceGroup, name);
    const key = partKey(src);
    const rec = src.recommended && !recommended.has(key);
    if (rec) recommended.add(key);
    const id = newId("opt");
    added.push(id);
    return { ...src, id, name, recommended: rec, lines };
  });
  return { quote: { ...base, options: [...base.options, ...options] }, added, cardMoved };
}

/** The panel's note after a copy, in plain words. */
export function pastNote(r: Pick<PastCopy, "added" | "cardMoved">): string {
  const n = r.added.length;
  const parts = [`Copied ${n} option${n === 1 ? "" : "s"} exactly, discounts included.`];
  if (r.cardMoved) parts.push(`${r.cardMoved} card line${r.cardMoved === 1 ? " is" : "s are"} priced differently on today's Rate Card; the copy keeps the old price${r.cardMoved === 1 ? "" : "s"}.`);
  return parts.join(" ");
}
