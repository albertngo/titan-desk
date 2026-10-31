import { lineFromEntry, manualLine, type CardEntry, type EditorLine } from "@/lib/editor/model";
import type { ServiceLevel } from "@/lib/pricing/service";
import { METHOD_PHRASE } from "@/lib/quick/stairs";
import { bracketsFor, derive, type Derived } from "./derive";
import { TREAD_NAME, type SiteSheet, type TreadType, type WantTread } from "./sheet";

/**
 * From a site sheet to priced stair options (Albert, 2026-10-28). One option per tread choice the customer
 * ticked under G1 (Not sure, or nothing ticked = every one), each priced from the Stair Items card at the
 * option's service level, in the Stairs section. Pure; tested in tests/sitesheet.test.ts.
 *
 * The checks never stop an option (Albert, 2026-10-31: "the checks are just FYI: this is what we think, but
 * never a restrictor for creating the stair option"). Where the rules below advise against one, it is still
 * built, says why on a "Not advised" note, and is never the recommended one. Staff remove what they don't want.
 *
 * The rules, in Albert's words where he gave them:
 * - Sand & refinish only when wood caps are already on the surface. Carpet on top, or not known: not
 *   offered ("99% of the time it's builder's-grade wood"). Painted wood: offered, with a red flag.
 *   Sanding means the piano look: risers and stringers painted white.
 * - New wood caps always come with new risers. Recommended for curved and spiral stairs.
 * - Vinyl (sheet v5): vinyl treads and vinyl steps (vinyl flooring on the steps) are separate options. A
 *   curved stair gets no vinyl treads.
 * - Square off bullnose: an extra cost on top, for each bullnose.
 * - Custom pieces: a 2-piece pizza set, or a 3-piece one that is 2-side open, and every 2-side-open bullnose
 *   add their upcharge on top of the piece ("our standards are extra large").
 * - Stringers: white → paint; stain on solid → sand & stain; stain on veneer, don't know or blank → oak skin.
 * - New spindles or posts replace every existing one, plus the posts to add.
 * - Add wall rail = new rail along a wall with brackets, only where there is none today.
 * - Pizza set: one price per 90° turn, left or right, 2- or 3-piece. Half moon: the card's flat rate
 *   covers its curved nosing, flooring and stain; a solid one-piece adds about $200 (not on the card yet).
 * A sheet answer with no item on the card becomes a Stairs line with no price and says so, never a guess.
 */

/**
 * Stair Items for each site sheet answer. Each list is tried in order: the Airtable record id first, so renaming an
 * item in Airtable never unlinks it (2026-10-31: "Task: …" prefixes and other renames had left most lines unpriced),
 * then today's name, then names it had before. Record ids are not secrets; the Bert base's ids already live in the repo.
 */
export const ITEM_NAMES = {
  step: {
    boxed: ["recf6sSXRYxiSr5rI", "Step (2 Side Close)"],
    lso: ["recMso5EPr5wvE3lH", "Step (Left Side Open)"],
    rso: ["recN7dcO7PWdhWFwb", "Step (Right Side Open)"],
    two: ["recY7EV0srJGXpWp0", "Step (2 Side Open)"],
  } as Record<TreadType, string[]>,
  bullnose: {
    boxed: [],
    lso: ["recGfXnhGNUX4r83J", "Bullnose (Left Side Open)"],
    rso: ["recWoAiGggaZcjQiv", "Bullnose (Right Side Open)"],
    two: ["recgyuj0YBXOzScmf", "Bullnose (2 Side Open)"],
  } as Record<TreadType, string[]>,
  // The open side gives the turn: a left-side-open pie turns left; right or 2 side open, right.
  pie: { L: ["recLgSuRKAnw2ycLg", "Pie Shape Step (Left)", "Pie Shape Step (Right)"], R: ["recgMATNTlBwgfr5K", "Pie Shape Step (Right)", "Pie Shape Step (Left)"] },
  corner: ["recEo06JIu1I2B7jm", "Corner Turn Steps (Right) - 3PC Set", "Corner Turn Set", "Corner Turn Steps (Left) - 3PC Set"],
  landing: ["recE1Hfg2Wq86PCPL", "Landing (3x3)", "Landing"],
  halfMoon: ["recjl6cQsM2YhyZRt", "1/2 Moon Landing", "1/2 Moon"],
  riser: ["rec0WAUmD4A8LowMB", "New Riser", "Riser"],
  sandSteps: ["recnYAG8K2Upy1rQR", "Keep Existing Steps (Sand + Stain)", "Task: Sand Steps"],
  railRefinish: ["rec2G8ypCJ2d1pJdC", "Keep Existing Handrail (Sand + Stain)", "Task: Sand + Stain Handrail"],
  railNew: ["recvgWPinUjeq5N2s", "New Handrail + Stain", "Task: New Handrail + Stain"],
  railCurved: ["rec7w3RiryndNRM4z", "New Curved Handrail + Stain", "Task: New Curved Handrail + Stain"],
  spindle: ["recYAF6e7wwn5WAZX", "New Iron Spindles (w/material)", "Iron Spindles (w/material)"],
  // New wood spindles are one item, material and stain included (2026-10-31), never iron plus a stain.
  spindleWood: ["recTNhgh42a0KFoGw", "New Stain Wood Spindles (w/material)", "Task: Stain Wood Spindles"],
  post: ["recT2DY41zY6EDsLY", "New Post"],
  postAlter: ["reclXcgWqzZINPTWa", "Alter Post Design", "Task: Alter Post Design"],
  // One nosing item, by the foot (Albert, 2026-10-28: "no difference between nosing and nosings with picket holes").
  nosing: ["recqLHia3MFunyXvA", "New Nosings", "Accents: Nosing"],
  nosingSand: ["recBzyPbWMIojiywS", "Keep Nosing (Sand + Stain)", "Task: Sand + Stain Nosing"],
  stringPaint: ["rec4dOhd8fcJfHYIh", "2 Side Paint (White)", "Task: 2 Side Paint (White)"],
  stringSkin: ["recDTQT0pVFOWykrn", "2 Side Oak Skin (Glue and Stain)", "Task: 2 Side Oak Skin (Glue and Stain)"],
  stringSand: ["recnEZHtLFbPFohsV", "2 Side Oak (Sand & Stain)", "Task: 2 Side Oak (Sand & Stain)"],
  // No Stair Item yet (2026-10-31): comes in as an unpriced line with a note until one is added.
  carpetOff: ["Remove Carpet (Stairs)", "Task: Remove Carpet (Stairs)"],
  vinylTread: ["reclAw4QJ8WIp4n9r", "Vinyl Tread", "Vinyl Tread (Install)"],
  vinylFlooring: ["recQTWFiWvUpd8fBk", "Vinyl Flooring on Steps", "Task: Vinyl Flooring on Steps"],
  paintRisers: ["recGmnXAUUEfi4pCp", "Paint Risers White", "Task: Paint Risers White"],
  halfMoonSolid: ["recFut4r1tdIoYZHn", "Half Moon Solid One-Piece", "Half Moon Solid One-Piece (Upgrade)"],
  bullnoseCustom: ["recxmhUmo3OJrFTJ5", "Bullnose Custom Size", "Bullnose Custom Size (Upcharge)"],
  wallBracket: ["recr6emYKw0NT77EE", "Wall Rail Bracket"],
  postRefinish: ["reczhRmxpz4Tf9h6Y", "Keep Existing Post (Refinished)", "Task: Refinish Post"],
  squareBullnose: ["recQrr6KQaKipdPOa", "Square Off Bullnose", "Task: Square Off Bullnose"],
  pizzaCustom: ["recb1BzKkoUuZ8S55", "Corner Turn Set Custom", "Corner Turn Set Custom (Upcharge)"],
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

export type BuildResult = { options: BuiltOption[]; derived: Derived };

const OPTION_NAME: Record<BuiltOption["kind"], string> = { caps: "New red oak caps", sand: "Sand & refinish", vinylTreads: "Vinyl treads", vinylSteps: "Vinyl steps" };

type Stair = Extract<CardEntry, { kind: "stair" }>;

export function buildOptions(s: SiteSheet, catalogue: CardEntry[], level: ServiceLevel = "Standard"): BuildResult {
  const d = derive(s);
  const byName = new Map<string, Stair>();
  for (const e of catalogue) if (e.kind === "stair" && !byName.has(e.name.trim().toLowerCase())) byName.set(e.name.trim().toLowerCase(), e);
  const byId = new Map<string, Stair>();
  for (const e of catalogue) if (e.kind === "stair") byId.set(e.recordId, e);
  const find = (keys: string[]) => keys.map((x) => byId.get(x) ?? byName.get(x.toLowerCase())).find(Boolean) ?? null;

  const asked = new Set<WantTread>(s.want.treads);
  // Nothing ticked reads as Not sure: every option, so there is always something to build.
  const wanted = (k: BuiltOption["kind"]) => asked.has(k) || asked.has("unsure") || asked.size === 0;
  const curved = s.shape === "Curved" || s.shape === "Spiral";
  const options: BuiltOption[] = [];
  const add = (kind: BuiltOption["kind"], recommend: boolean, notAdvised: string | null) => {
    const o = build(kind, s, d, find, level, recommend && !notAdvised);
    if (notAdvised) o.notes.unshift(`Not advised: ${notAdvised} Built anyway; remove it if it doesn't apply.`);
    options.push(o);
  };

  if (wanted("caps")) add("caps", curved, null);
  if (wanted("sand"))
    add("sand", false, s.onSteps === "Wood caps" || s.onSteps === "Painted wood" ? null : s.onSteps === "Carpet" ? "carpet is on the steps, and what's under it is almost never wood that can be sanded." : s.onSteps === null ? "the sheet doesn't say what's on the steps (A3)." : `sanding needs wood caps on the steps; the sheet says ${s.onSteps.toLowerCase()}.`);
  if (wanted("vinylTreads")) add("vinylTreads", false, curved ? `a ${s.shape?.toLowerCase()} staircase takes no vinyl treads; vinyl steps are possible.` : null);
  if (wanted("vinylSteps")) add("vinylSteps", false, null);
  if (options.length === 1 && !options[0].notes.some((n) => n.startsWith("Not advised"))) options[0].recommended = true;
  return { options, derived: d };
}

function build(kind: BuiltOption["kind"], s: SiteSheet, d: Derived, find: (names: string[]) => Stair | null, level: ServiceLevel, recommend: boolean): BuiltOption {
  const lines: EditorLine[] = [];
  const notes: string[] = [];
  const add = (names: string[], qty: number, what: string, area = "Main staircase", uom?: string) => {
    if (!(qty > 0)) return;
    const e = find(names);
    if (e) lines.push({ ...lineFromEntry(e, "Stairs", undefined, level), qty, area, ...(uom ? { uom } : {}) });
    else gap(what, qty, area);
  };
  const gap = (what: string, qty: number, area = "Main staircase") => {
    if (!(qty > 0)) return;
    lines.push({ ...manualLine("Stairs", what), qty, uom: "each", area, clientNote: "" });
    notes.push(`${what}: no rate on the card yet, priced at nothing. Type a price before sending.`);
  };
  const n = (v: number | null) => v ?? 0;
  const both = s.want.covers === "both";

  if (s.onSteps === "Carpet") add(ITEM_NAMES.carpetOff, d.treads + d.landings + (both ? d.sideTreads : 0), "Carpet removed from the stairs");

  // Treads
  if (kind === "caps") {
    for (const t of ["boxed", "lso", "rso", "two"] as TreadType[]) {
      const grid = n(s.treads[t].w36) + n(s.treads[t].w42) + n(s.treads[t].w48) + n(s.treads[t].other);
      add(ITEM_NAMES.step[t], grid, `Step (${TREAD_NAME[t]})`);
      add(ITEM_NAMES.bullnose[t], n(s.bullnose[t]), `Bullnose (${TREAD_NAME[t]})`);
    }
    add(ITEM_NAMES.bullnoseCustom, d.custom.bullnoses, "Custom-size bullnose (2 side open)");
    add(ITEM_NAMES.pie.L, n(s.pie.lso), "Pie shape step (left)");
    add(ITEM_NAMES.pie.R, n(s.pie.rso) + n(s.pie.two), "Pie shape step (right)");
    add(ITEM_NAMES.corner, d.pizzaSets, "Corner turn set");
    add(ITEM_NAMES.pizzaCustom, d.custom.pizzaSets, "Custom corner turn set");
    add(ITEM_NAMES.landing, d.landings, "Landing");
    add(ITEM_NAMES.halfMoon, d.halfMoons, "Half moon");
    if (d.halfMoons > 0 && s.halfMoons.solid) add(ITEM_NAMES.halfMoonSolid, d.halfMoons, "Half moon as one solid piece (instead of the nosing method)");
    if (both && d.sideTreads > 0) add(ITEM_NAMES.step[s.side.type ?? "boxed"], d.sideTreads, "Side staircase step", "Side staircase");
    // New caps always come with new risers.
    add(ITEM_NAMES.riser, d.risers + (both && d.sideTreads ? d.sideTreads + 1 : 0), "New risers");
    if (s.want.riser === "white") notes.push("Risers: new, painted white.");
    if (s.want.riser === "stain") notes.push("Risers: new, stained to match.");
    if (recommend) notes.push(`Recommended for a ${s.shape?.toLowerCase()} staircase.`);
  } else if (kind === "sand") {
    add(ITEM_NAMES.sandSteps, d.treads + d.landings + d.halfMoons + (both ? d.sideTreads : 0), "Sand & stain steps");
    add(ITEM_NAMES.paintRisers, d.risers, "Risers painted white");
    if (s.onSteps === "Painted wood") notes.push("Red flag: the steps are painted. Getting paint out of the grain is hard; check before promising a stain.");
    notes.push("The piano look: stained treads, white risers and stringers. A darker stain than today's is not recommended.");
  } else if (kind === "vinylTreads") {
    add(ITEM_NAMES.vinylTread, d.treads + d.landings + d.halfMoons + (both ? d.sideTreads : 0), "Vinyl treads");
  } else {
    add(ITEM_NAMES.vinylFlooring, d.treads + d.landings + d.halfMoons + (both ? d.sideTreads : 0), "Vinyl flooring on the steps");
    if (s.shape === "Curved" || s.shape === "Spiral") notes.push("Curved staircase: vinyl steps are possible but not advised.");
  }
  if (s.want.squareBullnose) add(ITEM_NAMES.squareBullnose, n(s.bullnose.lso) + n(s.bullnose.rso) + n(s.bullnose.two), "Square off bullnose");

  // Nosings: one line in feet, every piece new unless the PM ticked Sand instead. Holed pieces are the same item
  // (2026-10-28); with no piece lengths written, the flat picket feet still need nosing.
  if (kind === "caps" || kind === "sand") {
    add(ITEM_NAMES.nosing, kind === "sand" ? 0 : Math.ceil(Math.max(d.nosing.newFt, d.nosing.holedFt)), "Nosing", "Main staircase", "linear ft");
    add(ITEM_NAMES.nosingSand, kind === "sand" ? d.nosing.pieces : d.nosing.sandPieces, "Sand & stain nosing");
  }

  // Railing, as the customer wants it.
  if (s.want.handrail === "refinish") add(ITEM_NAMES.railRefinish, Math.ceil(d.rail.totalFt), "Sand & stain handrail");
  if (s.want.handrail === "new") {
    add(ITEM_NAMES.railNew, Math.ceil(d.rail.straightFt), "New handrail");
    add(ITEM_NAMES.railCurved, Math.ceil(d.rail.curvedFt), "New curved handrail");
    add(ITEM_NAMES.wallBracket, d.brackets, "Wall rail brackets", "Wall rail");
  }
  const wallRail = n(s.want.wallRailFt);
  if (wallRail > 0) {
    add(ITEM_NAMES.railNew, Math.ceil(wallRail), "New wall rail", "Wall rail");
    add(ITEM_NAMES.wallBracket, bracketsFor(wallRail), "Wall rail brackets", "Wall rail");
  }
  if (s.want.spindles === "iron" || s.want.spindles === "wood") {
    if (s.want.spindles === "wood") add(ITEM_NAMES.spindleWood, d.spindles.value, "New wood spindles, stained");
    else add(ITEM_NAMES.spindle, d.spindles.value, "New spindles");
  }
  const posts = d.posts.now + d.posts.add;
  if (s.want.posts === "new") add(ITEM_NAMES.post, posts, "New posts");
  else if (d.posts.add > 0) add(ITEM_NAMES.post, d.posts.add, "Posts to add");
  if (s.want.posts === "refinish") add(ITEM_NAMES.postRefinish, d.posts.now, "Refinish posts");

  // Stringers, only where a side is open.
  if (d.openSides > 0) {
    const colour = kind === "sand" ? "white" : s.want.stringer;
    if (colour === "white" || colour === "unsure") add(ITEM_NAMES.stringPaint, 1, "Paint stringers white");
    // Stain on solid stringers is a sand & stain; on veneer, or when nobody knows, they're skinned in oak.
    else if (colour === "stain") add(s.stringers.made === "Solid" ? ITEM_NAMES.stringSand : ITEM_NAMES.stringSkin, 1, "Stained stringers");
    if (colour === "unsure") notes.push("Stringer colour not decided: priced as painted white.");
  }

  notes.push(...d.notes);
  const phrase = METHOD_PHRASE[kind === "caps" ? "Solid red oak caps" : kind === "sand" ? "Sand & stain" : kind === "vinylTreads" ? "Vinyl treads" : "Vinyl flooring"];
  return { kind, name: OPTION_NAME[kind], description: phrase, recommended: recommend, lines, notes };
}
