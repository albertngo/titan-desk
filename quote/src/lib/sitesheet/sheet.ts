/**
 * The stair site sheet (Albert, 2026-10-28): the two-page paper form a PM fills in on site, photographed
 * into the quote and read by Claude into these fields. Its codes (A1…G8) are printed on the paper, so the
 * shape here follows the sheet box for box; sheet v5 (2026-10-28) is the reference. Pure, no I/O: cleanSheet() is the
 * only way anything (the model's answer, the browser's edits) becomes a SiteSheet, and it never invents a
 * value: what it can't read is null. Tested in tests/sitesheet.test.ts.
 */

export const SHAPES = ["Straight", "Quarter turn", "Quarter winder", "U landing", "Curved", "Spiral", "Double winder", "Half landing"] as const;
export type Shape = (typeof SHAPES)[number];
export const ON_STEPS = ["Carpet", "Wood caps", "Painted wood", "Vinyl", "Other"] as const;
export const WHERE = ["Main", "Basement", "Townhome", "Side"] as const;
export const TREAD_TYPES = ["rso", "lso", "boxed", "two"] as const;
export type TreadType = (typeof TREAD_TYPES)[number];
export const TREAD_NAME: Record<TreadType, string> = { rso: "RSO", lso: "LSO", boxed: "Boxed", two: "2 side open" };
export const WANT_TREADS = ["sand", "caps", "vinylTreads", "vinylSteps", "unsure"] as const;
export type WantTread = (typeof WANT_TREADS)[number];

/** How many treads of one type, by width (36" / 42" / 48" / one other width the PM writes). */
export type WidthCounts = { w36: number | null; w42: number | null; w48: number | null; other: number | null; otherWidth: number | null };
/** How many special treads, by which side is open (the columns of B6–B8). */
export type SideCounts = { boxed: number | null; lso: number | null; rso: number | null; two: number | null };
export const THICKNESSES = ["1/2", "3/4", "unsure"] as const;
export type Thickness = (typeof THICKNESSES)[number];
/** E2 (v5): one nosing piece. A blank depth or thickness means the staircase default (E1). */
export type NosingPiece = { ft: number | null; depth: number | null; thickness: Thickness | null; sand: boolean };
/** F1 (v4): one run of handrail. S on steps, F flat (a landing or upstairs), W along a wall. */
export type RailRun = { ft: number | null; where: "S" | "F" | "W" | null; curved: boolean; pickets: boolean; picketFt: number | null };

export type SiteSheet = {
  quoteNumber: string | null;
  customer: string | null;
  date: string | null;
  pm: string | null;
  /** A1 */ where: (typeof WHERE)[number][];
  /** A2 */ shape: Shape | null;
  /** A3 */ onSteps: (typeof ON_STEPS)[number] | null;
  /** B1–B4 */ treads: Record<TreadType, WidthCounts>;
  /** B5: null = not marked, 0 = standard 10-5/8", else the custom inches. */ treadDepth: number | null;
  /** B6 (never boxed; the open side gives the turn) */ pie: SideCounts;
  /** B7: sets, one 90° turn each. A 2-piece set, or a 3-piece set that is 2-side open, is custom. */
  pizza: { sets: number | null; twoSide: boolean; pieces: 2 | 3 | null };
  /** B8 (never boxed). LSO and RSO are standard; 2 side open is always custom. */ bullnose: SideCounts;
  /** B9 */ totalTreads: number | null;
  /** B10: the side / half staircase */ side: { steps: number | null; type: TreadType | null; width: number | null };
  /** C1 */ landings: { s3x3: number | null; s3x6: number | null; other: number | null };
  /** C2 */ halfMoons: { count: number | null; nosingFt: number | null; solid: boolean };
  /** D1, D2 (v5: White / Stained; a blank Made of reads as veneer) */ stringers: { now: "White" | "Stained" | "Other" | null; made: "Veneer" | "Solid" | "Don't know" | null };
  /** E1: the staircase default every piece follows unless its column says otherwise. depth null = standard 4.5" (with overlap). */
  nosingDefault: { carpet: boolean; thickness: Thickness | null; depth: number | null };
  /** E2: up to 10 pieces, one column each */ nosings: NosingPiece[];
  /** F1: up to 8 runs, one column each */ runs: RailRun[];
  /** F2: a metal bar under the handrail (hardware for the job) */ metalBar: boolean;
  /** F2 */ spindles: { onSteps: number | null; flatTop: number | null };
  /** F3 */ heights: { h36: number | null; h39: number | null; h42: number | null };
  /** F4 */ posts: { now: number | null; add: number | null };
  /** G: what the customer wants */
  want: {
    treads: WantTread[];
    riser: "white" | "stain" | "unsure" | null;
    stringer: "white" | "stain" | "unsure" | null;
    /** G1: square off the bullnose (an extra cost on top). */
    squareBullnose: boolean;
    stain: string | null;
    matchFloors: boolean;
    handrail: "refinish" | "new" | null;
    wallRailFt: number | null;
    spindles: "keep" | "iron" | "wood" | null;
    posts: "keep" | "refinish" | "new" | null;
    covers: "main" | "both" | null;
  };
  /** N1 */ notes: string | null;
  /** Codes the reader couldn't be sure of (e.g. "B6", "F3"); the screen marks them for a person. */
  unclear: string[];
};

export const MAX_NOSINGS = 10;
export const MAX_RUNS = 8;

/* ---------- cleaning: the only way in ---------- */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
/** A count or a length: a finite number from 0 to 999, rounded to one decimal; anything else is null. */
function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 999) return null;
  return Math.round(n * 10) / 10;
}
function text(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}
function longText(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function pick<T extends string>(v: unknown, list: readonly T[]): T | null {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null;
}
const bool = (v: unknown) => v === true;

function widths(v: unknown): WidthCounts {
  const o = obj(v);
  return { w36: num(o.w36), w42: num(o.w42), w48: num(o.w48), other: num(o.other), otherWidth: num(o.otherWidth) };
}
function sides(v: unknown, boxed = false): SideCounts {
  const o = obj(v);
  return { boxed: boxed ? num(o.boxed) : null, lso: num(o.lso), rso: num(o.rso), two: num(o.two) };
}

export function cleanSheet(input: unknown): SiteSheet {
  const o = obj(input);
  const treads = obj(o.treads);
  const side = obj(o.side);
  const land = obj(o.landings);
  const hm = obj(o.halfMoons);
  const str = obj(o.stringers);
  const nd = obj(o.nosingDefault);
  const sp = obj(o.spindles);
  const h = obj(o.heights);
  const posts = obj(o.posts);
  const w = obj(o.want);
  const where = Array.isArray(o.where) ? [...new Set(o.where.map((x) => pick(x, WHERE)).filter((x): x is (typeof WHERE)[number] => !!x))] : [];
  const wantTreads = Array.isArray(w.treads) ? [...new Set(w.treads.map((x) => pick(x, WANT_TREADS)).filter((x): x is WantTread => !!x))] : [];
  const pieces: NosingPiece[] = Array.isArray(o.nosings)
    ? o.nosings.slice(0, MAX_NOSINGS).map((p) => ({ ft: num(obj(p).ft), depth: num(obj(p).depth), thickness: pick(obj(p).thickness, THICKNESSES), sand: bool(obj(p).sand) }))
    : [];
  const runs: RailRun[] = Array.isArray(o.runs)
    ? o.runs.slice(0, MAX_RUNS).map((x) => ({ ft: num(obj(x).ft), where: pick(obj(x).where, ["S", "F", "W"] as const), curved: bool(obj(x).curved), pickets: bool(obj(x).pickets), picketFt: num(obj(x).picketFt) }))
    : [];
  const pz = obj(o.pizza);
  const pizzaPieces = num(pz.pieces);
  return {
    quoteNumber: text(o.quoteNumber, 20),
    customer: text(o.customer, 80),
    date: text(o.date, 20),
    pm: text(o.pm, 40),
    where,
    shape: pick(o.shape, SHAPES),
    onSteps: pick(o.onSteps, ON_STEPS),
    treads: { rso: widths(treads.rso), lso: widths(treads.lso), boxed: widths(treads.boxed), two: widths(treads.two) },
    treadDepth: num(o.treadDepth),
    pie: sides(o.pie),
    pizza: { sets: num(pz.sets), twoSide: bool(pz.twoSide), pieces: pizzaPieces === 2 || pizzaPieces === 3 ? pizzaPieces : null },
    bullnose: sides(o.bullnose),
    totalTreads: num(o.totalTreads),
    side: { steps: num(side.steps), type: pick(side.type, TREAD_TYPES), width: num(side.width) },
    landings: { s3x3: num(land.s3x3), s3x6: num(land.s3x6), other: num(land.other) },
    halfMoons: { count: num(hm.count), nosingFt: num(hm.nosingFt), solid: bool(hm.solid) },
    stringers: { now: pick(str.now, ["White", "Stained", "Other"] as const), made: pick(str.made, ["Veneer", "Solid", "Don't know"] as const) },
    nosingDefault: { carpet: bool(nd.carpet), thickness: pick(nd.thickness, THICKNESSES), depth: num(nd.depth) },
    nosings: pieces.filter((p) => p.ft !== null || p.depth !== null || p.thickness !== null || p.sand),
    runs: runs.filter((x) => x.ft !== null || x.where !== null || x.curved || x.pickets || x.picketFt !== null),
    metalBar: bool(o.metalBar),
    spindles: { onSteps: num(sp.onSteps), flatTop: num(sp.flatTop) },
    heights: { h36: num(h.h36), h39: num(h.h39), h42: num(h.h42) },
    posts: { now: num(posts.now), add: num(posts.add) },
    want: {
      treads: wantTreads,
      riser: pick(w.riser, ["white", "stain", "unsure"] as const),
      stringer: pick(w.stringer, ["white", "stain", "unsure"] as const),
      squareBullnose: bool(w.squareBullnose),
      stain: text(w.stain, 80),
      matchFloors: bool(w.matchFloors),
      handrail: pick(w.handrail, ["refinish", "new"] as const),
      wallRailFt: num(w.wallRailFt),
      spindles: pick(w.spindles, ["keep", "iron", "wood"] as const),
      posts: pick(w.posts, ["keep", "refinish", "new"] as const),
      covers: pick(w.covers, ["main", "both"] as const),
    },
    notes: longText(o.notes),
    unclear: Array.isArray(o.unclear) ? [...new Set(o.unclear.filter((c): c is string => typeof c === "string" && /^[A-GN]\d{1,2}$/.test(c.trim())).map((c) => c.trim()))].slice(0, 40) : [],
  };
}

export const emptySheet = (): SiteSheet => cleanSheet({});

/* ---------- what is kept on the quote (Quotes → Site Sheet) ---------- */

export type StoredSheet = {
  sheet: SiteSheet;
  /** Who read or last checked it, and when (ISO). */
  by: string;
  at: string;
  /** True once a person has pressed Save check; a fresh read is unchecked. */
  checked: boolean;
};

export const sheetRaw = (v: unknown): string => (typeof v === "string" ? v : "");

export function parseStored(raw: string): StoredSheet | null {
  if (!raw.trim()) return null;
  try {
    const o = obj(JSON.parse(raw));
    if (o.v !== 1) return null;
    return { sheet: cleanSheet(o.sheet), by: text(o.by, 120) ?? "", at: text(o.at, 40) ?? "", checked: o.checked === true };
  } catch {
    return null;
  }
}

export function serializeStored(s: StoredSheet): string {
  return JSON.stringify({ v: 1, sheet: cleanSheet(s.sheet), by: s.by, at: s.at, checked: s.checked });
}
