import { lineFromEntry, manualLine, type CardEntry, type EditorLine } from "@/lib/editor/model";
import type { ServiceLevel } from "@/lib/pricing/service";
import { METHOD_PHRASE } from "@/lib/quick/stairs";
import { derive, type Derived } from "./derive";
import { TREAD_NAME, type SiteSheet, type TreadType, type WantTread } from "./sheet";

/**
 * From a checked site sheet to priced stair options (Albert, 2026-10-28). One option per tread choice the
 * customer ticked under G1 that the conditions allow (Not sure = every one that is allowed), each priced
 * from the Stair Items card at the option's service level, in the Stairs section. Pure; tested in
 * tests/sitesheet.test.ts.
 *
 * The rules, in Albert's words where he gave them:
 * - Sand & refinish only when wood caps are already on the surface. Carpet on top, or not known: not
 *   offered ("99% of the time it's builder's-grade wood"). Painted wood: offered, with a red flag.
 *   Sanding means the piano look: risers and stringers painted white.
 * - New wood caps always come with new risers. Recommended for curved and spiral stairs.
 * - Vinyl: vinyl treads, or vinyl flooring on the steps. A curved stair gets no vinyl treads.
 * - Stringers: white → paint; oak on solid → sand & stain; oak on veneer or don't know → oak skin.
 * - New spindles or posts replace every existing one, plus the posts to add.
 * - Add wall rail = new rail along a wall with brackets, only where there is none today.
 * - Pizza set: one price per 90° turn, left or right, 2- or 3-piece. Half moon: the card's flat rate
 *   covers its curved nosing, flooring and stain; a solid one-piece adds about $200 (not on the card yet).
 * A sheet answer with no item on the card becomes a Stairs line with no price and says so, never a guess.
 */

/** Stair Items by name: the card has no codes, so the name is the key. Several names = try in order. */
export const ITEM_NAMES = {
  step: { boxed: ["Step (2 Side Close)"], lso: ["Step (Left Side Open)"], rso: ["Step (Right Side Open)"], two: ["Step (2 Side Open)"] } as Record<TreadType, string[]>,
  bullnose: { boxed: [], lso: ["Bullnose (Left Side Open)"], rso: ["Bullnose (Right Side Open)"], two: ["Bullnose (2 Side Open)"] } as Record<TreadType, string[]>,
  pie: { L: ["Pie Shape Step (Left)", "Pie Shape Step (Right)"], R: ["Pie Shape Step (Right)", "Pie Shape Step (Left)"] },
  corner: ["Corner Turn Set", "Corner Turn Steps (Right) - 3PC Set", "Corner Turn Steps (Left) - 3PC Set"],
  landing: ["Landing"],
  halfMoon: ["1/2 Moon"],
  riser: ["Riser"],
  sandSteps: ["Task: Sand Steps"],
  railRefinish: ["Task: Sand + Stain Handrail"],
  railNew: ["Task: New Handrail + Stain"],
  railComplex: ["New Handrail Design (Complex)"],
  spindle: ["Iron Spindles (w/material)"],
  post: ["New Post"],
  postAlter: ["Task: Alter Post Design"],
  nosing: ["Accents: Nosing"],
  nosingPicket: ["Accents: Nosing (w/Picket Holes)"],
  nosingSand: ["Task: Sand + Stain Nosing"],
  stringPaint: ["Task: 2 Side Paint (White)"],
  stringSkin: ["Task: 2 Side Oak Skin (Glue and Stain)"],
  stringSand: ["Task: 2 Side Oak (Sand & Stain)"],
};

export type BuiltOption = {
  kind: Exclude<WantTread, "unsure">;
  name: string;
  description: string;
  recommended: boolean;
  lines: EditorLine[];
  /** Said on the option: red flags and anything priced at nothing. */
  notes: string[];
};

export type BuildResult = { options: BuiltOption[]; dropped: { kind: Exclude<WantTread, "unsure">; name: string; why: string }[]; derived: Derived };

const OPTION_NAME: Record<BuiltOption["kind"], string> = { caps: "New red oak caps", sand: "Sand & refinish", vinyl: "Vinyl" };

type Stair = Extract<CardEntry, { kind: "stair" }>;

export function buildOptions(s: SiteSheet, catalogue: CardEntry[], level: ServiceLevel = "Standard"): BuildResult {
  const d = derive(s);
  const byName = new Map<string, Stair>();
  for (const e of catalogue) if (e.kind === "stair" && !byName.has(e.name.trim().toLowerCase())) byName.set(e.name.trim().toLowerCase(), e);
  const find = (names: string[]) => names.map((x) => byName.get(x.toLowerCase())).find(Boolean) ?? null;

  const asked = new Set<WantTread>(s.want.treads);
  const wanted = (k: BuiltOption["kind"]) => asked.has(k) || asked.has("unsure");
  const curved = s.shape === "Curved" || s.shape === "Spiral";
  const options: BuiltOption[] = [];
  const dropped: BuildResult["dropped"] = [];

  if (wanted("caps")) options.push(build("caps", s, d, find, level, curved));
  if (wanted("sand")) {
    if (s.onSteps === "Wood caps" || s.onSteps === "Painted wood") options.push(build("sand", s, d, find, level, false));
    else dropped.push({ kind: "sand", name: OPTION_NAME.sand, why: s.onSteps === "Carpet" ? "Carpet is on the steps, and what's under it is almost never wood that can be sanded." : s.onSteps === null ? "The sheet doesn't say what's on the steps (A3), so sanding isn't offered." : `Sanding needs wood caps on the steps; the sheet says ${s.onSteps.toLowerCase()}.` });
  }
  if (wanted("vinyl")) options.push(build("vinyl", s, d, find, level, false));
  if (options.length && !options.some((o) => o.recommended)) options[0].recommended = options.length === 1;
  return { options, dropped, derived: d };
}

function build(kind: BuiltOption["kind"], s: SiteSheet, d: Derived, find: (names: string[]) => Stair | null, level: ServiceLevel, recommend: boolean): BuiltOption {
  const lines: EditorLine[] = [];
  const notes: string[] = [];
  const add = (names: string[], qty: number, what: string, area = "Main staircase") => {
    if (!(qty > 0)) return;
    const e = find(names);
    if (e) lines.push({ ...lineFromEntry(e, "Stairs", undefined, level), qty, area });
    else gap(what, qty, area);
  };
  const gap = (what: string, qty: number, area = "Main staircase") => {
    if (!(qty > 0)) return;
    lines.push({ ...manualLine("Stairs", what), qty, uom: "each", area, clientNote: "" });
    notes.push(`${what}: no rate on the card yet, priced at nothing. Type a price before sending.`);
  };
  const n = (v: number | null) => v ?? 0;
  const both = s.want.covers === "both";

  if (s.onSteps === "Carpet" && kind !== "sand") gap("Carpet removed from the stairs", d.treads + d.landings + (both ? d.sideTreads : 0));

  // Treads
  if (kind === "caps") {
    for (const t of ["boxed", "lso", "rso", "two"] as TreadType[]) {
      const grid = n(s.treads[t].w36) + n(s.treads[t].w42) + n(s.treads[t].w48) + n(s.treads[t].other);
      add(ITEM_NAMES.step[t], grid, `Step (${TREAD_NAME[t]})`);
      add(ITEM_NAMES.bullnose[t], n(s.bullnose[t]), `Bullnose (${TREAD_NAME[t]})`);
    }
    const pies = n(s.pie.boxed) + n(s.pie.lso) + n(s.pie.rso) + n(s.pie.two);
    add(ITEM_NAMES.pie[s.pieTurn ?? "R"], pies, "Pie shape step");
    const sets = n(s.pizza.boxed) + n(s.pizza.lso) + n(s.pizza.rso) + n(s.pizza.two);
    add(ITEM_NAMES.corner, sets, "Corner turn set");
    add(ITEM_NAMES.landing, d.landings, "Landing");
    add(ITEM_NAMES.halfMoon, d.halfMoons, "Half moon");
    if (d.halfMoons > 0 && s.halfMoons.solid) gap("Half moon as one solid piece (instead of the nosing method)", d.halfMoons);
    if (both && d.sideTreads > 0) add(ITEM_NAMES.step[s.side.type ?? "boxed"], d.sideTreads, "Side staircase step", "Side staircase");
    // New caps always come with new risers.
    add(ITEM_NAMES.riser, d.risers + (both && d.sideTreads ? d.sideTreads + 1 : 0), "New risers");
    if (s.want.riser === "white") notes.push("Risers: new, painted white.");
    if (s.want.riser === "stain") notes.push("Risers: new, stained to match.");
    if (recommend) notes.push(`Recommended for a ${s.shape?.toLowerCase()} staircase.`);
  } else if (kind === "sand") {
    add(ITEM_NAMES.sandSteps, d.treads + d.landings + d.halfMoons + (both ? d.sideTreads : 0), "Sand & stain steps");
    gap("Risers painted white", d.risers);
    if (s.onSteps === "Painted wood") notes.push("Red flag: the steps are painted. Getting paint out of the grain is hard; check before promising a stain.");
    notes.push("The piano look: stained treads, white risers and stringers. A darker stain than today's is not recommended.");
  } else {
    const curved = s.shape === "Curved" || s.shape === "Spiral";
    if (curved) {
      gap("Vinyl flooring on the steps", d.treads + d.landings + d.halfMoons + (both ? d.sideTreads : 0));
      notes.push("Curved staircase: no vinyl treads. Vinyl flooring is possible but not advised.");
    } else {
      gap("Vinyl treads", d.treads + d.landings + d.halfMoons + (both ? d.sideTreads : 0));
    }
  }

  // Nosings: every piece new unless the PM ticked Sand instead; picket holes on the pieces that have them.
  if (kind !== "vinyl") {
    const plain = s.nosings.filter((p) => !p.sand && n(p.full) > 0 && !(n(p.holed) > 0)).length;
    add(ITEM_NAMES.nosing, kind === "sand" ? 0 : plain, "Nosing");
    add(ITEM_NAMES.nosingPicket, kind === "sand" ? 0 : d.nosing.holedPieces, "Nosing with picket holes");
    add(ITEM_NAMES.nosingSand, kind === "sand" ? d.nosing.pieces : d.nosing.sandPieces, "Sand & stain nosing");
  }

  // Railing, as the customer wants it.
  const railFt = Math.ceil(d.railFt);
  if (s.want.handrail === "refinish") add(ITEM_NAMES.railRefinish, railFt, "Sand & stain handrail");
  if (s.want.handrail === "new" || s.want.handrail === "complex") add(ITEM_NAMES.railNew, railFt, "New handrail");
  if (s.want.handrail === "complex") add(ITEM_NAMES.railComplex, 1, "Complex handrail design");
  if (n(s.want.wallRailFt) > 0) {
    add(ITEM_NAMES.railNew, Math.ceil(n(s.want.wallRailFt)), "New wall rail", "Wall rail");
    gap("Wall rail brackets", Math.max(n(s.rail.brackets), Math.ceil(n(s.want.wallRailFt) / 4)), "Wall rail");
  }
  if (s.want.spindles === "iron" || s.want.spindles === "wood") {
    add(ITEM_NAMES.spindle, d.spindles.value, "New spindles");
    if (s.want.spindles === "wood") notes.push("Wood spindles are priced as iron; staining them isn't on the card yet.");
  }
  const posts = d.posts.now + d.posts.add;
  if (s.want.posts === "new") add(ITEM_NAMES.post, posts, "New posts");
  else if (d.posts.add > 0) add(ITEM_NAMES.post, d.posts.add, "Posts to add");
  if (s.want.posts === "refinish") gap("Refinish posts", d.posts.now);

  // Stringers, only where a side is open.
  if (d.openSides > 0) {
    const colour = kind === "sand" ? "white" : s.want.stringer;
    if (colour === "white" || colour === "unsure") add(ITEM_NAMES.stringPaint, 1, "Paint stringers white");
    else if (colour === "oak") add(s.stringers.made === "Solid" ? ITEM_NAMES.stringSand : ITEM_NAMES.stringSkin, 1, "Oak stringers");
    if (colour === "unsure") notes.push("Stringer colour not decided: priced as painted white.");
  }

  const phrase = kind === "caps" ? METHOD_PHRASE["Solid red oak caps"] : kind === "sand" ? METHOD_PHRASE["Sand & stain"] : METHOD_PHRASE[s.shape === "Curved" || s.shape === "Spiral" ? "Vinyl flooring" : "Vinyl treads"];
  return { kind, name: OPTION_NAME[kind], description: phrase, recommended: recommend, lines, notes };
}
