/**
 * Flooring choices (Albert, 2026-11-26: "is there an option; where the client is interested in multiple flooring options
 * for a particular project that doesn't change the labor items. Can there be a 'select' option that would allow the staff
 * to give options for particular flooring options"; vault 05_decisions/2026-11-26-quote-flooring-choices). Pure, no I/O.
 *
 * Under the hood every flooring is a real option, so totals, the Airtable check, acceptance, the contract, payouts and the
 * payment schedule work unchanged. Options sharing a `choiceGroup` are one option offered in several floorings:
 * - the first of them in the quote's order is shown first (the lead); it holds the shared lines and the editor shows only it;
 * - each option has one flooring line (`choiceLine`), the only line that differs between them;
 * - every other line, and the option's name, words, Part, scope, service level, crew, HST and schedule, follow the lead
 *   (`syncChoices()`, after every edit);
 * - the square feet and the waste are shared (Albert: waste "shared"); each flooring may be rounded up to its own whole
 *   boxes (`roundChoices()`), and typing new square feet on the lead puts every flooring back on them.
 * At most MAX_CHOICES floorings an option.
 */
import { isAcceptedLine, isAdjustmentLine, isContractorLine, isDiscountLine } from "@/lib/pricing/discounts";
import { fullBoxes, newId, type EditorLine, type EditorOption, type EditorQuote } from "./model";

export const MAX_CHOICES = 4;

/** The options of each flooring-choice group, in the quote's order. */
export function choiceGroups(q: Pick<EditorQuote, "options">): Map<string, EditorOption[]> {
  const out = new Map<string, EditorOption[]>();
  for (const o of q.options) if (o.choiceGroup) out.set(o.choiceGroup, [...(out.get(o.choiceGroup) ?? []), o]);
  return out;
}

/** The options of `o`'s group, the lead first; just `o` when it has none. */
export function choicesOf(q: Pick<EditorQuote, "options">, o: Pick<EditorOption, "id" | "choiceGroup">): EditorOption[] {
  if (!o.choiceGroup) return q.options.filter((x) => x.id === o.id);
  return q.options.filter((x) => x.choiceGroup === o.choiceGroup);
}

/** Whether `o` is a flooring choice that follows its group's lead (and so has no tab of its own). */
export const isFollower = (q: Pick<EditorQuote, "options">, o: Pick<EditorOption, "id" | "choiceGroup">) =>
  !!o.choiceGroup && choicesOf(q, o)[0]?.id !== o.id;

export const choiceLineOf = (o: Pick<EditorOption, "lines">) => o.lines.find((l) => l.choiceLine);

/** The flooring's name for the staff and the customer: its line's wording. */
export const choiceLabel = (o: Pick<EditorOption, "lines" | "name">) => choiceLineOf(o)?.description.trim() || o.name;

const groupKey = () => `cg_${Math.random().toString(36).slice(2, 10)}`;

const without = <T extends object, K extends keyof T>(x: T, k: K): Omit<T, K> => {
  const { [k]: _drop, ...rest } = x;
  void _drop;
  return rest;
};

/** Offer floorings on `optionId`: `lineId` (a Materials line) becomes the flooring line of a new group of one. */
export function startChoices(q: EditorQuote, optionId: string, lineId: string): EditorQuote {
  return {
    ...q,
    options: q.options.map((o) =>
      o.id !== optionId ? o : { ...o, choiceGroup: o.choiceGroup ?? groupKey(), lines: o.lines.map((l) => (l.id === lineId ? { ...l, choiceLine: true as const } : without(l, "choiceLine"))) },
    ),
  };
}

/**
 * Another flooring on the lead's group: a copy of the lead with `line` (the product picked) as its flooring line, on
 * the lead's square feet and waste. Placed after the group's last option. Refused past MAX_CHOICES.
 */
export function addChoice(q: EditorQuote, leadId: string, line: EditorLine): EditorQuote {
  const lead = q.options.find((o) => o.id === leadId);
  const floor = lead && choiceLineOf(lead);
  if (!lead || !floor || !lead.choiceGroup) return q;
  const group = choicesOf(q, lead);
  if (group.length >= MAX_CHOICES) return q;
  const option: EditorOption = {
    ...lead,
    id: newId("opt"),
    recommended: false,
    lines: lead.lines.map((l) => (l.choiceLine ? { ...line, id: newId("line"), section: floor.section, qty: floor.qty, waste: floor.waste, choiceLine: true as const } : { ...l, id: newId("line") })),
  };
  const at = q.options.indexOf(group[group.length - 1]) + 1;
  return { ...q, options: [...q.options.slice(0, at), option, ...q.options.slice(at)] };
}

/** Drop one flooring. The last one left is an ordinary option again. */
export function removeChoice(q: EditorQuote, optionId: string): EditorQuote {
  const o = q.options.find((x) => x.id === optionId);
  if (!o?.choiceGroup) return q;
  const left = q.options.filter((x) => x.id !== optionId);
  const rest = left.filter((x) => x.choiceGroup === o.choiceGroup);
  const lead = choicesOf(q, o)[0];
  return {
    ...q,
    options: left.map((x) => {
      if (x.choiceGroup !== o.choiceGroup) return x;
      // Removing the lead hands its Recommended to the next flooring.
      const rec = lead.id === o.id && x.id === rest[0]?.id ? { recommended: o.recommended } : {};
      return rest.length === 1 ? { ...without(x, "choiceGroup"), ...rec, lines: x.lines.map((l) => without(l, "choiceLine")) } : { ...x, ...rec };
    }),
  };
}

/** Show `optionId`'s flooring first: it takes the lead's place (and its Recommended), the old lead takes its place. */
export function showFirst(q: EditorQuote, optionId: string): EditorQuote {
  const o = q.options.find((x) => x.id === optionId);
  if (!o?.choiceGroup) return q;
  const lead = choicesOf(q, o)[0];
  if (lead.id === o.id) return q;
  const i = q.options.indexOf(lead);
  const j = q.options.indexOf(o);
  const options = [...q.options];
  options[i] = { ...o, recommended: lead.recommended };
  options[j] = { ...lead, recommended: false };
  return { ...q, options };
}

/**
 * Round floorings up to their whole boxes (`fullBoxes()`), each on its own box size: only their own quantity changes.
 * `boxSf` is each product's square feet a box, by record id.
 */
export function roundChoices(q: EditorQuote, optionIds: string[], boxSf: Readonly<Record<string, number | null | undefined>>): EditorQuote {
  return {
    ...q,
    options: q.options.map((o) => {
      if (!optionIds.includes(o.id)) return o;
      return {
        ...o,
        lines: o.lines.map((l) => {
          if (!l.choiceLine || !l.sourceId) return l;
          const fb = fullBoxes(l, boxSf[l.sourceId]);
          return fb && !fb.whole ? { ...l, qty: fb.qty } : l;
        }),
      };
    }),
  };
}

/**
 * Lines each flooring keeps as its own (Albert, 2026-11-26: "we should still be able to edit the pricing as usual on the
 * other options as well separately"): its flooring line and its price card's lines (discount items, the accepted price
 * and its adjustment, the contractor 10%). Every other line is shared.
 */
export const ownLine = (l: EditorLine) => !!l.choiceLine || isDiscountLine(l) || isAdjustmentLine(l) || isAcceptedLine(l) || isContractorLine(l);

const sharedSig = (o: EditorOption) =>
  JSON.stringify({
    l: o.lines.filter((l) => !ownLine(l)).map(({ id: _i, ...l }) => (void _i, l)),
    f: [o.name, o.description, o.serviceLevel, o.crew, o.privateLabel, o.scope, o.part, o.notOffered, o.showHst, o.schedule],
  });

/**
 * Every flooring follows the one just edited (`prev` is the quote before the edit): its shared lines and its option's
 * name, words, Part, scope, service level, crew, HST and schedule reach the others, whichever flooring it was. Each keeps
 * its own options id, its own lines (`ownLine()`) and its shared lines' ids where it can (matched in order). The square
 * feet and waste are shared: typed on one flooring, they reach every flooring, unless `keepQty` (a rounding to whole
 * boxes, a new lead). Only the first flooring may be Recommended. A group whose first flooring has no flooring line comes
 * apart into ordinary options.
 */
export function syncChoices(prev: EditorQuote, next: EditorQuote, keepQty = false): EditorQuote {
  const groups = choiceGroups(next);
  if (!groups.size) return next;
  const before = new Map(prev.options.map((o) => [o.id, o]));
  const replaced = new Map<string, EditorOption>();
  for (const os of groups.values()) {
    const lead = os[0];
    if (!choiceLineOf(lead)) {
      for (const o of os) replaced.set(o.id, { ...without(o, "choiceGroup"), lines: o.lines.map((l) => without(l, "choiceLine")) });
      continue;
    }
    // The flooring whose shared part changed is the source; with none, the first.
    const source = os.find((o) => before.has(o.id) && sharedSig(before.get(o.id)!) !== sharedSig(o)) ?? lead;
    // Square feet or waste typed on one flooring reach them all.
    const typed = os.find((o) => {
      const was = before.get(o.id) && choiceLineOf(before.get(o.id)!);
      const now = choiceLineOf(o);
      return was && now && (was.waste !== now.waste || (!keepQty && was.qty !== now.qty));
    });
    const typedFloor = typed && choiceLineOf(typed);
    const typedWas = typed && choiceLineOf(before.get(typed.id)!);
    for (const o of os) {
      const own = o.lines.filter(ownLine);
      const floor = choiceLineOf(o) ?? { ...choiceLineOf(source)!, id: newId("line") };
      const ids = o.lines.filter((l) => !ownLine(l)).map((l) => l.id);
      let k = 0;
      const shared = source.lines.filter((l) => !ownLine(l)).map((l) => (o.id === source.id ? l : { ...l, id: ids[k++] ?? newId("line") }));
      const flooring = {
        ...floor,
        ...(typedFloor && typedWas && typedFloor.waste !== typedWas.waste ? { waste: typedFloor.waste } : {}),
        ...(typedFloor && typedWas && !keepQty && typedFloor.qty !== typedWas.qty ? { qty: typedFloor.qty } : {}),
        choiceLine: true as const,
      };
      // The flooring line where the source has it, then the others' own price-card lines after the shared ones.
      const at = source.lines.filter((l) => !ownLine(l) || l.choiceLine).findIndex((l) => l.choiceLine);
      const lines = [...shared.slice(0, at), flooring, ...shared.slice(at), ...own.filter((l) => !l.choiceLine)];
      const base: EditorOption = {
        ...o,
        name: source.name,
        description: source.description,
        serviceLevel: source.serviceLevel,
        crew: source.crew,
        privateLabel: source.privateLabel,
        scope: source.scope,
        recommended: o.id === lead.id ? o.recommended : false,
        lines,
      };
      for (const key of ["part", "notOffered", "showHst", "schedule"] as const) {
        if (source[key] === undefined) delete (base as Partial<EditorOption>)[key];
        else (base as Record<string, unknown>)[key] = source[key];
      }
      replaced.set(o.id, base);
    }
  }
  return { ...next, options: next.options.map((o) => replaced.get(o.id) ?? o) };
}

/**
 * An option's name on the staff screens that list every option (the Send card, the quote page): a flooring of an option
 * offered in several reads "Main floor: Vinyl SPC (SKU)", so the floorings are told apart. Others: the name.
 */
export function staffName(
  options: { id: string; choiceGroup?: string | null }[],
  o: { id: string; name: string; choiceGroup?: string | null; lines: { choiceLine?: boolean; description: string | null }[] },
): string {
  if (!o.choiceGroup || options.filter((x) => x.choiceGroup === o.choiceGroup).length < 2) return o.name;
  const floor = o.lines.find((l) => l.choiceLine)?.description?.trim();
  return floor ? `${o.name}: ${floor}` : o.name;
}
