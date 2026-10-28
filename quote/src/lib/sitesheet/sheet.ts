/**
 * The stair site sheet (Albert, 2026-10-28): the two-page paper form a PM fills in on site, photographed
 * into the quote and read by Claude into these fields. Its codes (A1…G8) are printed on the paper, so the
 * shape here follows the sheet box for box; sheet v3 is the reference. Pure, no I/O: cleanSheet() is the
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
export const WANT_TREADS = ["sand", "caps", "vinyl", "unsure"] as const;
export type WantTread = (typeof WANT_TREADS)[number];

/** How many treads of one type, by width (36" / 42" / 48" / one other width the PM writes). */
export type WidthCounts = { w36: number | null; w42: number | null; w48: number | null; other: number | null; otherWidth: number | null };
/** How many special treads, by which side is open (the columns of B6–B8). */
export type SideCounts = { boxed: number | null; lso: number | null; rso: number | null; two: number | null };
export type NosingPiece = { full: number | null; holed: number | null; sand: boolean };

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
  /** B6 */ pie: SideCounts;
  pieTurn: "L" | "R" | null;
  /** B7: sets, one 90° turn each */ pizza: SideCounts;
  pizzaTurn: "L" | "R" | null;
  pizzaPieces: 2 | 3 | null;
  /** B8 (a bullnose is never boxed) */ bullnose: SideCounts;
  bullnoseCustom: boolean | null;
  /** B9 */ totalTreads: number | null;
  /** B10: the side / half staircase */ side: { steps: number | null; type: TreadType | null; width: number | null };
  /** C1 */ landings: { s3x3: number | null; s3x6: number | null; other: number | null };
  /** C2 */ halfMoons: { count: number | null; nosingFt: number | null; solid: boolean };
  /** D1, D2 */ stringers: { now: "White" | "Oak" | "Other" | null; made: "Veneer" | "Solid" | "Don't know" | null };
  /** E1: null = not marked, 0 = standard 4.5" (with overlap), else inches */ nosingDepth: number | null;
  /** E2 inches */ nosingThickness: number | null;
  /** E3: up to 10 pieces */ nosings: NosingPiece[];
  /** F1 feet / count */ rail: { stairsFt: number | null; landingFt: number | null; flatFt: number | null; wallFt: number | null; brackets: number | null };
  /** F2 */ spindles: { onSteps: number | null; flatTop: number | null };
  /** F3 */ heights: { h36: number | null; h39: number | null; h42: number | null };
  /** F4 */ posts: { now: number | null; add: number | null };
  /** G: what the customer wants */
  want: {
    treads: WantTread[];
    riser: "white" | "stain" | "unsure" | null;
    stringer: "white" | "oak" | "unsure" | null;
    stain: string | null;
    matchFloors: boolean;
    handrail: "refinish" | "new" | "complex" | null;
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
const boolOrNull = (v: unknown) => (v === true ? true : v === false ? false : null);

function widths(v: unknown): WidthCounts {
  const o = obj(v);
  return { w36: num(o.w36), w42: num(o.w42), w48: num(o.w48), other: num(o.other), otherWidth: num(o.otherWidth) };
}
function sides(v: unknown, boxed = true): SideCounts {
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
  const rail = obj(o.rail);
  const sp = obj(o.spindles);
  const h = obj(o.heights);
  const posts = obj(o.posts);
  const w = obj(o.want);
  const where = Array.isArray(o.where) ? [...new Set(o.where.map((x) => pick(x, WHERE)).filter((x): x is (typeof WHERE)[number] => !!x))] : [];
  const wantTreads = Array.isArray(w.treads) ? [...new Set(w.treads.map((x) => pick(x, WANT_TREADS)).filter((x): x is WantTread => !!x))] : [];
  const pieces = Array.isArray(o.nosings) ? o.nosings.slice(0, MAX_NOSINGS).map((p) => ({ full: num(obj(p).full), holed: num(obj(p).holed), sand: bool(obj(p).sand) })) : [];
  const pizzaPieces = num(o.pizzaPieces);
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
    pieTurn: pick(o.pieTurn, ["L", "R"] as const),
    pizza: sides(o.pizza),
    pizzaTurn: pick(o.pizzaTurn, ["L", "R"] as const),
    pizzaPieces: pizzaPieces === 2 || pizzaPieces === 3 ? pizzaPieces : null,
    bullnose: sides(o.bullnose, false),
    bullnoseCustom: boolOrNull(o.bullnoseCustom),
    totalTreads: num(o.totalTreads),
    side: { steps: num(side.steps), type: pick(side.type, TREAD_TYPES), width: num(side.width) },
    landings: { s3x3: num(land.s3x3), s3x6: num(land.s3x6), other: num(land.other) },
    halfMoons: { count: num(hm.count), nosingFt: num(hm.nosingFt), solid: bool(hm.solid) },
    stringers: { now: pick(str.now, ["White", "Oak", "Other"] as const), made: pick(str.made, ["Veneer", "Solid", "Don't know"] as const) },
    nosingDepth: num(o.nosingDepth),
    nosingThickness: num(o.nosingThickness),
    nosings: pieces.filter((p) => p.full !== null || p.holed !== null || p.sand),
    rail: { stairsFt: num(rail.stairsFt), landingFt: num(rail.landingFt), flatFt: num(rail.flatFt), wallFt: num(rail.wallFt), brackets: num(rail.brackets) },
    spindles: { onSteps: num(sp.onSteps), flatTop: num(sp.flatTop) },
    heights: { h36: num(h.h36), h39: num(h.h39), h42: num(h.h42) },
    posts: { now: num(posts.now), add: num(posts.add) },
    want: {
      treads: wantTreads,
      riser: pick(w.riser, ["white", "stain", "unsure"] as const),
      stringer: pick(w.stringer, ["white", "oak", "unsure"] as const),
      stain: text(w.stain, 80),
      matchFloors: bool(w.matchFloors),
      handrail: pick(w.handrail, ["refinish", "new", "complex"] as const),
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
