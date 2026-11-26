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
 * Every flooring follows its lead after an edit (`prev` is the quote before it). Each follower keeps its own options id,
 * its own flooring line and its line ids where it can (matched in order), and takes everything else from the lead. The
 * lead's square feet changing puts every flooring back on them, unless `keepQty` (a rounding, or a new lead). A group
 * whose lead has lost its flooring line comes apart into ordinary options.
 */
export function syncChoices(prev: EditorQuote, next: EditorQuote, keepQty = false): EditorQuote {
  const groups = choiceGroups(next);
  if (!groups.size) return next;
  const prevLeads = new Map([...choiceGroups(prev)].map(([k, os]) => [k, os[0]]));
  const replaced = new Map<string, EditorOption>();
  for (const [key, os] of groups) {
    const lead = os[0];
    const floor = choiceLineOf(lead);
    // A group of one stays (it is waiting for its second flooring); `removeChoice()` takes it apart.
    if (!floor) {
      for (const o of os) replaced.set(o.id, { ...without(o, "choiceGroup"), lines: o.lines.map((l) => without(l, "choiceLine")) });
      continue;
    }
    const was = prevLeads.get(key);
    const wasFloor = was && was.id === lead.id ? choiceLineOf(was) : undefined;
    const sfChanged = !keepQty && !!wasFloor && wasFloor.qty !== floor.qty;
    for (const f of os.slice(1)) {
      const own = choiceLineOf(f) ?? { ...floor, id: newId("line") };
      const ids = f.lines.filter((l) => !l.choiceLine).map((l) => l.id);
      let k = 0;
      const lines = lead.lines.map((l) =>
        l.choiceLine
          ? { ...own, section: floor.section, waste: floor.waste, qty: sfChanged ? floor.qty : own.qty, choiceLine: true as const }
          : { ...l, id: ids[k++] ?? newId("line") },
      );
      replaced.set(f.id, {
        ...f,
        name: lead.name,
        description: lead.description,
        serviceLevel: lead.serviceLevel,
        crew: lead.crew,
        privateLabel: lead.privateLabel,
        scope: lead.scope,
        ...(lead.part ? { part: lead.part } : {}),
        ...(lead.notOffered ? { notOffered: true as const } : {}),
        ...(lead.showHst !== undefined ? { showHst: lead.showHst } : {}),
        ...(lead.schedule ? { schedule: lead.schedule } : {}),
        recommended: false,
        lines,
      });
      if (!lead.part) delete (replaced.get(f.id) as Partial<EditorOption>).part;
      if (!lead.notOffered) delete (replaced.get(f.id) as Partial<EditorOption>).notOffered;
      if (lead.showHst === undefined) delete (replaced.get(f.id) as Partial<EditorOption>).showHst;
      if (!lead.schedule) delete (replaced.get(f.id) as Partial<EditorOption>).schedule;
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
