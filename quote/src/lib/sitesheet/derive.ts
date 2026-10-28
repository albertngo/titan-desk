import { TREAD_TYPES, type SiteSheet, type TreadType, type WidthCounts } from "./sheet";

/**
 * What the app works out from the site sheet so the PM never has to (Albert, 2026-10-28):
 * - risers: one per tread, one per landing (a half moon counts) and one for the top floor;
 * - open sides, and so the stringers and spindles that show, from the tread grid;
 * - spindles: 2 a regular step, 2 a pie or pizza piece, 3 a 2-side-open step, plus 3 a foot of nosing
 *   with picket holes. More is always fine: a written count higher than this wins, and a written count
 *   lower than this is used but flagged to confirm;
 * - picket heights: on the steps they alternate 36" and 39" (more 36s), the flat top is all 36";
 * - oak for landings at about 20 sq ft a box (3 × 3 when the size isn't written).
 * Pure; tested in tests/sitesheet.test.ts.
 */

export type Count = { value: number; how: "calculated" | "written" };

export type Derived = {
  /** Main staircase treads: the grid, pie steps, pizza-set pieces and bullnoses. */
  treads: number;
  /** The side / half staircase's treads (B10). */
  sideTreads: number;
  landings: number;
  halfMoons: number;
  risers: number;
  /** Which sides of the main staircase are open, from the grid. */
  open: { left: boolean; right: boolean };
  openSides: 0 | 1 | 2;
  spindles: Count & { estimate: number };
  heights: { h36: number; h39: number; h42: number; how: "calculated" | "written" };
  posts: { now: number; add: number };
  railFt: number;
  nosing: { pieces: number; newPieces: number; holedPieces: number; sandPieces: number; feet: number; holedFt: number };
  oakBoxes: number;
  /** Things a person must look at before the quote is trusted. */
  flags: string[];
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const sumW = (w: WidthCounts) => n(w.w36) + n(w.w42) + n(w.w48) + n(w.other);
const pieceCount = (s: SiteSheet) => s.pizzaPieces ?? 3;

/** Treads of each open-side type, across the grid and the special rows (pizza sets counted in pieces). */
export function treadsBySide(s: SiteSheet): Record<TreadType, number> {
  const out = { rso: 0, lso: 0, boxed: 0, two: 0 } as Record<TreadType, number>;
  for (const t of TREAD_TYPES) {
    out[t] += sumW(s.treads[t]);
    out[t] += n(s.pie[t]);
    out[t] += n(s.pizza[t]) * pieceCount(s);
    out[t] += n(s.bullnose[t]);
  }
  return out;
}

export function derive(s: SiteSheet): Derived {
  const by = treadsBySide(s);
  const treads = by.rso + by.lso + by.boxed + by.two;
  const sideTreads = n(s.side.steps);
  const halfMoons = n(s.halfMoons.count);
  const landings = n(s.landings.s3x3) + n(s.landings.s3x6) + n(s.landings.other);
  const flags: string[] = [];

  const open = { left: by.lso + by.two > 0, right: by.rso + by.two > 0 };
  const openSides = ((open.left ? 1 : 0) + (open.right ? 1 : 0)) as 0 | 1 | 2;

  // Risers: one more than the steps, with every landing (and a half moon) counted as a step.
  const risers = treads > 0 ? treads + landings + halfMoons + 1 : 0;

  // Spindles on the steps: 2 on a one-side-open tread (pie and pizza pieces too), 3 on a 2-side-open one.
  const regular = by.rso + by.lso;
  const stepEstimate = regular * 2 + by.two * 3;
  const holedFt = s.nosings.reduce((t, p) => t + n(p.holed), 0);
  const flatEstimate = Math.ceil(holedFt * 3);
  const estimate = stepEstimate + flatEstimate;
  const writtenAny = s.spindles.onSteps !== null || s.spindles.flatTop !== null;
  const written = n(s.spindles.onSteps) + n(s.spindles.flatTop);
  let spindles: Derived["spindles"];
  if (writtenAny) {
    spindles = { value: written, how: "written", estimate };
    if (written < estimate) flags.push(`Spindles: the sheet says ${written}, the steps and picket-hole nosing suggest ${estimate}. Confirm the count.`);
  } else {
    spindles = { value: estimate, how: "calculated", estimate };
  }

  // Picket heights: written counts win; otherwise steps alternate 36/39 (the extra one is a 36), the flat top is 36.
  let heights: Derived["heights"];
  if (s.heights.h36 !== null || s.heights.h39 !== null || s.heights.h42 !== null) {
    heights = { h36: n(s.heights.h36), h39: n(s.heights.h39), h42: n(s.heights.h42), how: "written" };
  } else {
    const onSteps = writtenAny ? n(s.spindles.onSteps) : stepEstimate;
    const flat = writtenAny ? n(s.spindles.flatTop) : flatEstimate;
    heights = { h36: Math.ceil(onSteps / 2) + flat, h39: Math.floor(onSteps / 2), h42: 0, how: "calculated" };
  }

  const pieces = s.nosings.filter((p) => n(p.full) > 0 || n(p.holed) > 0);
  const nosing = {
    pieces: pieces.length,
    newPieces: pieces.filter((p) => !p.sand).length,
    holedPieces: pieces.filter((p) => !p.sand && n(p.holed) > 0).length,
    sandPieces: pieces.filter((p) => p.sand).length,
    feet: pieces.reduce((t, p) => t + Math.max(n(p.full), n(p.holed)), 0),
    holedFt,
  };

  const landingSqft = n(s.landings.s3x3) * 9 + n(s.landings.s3x6) * 18 + n(s.landings.other) * 9;
  const oakBoxes = Math.ceil(landingSqft / 20);

  if (s.totalTreads !== null && s.totalTreads !== treads) flags.push(`Total treads: the sheet says ${s.totalTreads}, the boxes add up to ${treads}.`);
  if (treads === 0) flags.push("No treads were read on the main staircase.");
  if (s.want.treads.length === 0) flags.push("Nothing is ticked under What the customer wants (G1), so no option can be built. Tick one, or Not sure.");
  if (s.where.includes("Side") && sideTreads === 0) flags.push("A side or half staircase is ticked, but its steps (B10) are blank.");
  if (s.shape === "Curved" || s.shape === "Spiral") flags.push(`${s.shape} staircase: new caps are recommended, and the curve has no piece on the card.`);
  if (s.onSteps === null) flags.push("What is on the steps now (A3) is blank, so sanding can't be offered.");
  if (s.unclear.length) flags.push(`Couldn't be read with confidence: ${s.unclear.join(", ")}. Check them against the photo.`);

  return {
    treads,
    sideTreads,
    landings,
    halfMoons,
    risers,
    open,
    openSides,
    spindles,
    heights,
    posts: { now: n(s.posts.now), add: n(s.posts.add) },
    railFt: n(s.rail.stairsFt) + n(s.rail.landingFt) + n(s.rail.flatFt),
    nosing,
    oakBoxes,
    flags,
  };
}
