import { lineFromEntry, type CardEntry, type EditorLine } from "@/lib/editor/model";
import type { ServiceLevel } from "@/lib/pricing/service";
import type { StairProfileRow } from "@/lib/quotes/types";

/**
 * The stair builder (Albert, 2026-10-20): turns a Stair Profiles row and a few counts into the
 * INQ's bill of pieces, as Stair Item lines in the Stairs section. The row's six "Per …" links say
 * which items are counted per step, per staircase, per open-side step, per foot of handrail, per
 * spindle and per post; the counts come from the person measuring. Pure, no I/O; tested in
 * tests/stairBuilder.test.ts. Nothing is guessed: an item the card no longer offers is reported.
 */

export type BuilderInput = { steps: number; openSideSteps: number; handrailFt: number; spindles: number; posts: number };

/** Where the builder starts: the profile's step count, nothing else. */
export const defaultInput = (p: Pick<StairProfileRow, "steps">): BuilderInput => ({ steps: p.steps ?? 13, openSideSteps: 0, handrailFt: 0, spindles: 0, posts: 0 });

export type BuilderResult = {
  lines: EditorLine[];
  /** Stair Item record ids the template names that the card no longer offers (inactive or deleted). */
  missing: string[];
  /** The profile has no template at all: nothing can be generated until its links are set in Airtable. */
  untemplated: boolean;
};

const whole = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

export function expandProfile(p: StairProfileRow, input: BuilderInput, catalogue: CardEntry[], level: ServiceLevel = "Standard"): BuilderResult {
  const t = p.template;
  const untemplated = [t.perStep, t.perStaircase, t.perOpenSide, t.perHandrailFt, t.perSpindle, t.perPost].every((ids) => ids.length === 0);
  const entries = new Map(catalogue.flatMap((e) => (e.kind === "stair" ? [[e.recordId, e] as const] : [])));
  const steps = whole(input.steps);
  const open = Math.min(whole(input.openSideSteps), steps);
  // An open-side step is still a step for risers and sanding; only a plain step piece gives way to its open-side piece.
  const openStepPiece = t.perOpenSide.some((id) => entries.get(id)?.category === "step");
  const buckets: [string[], (e: Extract<CardEntry, { kind: "stair" }>) => number][] = [
    [t.perStep, (e) => (openStepPiece && e.category === "step" ? steps - open : steps)],
    [t.perOpenSide, () => open],
    [t.perStaircase, () => 1],
    [t.perHandrailFt, () => whole(input.handrailFt)],
    [t.perSpindle, () => whole(input.spindles)],
    [t.perPost, () => whole(input.posts)],
  ];
  const lines: EditorLine[] = [];
  const missing: string[] = [];
  for (const [ids, qtyOf] of buckets) {
    for (const id of ids) {
      const e = entries.get(id);
      if (!e) {
        if (!missing.includes(id)) missing.push(id);
        continue;
      }
      const qty = qtyOf(e);
      if (qty <= 0) continue;
      lines.push({ ...lineFromEntry(e, "Stairs", undefined, level), qty, area: p.type });
    }
  }
  return { lines, missing, untemplated };
}
