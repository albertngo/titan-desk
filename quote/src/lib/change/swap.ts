import { optionTotals, stageAmountProblems, stageAmounts } from "@/lib/calc";
import { newId, type EditorLine, type EditorOption, type EditorQuote } from "@/lib/editor/model";
import { defaultSchedule } from "@/lib/pricing/schedule";
import { optionScope, partKey } from "@/lib/quotes/scope";
import type { Scope } from "@/lib/quotes/types";

/**
 * Swap option, on a change after acceptance (Albert, 2026-10-30: "sent for record is fine"; first the
 * accepted version only, then, the same day, any version of the quote, matched by Part). A customer who changes their mind about which option they want, say the other stairs,
 * gets it as a change: the lines of the option they took come out, the lines of the option they now
 * want come in exactly as they were quoted on the accepted version, and the change goes out for the
 * record like any other, the schedule worked out again on the new total. Only an option of the same
 * Part as the pick it replaces. Pure; tested in tests/change.test.ts.
 */

/** An option that can come in, and the version it is on (null = the accepted version itself). */
export type SwapCandidate = EditorOption & { from: number | null };

/** One option the customer took, and the options of the same Part (scope before 2026-10-30) they could take instead. */
export type SwapPick = {
  name: string;
  description: string;
  scope: Scope;
  /** Its Part, else its scope: what the candidates are alternatives within. */
  part: string;
  /** Its lines as accepted: used to find them in the change. */
  lines: EditorLine[];
  /** Included lines only: the add-ons the customer didn't take on those are gone, as Make a change drops them. */
  candidates: SwapCandidate[];
};

/** What the change editor can swap from: the accepted version's number and, per pick, the alternatives. */
export type SwapSource = { version: number | null; picks: SwapPick[] };

/** Two options that are the same work at the same prices, wherever they are: the same name and the same included lines. */
const sameOption = (a: EditorOption, b: EditorOption) => {
  const sig = (o: EditorOption) => JSON.stringify([o.name.trim().toLowerCase(), o.lines.filter((l) => l.include).map((l) => [key(l), l.qty, l.unitPrice ?? l.unitPriceSnap])]);
  return sig(a) === sig(b);
};

/**
 * The swap choices on an accepted version, from the options its acceptance took (`refs`, the option ids). Since
 * 2026-10-30 (one working quote, vault 05_decisions/2026-10-30-quote-one-working-quote) the alternatives are the
 * options of the same Part on the accepted version and on `others`, the quote's other versions newest first, an
 * option that is the same as one already listed (or as the pick itself) shown once. A pick with no alternative is
 * left out; null when nothing can be swapped at all.
 */
export function swapSource(accepted: EditorQuote, refs: (string | null)[], version: number | null, others: { version: number | null; quote: EditorQuote }[] = []): SwapSource | null {
  const taken = new Set(refs.filter((r): r is string => !!r));
  const pool: SwapCandidate[] = [
    ...accepted.options.filter((c) => !taken.has(c.id)).map((c) => ({ ...c, from: null })),
    ...others.flatMap((v) => v.quote.options.map((c) => ({ ...c, from: v.version }))),
  ]
    .map((c) => ({ ...c, lines: c.lines.filter((l) => l.include) }))
    .filter((c) => c.lines.length > 0);
  const picks = accepted.options.flatMap((o): SwapPick[] => {
    if (!taken.has(o.id)) return [];
    const part = partKey(o);
    const candidates: SwapCandidate[] = [];
    for (const c of pool) if (partKey(c) === part && !sameOption(c, o) && !candidates.some((x) => sameOption(x, c))) candidates.push(c);
    return candidates.length ? [{ name: o.name, description: o.description, scope: optionScope(o), part, lines: o.lines, candidates }] : [];
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
