import { optionTotals, stageAmountProblems, stageAmounts } from "@/lib/calc";
import { newId, type EditorLine, type EditorOption, type EditorQuote } from "@/lib/editor/model";
import { defaultSchedule } from "@/lib/pricing/schedule";
import { optionScope } from "@/lib/quotes/scope";
import type { Scope } from "@/lib/quotes/types";

/**
 * Swap option, on a change after acceptance (Albert, 2026-10-30: "sent for record is fine, accepted
 * version only"). A customer who changes their mind about which option they want, say the other stairs,
 * gets it as a change: the lines of the option they took come out, the lines of the option they now
 * want come in exactly as they were quoted on the accepted version, and the change goes out for the
 * record like any other, with the difference on the final payment. Only options of the accepted
 * version, and only one of the same scope as the pick it replaces. Pure; tested in tests/change.test.ts.
 */

/** One option the customer took, and the options of the same scope on the accepted version they could take instead. */
export type SwapPick = {
  name: string;
  description: string;
  scope: Scope;
  /** Its lines as accepted: used to find them in the change. */
  lines: EditorLine[];
  /** Included lines only: the add-ons the customer didn't take on those are gone, as Make a change drops them. */
  candidates: EditorOption[];
};

/** What the change editor can swap from: the accepted version's number and, per pick, the alternatives. */
export type SwapSource = { version: number | null; picks: SwapPick[] };

/**
 * The swap choices on an accepted version, from the options its acceptance took (`refs`, the option ids).
 * A pick with no alternative of its scope is left out; null when nothing can be swapped at all.
 */
export function swapSource(accepted: EditorQuote, refs: (string | null)[], version: number | null): SwapSource | null {
  const taken = new Set(refs.filter((r): r is string => !!r));
  const picks = accepted.options.flatMap((o): SwapPick[] => {
    if (!taken.has(o.id)) return [];
    const scope = optionScope(o);
    const candidates = accepted.options
      .filter((c) => !taken.has(c.id) && optionScope(c) === scope)
      .map((c) => ({ ...c, lines: c.lines.filter((l) => l.include) }))
      .filter((c) => c.lines.length > 0);
    return candidates.length ? [{ name: o.name, description: o.description, scope, lines: o.lines, candidates }] : [];
  });
  return picks.length ? { version, picks } : null;
}

const key = (l: EditorLine) => `${(l.section ?? "").toLowerCase()}|${l.description.toLowerCase().replace(/\s+/g, " ").trim()}`;

/**
 * The change's lines that came from `replaced`, matched by section and wording (the way the What changed
 * box matches lines), one for one. A line edited since may not match: the person ticks it themselves.
 */
export function swapMatches(current: EditorLine[], replaced: EditorLine[]): string[] {
  const pool = new Map<string, number>();
  for (const l of replaced) pool.set(key(l), (pool.get(key(l)) ?? 0) + 1);
  return current.flatMap((l) => {
    const n = pool.get(key(l)) ?? 0;
    if (n === 0) return [];
    pool.set(key(l), n - 1);
    return [l.id];
  });
}

/**
 * The change with `remove` taken out of the option and `incoming`'s lines put in where the first of them
 * was (at the end when nothing is removed), each a new line. When every line is replaced the option takes
 * the incoming one's name, description, service level, crew, Private label and scope; otherwise only the
 * replaced pick's name and description, where they still appear, are swapped for the incoming ones.
 */
export function swapOption(q: EditorQuote, optionId: string, remove: string[], incoming: EditorOption, replaced: { name: string; description: string }): EditorQuote {
  const out = new Set(remove);
  return {
    ...q,
    options: q.options.map((o) => {
      if (o.id !== optionId) return o;
      const at = o.lines.findIndex((l) => out.has(l.id));
      const kept = o.lines.filter((l) => !out.has(l.id));
      const before = at < 0 ? kept.length : o.lines.slice(0, at).filter((l) => !out.has(l.id)).length;
      const added = incoming.lines.filter((l) => l.include).map((l) => ({ ...l, id: newId("line") }));
      const lines = [...kept.slice(0, before), ...added, ...kept.slice(before)];
      if (kept.length === 0) {
        return {
          ...o,
          name: incoming.name,
          description: incoming.description,
          serviceLevel: incoming.serviceLevel,
          crew: incoming.crew ?? null,
          privateLabel: incoming.privateLabel ?? null,
          scope: incoming.scope ?? null,
          lines,
        };
      }
      const name = replaced.name && o.name.includes(replaced.name) ? o.name.replace(replaced.name, incoming.name) : o.name;
      const description = replaced.description && o.description.includes(replaced.description) ? o.description.replace(replaced.description, incoming.description) : o.description;
      return { ...o, name, description, lines };
    }),
  };
}

/** What a swap would leave: the option's total with HST, and what the payment schedule would make of it. */
export function swapPreview(q: EditorQuote, optionId: string): { total: number; problems: string[] } {
  const o = q.options.find((x) => x.id === optionId);
  if (!o) return { total: 0, problems: [] };
  const t = optionTotals(o.lines, q.discountRate, q.showHst);
  const stages = stageAmounts(q.schedule ?? defaultSchedule(), o.lines, q.discountRate, q.showHst, t.total);
  return { total: t.total, problems: stageAmountProblems(stages, o.name || "this option") };
}
