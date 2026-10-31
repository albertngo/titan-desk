import { TREAD_TYPES, type SiteSheet, type TreadType, type WidthCounts } from "./sheet";

/**
 * What the app works out from the site sheet so the PM never has to (Albert, 2026-10-28):
 * - risers: one per tread, one per landing (a half moon counts) and one for the top floor;
 * - open sides, and so the stringers and spindles that show, from the tread grid;
 * - spindles (Albert, 2026-10-28, after the first real sheet: "there should always be 3 spindles per foot of
 *   handrail"): 3 a foot of picket feet, on the steps and flat alike (a run's picket feet are written, or its
 *   whole length when Pickets is ticked). With no railing runs written at all, an open staircase falls back
 *   to the per-step estimate (2 a step, 3 a 2-side-open step). More is always fine: a written count higher
 *   than this wins, and a written count lower than this is used but flagged to confirm;
 * - the rail check: the on-steps runs added up (a staircase's rail is often in pieces) against about
 *   1.1 ft a tread, or twice that on a 2-side-open staircase, which may have a rail on each side;
 * - holed nosings: one per flat run with pickets, as long as its picket feet;
 * - custom pieces (sheet v5): a 2-piece pizza set, or a 3-piece one that is 2-side open; every 2-side-open
 *   bullnose (LSO and RSO bullnoses are standard);
 * - wall-rail brackets: the first 1 ft in, then one every 2 ft, so floor((ft − 1) / 2) + 1 a wall run;
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
  /** Handrail feet by kind (sheet v4 runs): new straight and curved rail are priced apart. */
  rail: { straightFt: number; curvedFt: number; wallFt: number; flatPicketFt: number; totalFt: number };
  nosing: { pieces: number; newPieces: number; holedPieces: number; sandPieces: number; feet: number; newFt: number; holedFt: number };
  oakBoxes: number;
  /** Pizza sets (B7, all of them) and the bullnoses and pizza sets that need a custom piece (sheet v5). */
  pizzaSets: number;
  custom: { pizzaSets: number; bullnoses: number };
  /** Brackets for the wall runs. */
  brackets: number;
  /** Things for the job, not the price: hardware and the like. */
  notes: string[];
  /** Things a person must look at before the quote is trusted. */
  flags: string[];
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const sumW = (w: WidthCounts) => n(w.w36) + n(w.w42) + n(w.w48) + n(w.other);
/**
 * The corner turn (pizza) sets, B7 (2026-10-31): 2-piece and 3-piece counts, and how many of them are 2 side open.
 * 2-side-open sets beyond the 2-pc + 3-pc counts are counted as 3-piece (3 when not marked, as before). Which
 * sets are the 2-side-open ones isn't written, so they are taken as the 3-piece ones first: a 2-piece set is
 * custom anyway, and this never undercounts the custom pieces.
 */
export function pizzaCounts(s: SiteSheet) {
  const two = n(s.pizza.two);
  const pc2 = n(s.pizza.pc2);
  const byPieces = pc2 + n(s.pizza.pc3);
  const extra = Math.max(0, two - byPieces);
  const pc3 = n(s.pizza.pc3) + extra;
  const two3 = Math.min(two, pc3);
  const two2 = two - two3;
  return {
    sets: pc2 + pc3,
    pieces: pc2 * 2 + pc3 * 3,
    twoSide: two,
    twoSidePieces: two3 * 3 + two2 * 2,
    custom: pc2 + two3,
    /** 2-side-open sets written beyond the 2-pc / 3-pc counts, when those counts were written at all. */
    overCount: byPieces > 0 ? extra : 0,
  };
}
/** Pizza-set treads: each set is 2 or 3 pieces. */
export const pizzaTreads = (s: SiteSheet) => pizzaCounts(s).pieces;

/** Treads of each open-side type across the grid, pie steps and bullnoses. Pizza sets have no open side; see pizzaTreads. */
export function treadsBySide(s: SiteSheet): Record<TreadType, number> {
  const out = { rso: 0, lso: 0, boxed: 0, two: 0 } as Record<TreadType, number>;
  for (const t of TREAD_TYPES) {
    out[t] += sumW(s.treads[t]);
    out[t] += n(s.pie[t]);
    out[t] += n(s.bullnose[t]);
  }
  return out;
}

/** Wall-rail brackets for one run: the first 1 ft in, then one every 2 ft. */
export const bracketsFor = (ft: number) => (ft >= 1 ? Math.floor((ft - 1) / 2) + 1 : ft > 0 ? 1 : 0);

export function derive(s: SiteSheet): Derived {
  const by = treadsBySide(s);
  const pz = pizzaCounts(s);
  const pizza = pz.pieces;
  const treads = by.rso + by.lso + by.boxed + by.two + pizza;
  const sideTreads = n(s.side.steps);
  const halfMoons = n(s.halfMoons.count);
  const landings = n(s.landings.s3x3) + n(s.landings.s3x6) + n(s.landings.other);
  const flags: string[] = [];

  const twoSidePizza = pz.twoSide > 0;
  const open = { left: by.lso + by.two > 0 || twoSidePizza, right: by.rso + by.two > 0 || twoSidePizza };
  const openSides = ((open.left ? 1 : 0) + (open.right ? 1 : 0)) as 0 | 1 | 2;

  // Risers: one more than the steps, with every landing (and a half moon) counted as a step.
  const risers = treads > 0 ? treads + landings + halfMoons + 1 : 0;

  // Spindles: 3 a foot of rail with pickets. Only with no runs written at all, the per-step fallback:
  // 2 on a one-side-open tread (pie and pizza pieces too), 3 on a 2-side-open one.
  const regular = by.rso + by.lso + (pizza - pz.twoSidePieces);
  const twoSided = by.two + pz.twoSidePieces;
  const picketFt = (x: SiteSheet["runs"][number]) => (x.pickets ? (x.picketFt ?? x.ft ?? 0) : n(x.picketFt));
  const stepRuns = s.runs.filter((x) => x.where === "S");
  const flatPicketRuns = s.runs.filter((x) => x.where === "F" && picketFt(x) > 0);
  const stepPicketFt = stepRuns.reduce((t, x) => t + picketFt(x), 0);
  const stepEstimate = s.runs.length === 0 ? (openSides > 0 ? regular * 2 + twoSided * 3 : 0) : Math.ceil(stepPicketFt * 3);
  const holedFt = flatPicketRuns.reduce((t, x) => t + picketFt(x), 0);
  const flatEstimate = Math.ceil(holedFt * 3);
  const estimate = stepEstimate + flatEstimate;
  const writtenAny = s.spindles.onSteps !== null || s.spindles.flatTop !== null;
  const written = n(s.spindles.onSteps) + n(s.spindles.flatTop);
  let spindles: Derived["spindles"];
  if (writtenAny) {
    spindles = { value: written, how: "written", estimate };
    if (written < estimate) flags.push(`Spindles: the sheet says ${written}, the steps and railing suggest ${estimate}. Confirm the count.`);
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

  const pieces = s.nosings.filter((p) => n(p.ft) > 0);
  const nosing = {
    pieces: pieces.length,
    newPieces: pieces.filter((p) => !p.sand).length,
    holedPieces: flatPicketRuns.length,
    sandPieces: pieces.filter((p) => p.sand).length,
    feet: pieces.reduce((t, p) => t + n(p.ft), 0),
    newFt: pieces.filter((p) => !p.sand).reduce((t, p) => t + n(p.ft), 0),
    holedFt,
  };
  const rail = {
    straightFt: s.runs.filter((x) => !x.curved).reduce((t, x) => t + n(x.ft), 0),
    curvedFt: s.runs.filter((x) => x.curved).reduce((t, x) => t + n(x.ft), 0),
    wallFt: s.runs.filter((x) => x.where === "W").reduce((t, x) => t + n(x.ft), 0),
    flatPicketFt: holedFt,
    totalFt: s.runs.reduce((t, x) => t + n(x.ft), 0),
  };
  // Rail on the steps is about 1.1 ft a step, the runs added up (it's often in pieces); a 2-side-open staircase
  // may carry it on both sides. Far off that, a length or the tread count is wrong.
  const expectFt = treads * 1.1;
  const stepFt = stepRuns.reduce((t, x) => t + n(x.ft), 0);
  const near = (target: number) => stepFt >= target * 0.7 && stepFt <= target * 1.3;
  if (stepFt > 0 && treads > 0 && !near(expectFt) && !(openSides === 2 && near(expectFt * 2)))
    flags.push(`Railing on the steps adds up to ${Math.round(stepFt * 10) / 10} ft; ${treads} treads suggest about ${Math.round(expectFt)} ft. Check the lengths or the treads.`);
  if (s.runs.some((x) => x.pickets && x.where === "W")) flags.push("A wall rail run is ticked as having pickets. Check whether it's really on the steps or flat.");

  const landingSqft = n(s.landings.s3x3) * 9 + n(s.landings.s3x6) * 18 + n(s.landings.other) * 9;
  const oakBoxes = Math.ceil(landingSqft / 20);

  if (s.totalTreads !== null && s.totalTreads !== treads) flags.push(`Total treads: the sheet says ${s.totalTreads}, the boxes add up to ${treads}.`);
  if (treads === 0) flags.push("No treads were read on the main staircase.");
  if (s.want.treads.length === 0) flags.push("Nothing is ticked under What the customer wants (G1), so no option can be built. Tick one, or Not sure.");
  if (s.where.includes("Side") && sideTreads === 0) flags.push("A side or half staircase is ticked, but its steps (B10) are blank.");
  if (s.shape === "Curved" || s.shape === "Spiral") flags.push(`${s.shape} staircase: new caps are recommended, and the curve has no piece on the card.`);
  if (s.onSteps === null) flags.push("What is on the steps now (A3) is blank, so sanding can't be offered.");
  if (s.unclear.length) flags.push(`Couldn't be read with confidence: ${s.unclear.join(", ")}. Check them against the photo.`);

  if (pz.overCount > 0) flags.push(`Pizza sets: ${pz.twoSide} marked 2 side open, but the 2-pc and 3-pc boxes add up to fewer (${pz.sets - pz.overCount}). The extra ${pz.overCount} counted as 3-piece; check B7.`);
  const custom = { pizzaSets: pz.custom, bullnoses: n(s.bullnose.two) };
  const brackets = s.runs.filter((x) => x.where === "W").reduce((t, x) => t + bracketsFor(n(x.ft)), 0);
  const notes: string[] = [];
  if (s.metalBar) notes.push("Metal bar under the handrail: bring the hardware for it.");
  if (custom.pizzaSets) {
    const why = [n(s.pizza.pc2) ? `${n(s.pizza.pc2)} 2-piece` : "", custom.pizzaSets - n(s.pizza.pc2) ? `${custom.pizzaSets - n(s.pizza.pc2)} 3-piece, 2 side open` : ""].filter(Boolean).join(", ");
    notes.push(`${custom.pizzaSets} custom pizza set${custom.pizzaSets === 1 ? "" : "s"} (${why}).`);
  }
  if (custom.bullnoses) notes.push(`${custom.bullnoses} custom bullnose${custom.bullnoses === 1 ? "" : "s"} (2-side open).`);

  return {
    treads,
    sideTreads,
    landings,
    halfMoons,
    pizzaSets: pz.sets,
    risers,
    open,
    openSides,
    spindles,
    heights,
    posts: { now: n(s.posts.now), add: n(s.posts.add) },
    rail,
    nosing,
    oakBoxes,
    custom,
    brackets,
    notes,
    flags,
  };
}
