import { lineFromEntry, type CardEntry, type EditorLine } from "@/lib/editor/model";
import type { ServiceLevel } from "@/lib/pricing/service";
import type { StairProfileRow } from "@/lib/quotes/types";

/**
 * The stair builder (Albert, 2026-10-20): turns a Stair Profiles row and a few counts into the
 * INQ's bill of pieces, as Stair Item lines in the Stairs section. The row's links say which items
 * are counted per step (every step: risers, sanding), per boxed / open-side / curved step (each
 * type's own step piece, 2026-11-02), per staircase, per foot of handrail, per foot of nosing, per
 * landing (2026-11-02), per spindle and per post;
 * the counts come from the row's presets or the person measuring. Pure, no I/O; tested in
 * tests/stairBuilder.test.ts. Nothing is guessed: an item the card no longer offers is reported.
 */

export type BuilderInput = {
  steps: number;
  /** Boxed (2 side closed) steps; null = the steps that are not open-side or curved. */
  boxedSteps: number | null;
  openSideSteps: number;
  curvedSteps: number;
  handrailFt: number;
  /** Linear feet of nosing (2026-11-02). */
  nosingFt: number;
  /** Landings (2026-11-02). */
  landings: number;
  spindles: number;
  posts: number;
};

/**
 * Where the builder starts, and what the preliminary assumes (2026-11-02): the profile's step count
 * and its preset counts (blank in Airtable = 0; a blank Preset Boxed Steps = the rest of the steps).
 */
export const defaultInput = (p: Pick<StairProfileRow, "steps" | "preset">): BuilderInput => ({
  steps: p.steps ?? 13,
  boxedSteps: p.preset?.boxedSteps ?? null,
  openSideSteps: p.preset?.openSideSteps ?? 0,
  curvedSteps: p.preset?.curvedSteps ?? 0,
  handrailFt: p.preset?.handrailFt ?? 0,
  nosingFt: p.preset?.nosingFt ?? 0,
  landings: p.preset?.landings ?? 0,
  spindles: p.preset?.spindles ?? 0,
  posts: p.preset?.posts ?? 0,
});

export type BuilderResult = {
  lines: EditorLine[];
  /** Stair Item record ids the template names that the card no longer offers (inactive or deleted). */
  missing: string[];
  /** The profile has no template at all: nothing can be generated until its links are set in Airtable. */
  untemplated: boolean;
};

const whole = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
/** Feet keep one decimal (nosing is sold by the foot). */
const feet = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0);

/** How many steps of each type: open-side and curved as given (never more than the steps), boxed as given or the rest. */
export function stepSplit(input: BuilderInput): { steps: number; boxed: number; open: number; curved: number } {
  const steps = whole(input.steps);
  const open = Math.min(whole(input.openSideSteps), steps);
  const curved = Math.min(whole(input.curvedSteps), steps - open);
  const boxed = input.boxedSteps === null || input.boxedSteps === undefined ? steps - open - curved : whole(input.boxedSteps);
  return { steps, boxed, open, curved };
}

/** `area` labels every line (the stair type by default; "Main stairs 2" when a quote has two, 2026-11-02). */
export function expandProfile(p: StairProfileRow, input: BuilderInput, catalogue: CardEntry[], level: ServiceLevel = "Standard", area: string = p.type): BuilderResult {
  const t = p.template;
  const untemplated = [t.perStep, t.perBoxed, t.perOpenSide, t.perCurved, t.perStaircase, t.perHandrailFt, t.perNosingFt, t.perLanding, t.perSpindle, t.perPost].every((ids) => (ids ?? []).length === 0);
  const entries = new Map(catalogue.flatMap((e) => (e.kind === "stair" ? [[e.recordId, e] as const] : [])));
  const { steps, boxed, open, curved } = stepSplit(input);
  // Each step type counts its own piece; Per step is what every step gets, whatever its type (risers, sanding).
  const buckets: [string[], number][] = [
    [t.perStep, steps],
    [t.perBoxed ?? [], boxed],
    [t.perOpenSide, open],
    [t.perCurved ?? [], curved],
    [t.perStaircase, 1],
    [t.perHandrailFt, whole(input.handrailFt)],
    [t.perNosingFt ?? [], feet(input.nosingFt)],
    [t.perLanding ?? [], whole(input.landings)],
    [t.perSpindle, whole(input.spindles)],
    [t.perPost, whole(input.posts)],
  ];
  const lines: EditorLine[] = [];
  const missing: string[] = [];
  for (const [ids, qty] of buckets) {
    for (const id of ids) {
      const e = entries.get(id);
      if (!e) {
        if (!missing.includes(id)) missing.push(id);
        continue;
      }
      if (qty <= 0) continue;
      lines.push({ ...lineFromEntry(e, "Stairs", undefined, level), qty, area });
    }
  }
  return { lines, missing, untemplated };
}
