import { PRIVATE_SECTION, sectionOf } from "@/lib/calc";
import { lineFromEntry, type CardEntry, type EditorLine, type EditorOption, type EditorQuote } from "@/lib/editor/model";
import { optionScope } from "@/lib/quotes/scope";

/**
 * The two fees every option starts with (Albert, 2026-11-06). Pure; tested in tests/fees.test.ts.
 *
 * - Delivery: "Add in Delivery Fee as a Standard for every flooring option. It can be removed ... Once it goes into a
 *   measured; then add the line in automatically." $200 flat per job, cost 0 ("we deliver. all margin"). The Rate Card
 *   row Delivery | Standard Delivery. Shown to the customer as a Delivery line. Never on a preliminary.
 * - Stair base fee: "For any stair option, a fee of $200 should be 'baked in' somewhere without customer seeing it. It
 *   should just start at $200, even with NO line items present." Since 2026-11-07 (Albert: "Stair Base Fee can just be
 *   named 'Delivery' and use the same line item") it is the same Delivery row, in the stairs option's Private section,
 *   which the customer never sees. Measured or preliminary alike.
 *
 * Both are added when an option is made (or a preliminary is saved as the measured next draft), never on every load,
 * so a fee someone removed stays removed.
 */
export const DELIVERY_KEY = "Delivery|Standard Delivery";

const entry = (entries: CardEntry[], key: string) => entries.find((e) => e.kind === "rate" && e.key === key);
const has = (o: EditorOption, key: string) => o.lines.some((l) => l.sourceKind === "rate" && `${l.labourType}|${l.spec}` === key);
const hasDelivery = (o: EditorOption) => has(o, DELIVERY_KEY) || o.lines.some((l) => sectionOf(l) === "Delivery");

/** The fee line this option should start with, or null: none due, it has one already, or the Rate Card row is gone. */
export function feeFor(o: EditorOption, entries: CardEntry[], measured: boolean): EditorLine | null {
  if (optionScope(o) === "Stairs") {
    const e = entry(entries, DELIVERY_KEY);
    return e && !hasDelivery(o) ? lineFromEntry(e, PRIVATE_SECTION) : null;
  }
  const e = entry(entries, DELIVERY_KEY);
  return measured && e && !hasDelivery(o) ? lineFromEntry(e, "Delivery") : null;
}

/** Each named option (every option when `ids` is absent) given the fee it starts with. */
export function withFees(q: EditorQuote, entries: CardEntry[], measured: boolean, ids?: string[]): EditorQuote {
  let changed = false;
  const options = q.options.map((o) => {
    if (ids && !ids.includes(o.id)) return o;
    const fee = feeFor(o, entries, measured);
    if (!fee) return o;
    changed = true;
    return { ...o, lines: [...o.lines, fee] };
  });
  return changed ? { ...q, options } : q;
}

/** The options `next` has that `before` did not: the ones just made. */
export const newOptionIds = (before: EditorQuote, next: EditorQuote) => next.options.filter((o) => !before.options.some((b) => b.id === o.id)).map((o) => o.id);

/** A stairs option's Delivery line, in Private, for one built on the server (a new preliminary); null without the Rate Card row. */
export function stairBaseLine(entries: CardEntry[]): EditorLine | null {
  const e = entry(entries, DELIVERY_KEY);
  return e ? lineFromEntry(e, PRIVATE_SECTION) : null;
}
