import { describe, expect, it } from "vitest";
import { optionTotals } from "../src/lib/calc";
import { buildCatalogue } from "../src/lib/editor/model";
import type { StairRow } from "../src/lib/quotes/types";
import { derive } from "../src/lib/sitesheet/derive";
import { buildOptions, ITEM_NAMES } from "../src/lib/sitesheet/options";
import { looksHeic } from "../src/lib/sitesheet/photo";
import { cleanSheet, parseStored, serializeStored, sumParts, type SiteSheet } from "../src/lib/sitesheet/sheet";

/* Invented items, prices and sheets only (quote/CLAUDE.md rule 4). */

let n = 0;
const item = (name: string, rate: number): StairRow => ({ id: `recItem${String(++n).padStart(10, "0")}`, name, category: null, size: null, rate, cost: null });
const CARD = buildCatalogue(
  [],
  [
    item("Step (2 Side Close)", 100),
    item("Step (Right Side Open)", 120),
    item("Step (Left Side Open)", 120),
    item("Step (2 Side Open)", 150),
    item("Bullnose (Right Side Open)", 200),
    item("Pie Shape Step (Right)", 130),
    item("Corner Turn Steps (Right) - 3PC Set", 300),
    item("Landing", 180),
    item("1/2 Moon", 400),
    item("Riser", 10),
    item("Task: Sand Steps", 90),
    item("Task: New Handrail + Stain", 20),
    item("Task: New Curved Handrail + Stain", 35),
    item("Task: Sand + Stain Handrail", 8),
    item("Iron Spindles (w/material)", 20),
    item("New Post", 150),
    item("Accents: Nosing", 20),
    item("Accents: Nosing (w/Picket Holes)", 25),
    item("Task: Sand + Stain Nosing", 8),
    item("Task: 2 Side Paint (White)", 100),
    item("Task: 2 Side Oak Skin (Glue and Stain)", 500),
    item("Task: 2 Side Oak (Sand & Stain)", 300),
  ],
);

/** A made-up curved staircase, shaped like a real sheet: 5 RSO at 42", 7 right pie steps, a right bullnose. */
const curved = (over: Partial<Record<string, unknown>> = {}): SiteSheet =>
  cleanSheet({
    quoteNumber: "Q-0001",
    where: ["Main"],
    shape: "Curved",
    onSteps: "Carpet",
    treads: { rso: { w42: 5 } },
    pie: { rso: 7 },
    bullnose: { rso: 1 },
    totalTreads: 13,
    nosingDefault: { thickness: "3/4" },
    nosings: [{ ft: 12 }, { ft: 6 }],
    runs: [
      { ft: 15, where: "S", curved: true, pickets: true },
      { ft: 8, where: "F", pickets: true },
    ],
    spindles: { onSteps: 35, flatTop: 3 },
    posts: { now: 2 },
    stringers: { now: "White", made: "Solid" },
    want: { treads: ["unsure"], riser: "white", stringer: "white", handrail: "new", spindles: "iron", posts: "new", covers: "main" },
    unclear: [],
    ...over,
  });

describe("cleaning what was read", () => {
  it("keeps only values the sheet can hold, and never invents one", () => {
    const s = cleanSheet({ shape: "Zigzag", onSteps: "Carpet", treads: { rso: { w42: "5", w36: -2, w48: "x" } }, where: ["Main", "Attic", "Main"], unclear: ["B6", "nonsense", "B6"], pizza: { sets: 1, pieces: 4 }, pie: { boxed: 2, rso: 1 } });
    expect(s.shape).toBeNull();
    expect(s.onSteps).toBe("Carpet");
    expect(s.treads.rso).toEqual({ w36: null, w42: 5, w48: null, other: null, otherWidth: null });
    expect(s.where).toEqual(["Main"]);
    expect(s.unclear).toEqual(["B6"]);
    // A sheet saved before 2026-10-31 (one sets box, a pieces bubble): unmarked pieces read as 3-piece, as before.
    expect(s.pizza).toEqual({ two: null, pc2: null, pc3: 1 });
    // v5: pie and bullnose have no boxed column.
    expect(s.pie).toEqual({ boxed: null, lso: null, rso: 1, two: null });
    expect(cleanSheet(null).want.treads).toEqual([]);
  });

  it("adds up a count box written in parts, and refuses one it can't read (2026-10-31)", () => {
    expect(sumParts("4+3+2")).toEqual({ total: 9, parts: 3 });
    expect(sumParts(" 4 + 3 ")).toEqual({ total: 7, parts: 2 });
    expect(sumParts("4 3")).toEqual({ total: 7, parts: 2 });
    expect(sumParts("4+")).toEqual({ total: 4, parts: 1 });
    expect(sumParts("6")).toEqual({ total: 6, parts: 1 });
    expect(sumParts("4+x")).toEqual({ total: null, parts: 0 });
    const s = cleanSheet({ treads: { lso: { w36: "4+3", w42: 2, other: "1 1", otherWidth: "40" } }, pie: { rso: "1+1" }, bullnose: { two: "2+1" }, pizza: { two: "1+1", pc2: "1", pc3: "2+1" } });
    expect(s.treads.lso).toEqual({ w36: 7, w42: 2, w48: null, other: 2, otherWidth: 40 });
    expect(s.pie.rso).toBe(2);
    expect(s.bullnose.two).toBe(3);
    expect(s.pizza).toEqual({ two: 2, pc2: 1, pc3: 3 });
    // The width written beside Other is a width, never a sum.
    expect(cleanSheet({ treads: { rso: { otherWidth: "40+2" } } }).treads.rso.otherWidth).toBeNull();
    // Old saved pizza: a 2-piece set ticked 2 side open.
    expect(cleanSheet({ pizza: { sets: 2, pieces: 2, twoSide: true } }).pizza).toEqual({ two: 2, pc2: 2, pc3: null });
  });

  it("round-trips through the stored field, and refuses text it didn't write", () => {
    const stored = { sheet: curved(), by: "pm@example.com", at: "2026-10-28T12:00:00.000Z", checked: true };
    expect(parseStored(serializeStored(stored))).toEqual(stored);
    expect(parseStored("hello")).toBeNull();
    expect(parseStored("")).toBeNull();
  });
});

describe("what the app works out", () => {
  it("counts treads, and one more riser than steps with every landing counted as a step", () => {
    const d = derive(curved({ landings: { s3x3: 1 } }));
    expect(d.treads).toBe(13);
    expect(d.risers).toBe(13 + 1 + 1);
    expect(d.open).toEqual({ left: false, right: true });
  });

  it("estimates spindles at 2 a foot of rail with pickets on the steps and 3 a foot on the flat (Albert, 2026-10-31)", () => {
    const d = derive(curved({ spindles: {} }));
    expect(d.spindles).toEqual({ value: 15 * 2 + 8 * 3, how: "calculated", estimate: 54 });
    // A run with pickets on only part of it counts only those feet.
    expect(derive(curved({ spindles: {}, runs: [{ ft: 15, where: "S", pickets: true }, { ft: 10, where: "F", picketFt: 4 }] })).spindles.value).toBe(30 + 12);
    // His first real sheet: 2 ft flat and 5 + 5 ft on the steps with pickets, so 6 + 20 = 26 spindles; the wall run adds none.
    expect(derive(curved({ spindles: {}, runs: [{ ft: 2, where: "F", pickets: true }, { ft: 5, where: "S", pickets: true }, { ft: 6, where: "W" }, { ft: 5, where: "S", pickets: true }] })).spindles.value).toBe(26);
    // Each side rounds up on its own: 5.5 ft on the steps is 11, 1.5 ft flat is 4.5, so 5.
    expect(derive(curved({ spindles: {}, runs: [{ ft: 5.5, where: "S", pickets: true }, { ft: 1.5, where: "F", pickets: true }] })).spindles.value).toBe(11 + 5);
    // Stair runs with no pickets give no step spindles.
    expect(derive(curved({ spindles: {}, runs: [{ ft: 15, where: "S" }] })).spindles.value).toBe(0);
    // With no railing runs written at all, the per-step fallback: 2 a step, 3 a 2-side-open step.
    const two = derive(cleanSheet({ treads: { two: { w42: 2 }, rso: { w42: 4 } } }));
    expect(two.spindles.value).toBe(2 * 3 + 4 * 2);
  });

  it("splits handrail into straight and curved, and makes one holed nosing per flat run with pickets", () => {
    const d = derive(curved());
    expect(d.rail).toMatchObject({ straightFt: 8, curvedFt: 15, flatPicketFt: 8, totalFt: 23 });
    expect(d.nosing).toMatchObject({ pieces: 2, newPieces: 2, holedPieces: 1, feet: 18 });
  });

  it("checks the rail on the steps added up, against about 1.1 ft a tread (twice that if both sides are open)", () => {
    const railFlag = (d: ReturnType<typeof derive>) => d.flags.some((f) => f.startsWith("Railing on the steps"));
    expect(railFlag(derive(curved()))).toBe(false);
    expect(derive(curved({ runs: [{ ft: 5, where: "S", pickets: true }] })).flags.some((f) => f.startsWith("Railing on the steps adds up to 5 ft"))).toBe(true);
    // Albert's sheet: two 5 ft runs on 12 treads make 10 ft, about right; neither is flagged on its own.
    const twelve = (runs: unknown[], two = false) => derive(cleanSheet({ treads: two ? { two: { w42: 12 } } : { lso: { w42: 12 } }, runs }));
    expect(railFlag(twelve([{ ft: 5, where: "S" }, { ft: 5, where: "S" }]))).toBe(false);
    // Both sides open: a rail each side, about twice the length, is fine too.
    expect(railFlag(twelve([{ ft: 13, where: "S" }, { ft: 13, where: "S" }], true))).toBe(false);
    expect(railFlag(twelve([{ ft: 13, where: "S" }, { ft: 13, where: "S" }]))).toBe(true);
  });

  it("a nosing piece follows the default unless its own column says otherwise", () => {
    const s = curved({ nosingDefault: { carpet: true, thickness: "3/4" }, nosings: [{ ft: 4 }, { ft: 4, depth: 5, thickness: "1/2" }] });
    expect(s.nosingDefault).toEqual({ carpet: true, thickness: "3/4", depth: null });
    expect(s.nosings[0]).toMatchObject({ depth: null, thickness: null });
    expect(s.nosings[1]).toMatchObject({ depth: 5, thickness: "1/2" });
  });

  it("marks custom pizza sets (2-piece, or 3-piece 2 side open) and custom bullnoses (2 side open)", () => {
    expect(derive(cleanSheet({ pizza: { sets: 2, pieces: 3 } })).custom.pizzaSets).toBe(0);
    expect(derive(cleanSheet({ pizza: { sets: 2, pieces: 2 } })).custom.pizzaSets).toBe(2);
    expect(derive(cleanSheet({ pizza: { sets: 1, pieces: 3, twoSide: true } })).custom.pizzaSets).toBe(1);
    expect(derive(cleanSheet({ bullnose: { lso: 1, rso: 1, two: 2 } })).custom.bullnoses).toBe(2);
    // A 2-side-open pizza set takes 3 spindles a piece.
    expect(derive(cleanSheet({ pizza: { sets: 1, pieces: 3, twoSide: true } })).spindles.value).toBe(9);
  });

  it("reads pizza sets as 2-pc and 3-pc counts, with how many are 2 side open (2026-10-31)", () => {
    const d = (pizza: object) => derive(cleanSheet({ pizza }));
    expect(d({ pc2: 1, pc3: 2 })).toMatchObject({ pizzaSets: 3, treads: 8, custom: { pizzaSets: 1 } });
    // The 2-side-open sets are taken as the 3-piece ones first: 1 two-piece + 2 three-piece 2 side open are custom.
    expect(d({ pc2: 1, pc3: 2, two: 2 }).custom.pizzaSets).toBe(3);
    expect(d({ pc2: 1, pc3: 2, two: 2 }).openSides).toBe(2);
    // 2 side open alone: counted as 3-piece sets, as an unmarked set always was.
    expect(d({ two: 1 })).toMatchObject({ pizzaSets: 1, treads: 3, custom: { pizzaSets: 1 } });
    // More 2-side-open sets than the piece boxes add up to: the extra is 3-piece, and flagged.
    const over = d({ pc3: 1, two: 2 });
    expect(over.pizzaSets).toBe(2);
    expect(over.flags.some((f) => f.startsWith("Pizza sets:"))).toBe(true);
    // Spindles fallback: 2-side-open pieces take 3, the rest 2.
    expect(d({ pc2: 1, pc3: 1, two: 1 }).spindles.value).toBe(3 * 3 + 2 * 2);
  });

  it("works out wall-rail brackets: the first 1 ft in, then one every 2 ft", () => {
    const b = (ft: number) => derive(cleanSheet({ runs: [{ ft, where: "W" }] })).brackets;
    expect([b(1), b(2), b(3), b(10), b(11)]).toEqual([1, 1, 2, 5, 6]);
    expect(derive(cleanSheet({ runs: [{ ft: 10, where: "W" }, { ft: 10, where: "S" }, { ft: 5, where: "W" }] })).brackets).toBe(5 + 3);
  });

  it("notes the metal bar's hardware for the job", () => {
    expect(derive(cleanSheet({ metalBar: true })).notes.join(" ")).toMatch(/Metal bar/);
    expect(derive(cleanSheet({})).notes).toEqual([]);
  });

  it("a written count higher than the estimate wins quietly; a lower one is flagged to confirm", () => {
    const higher = derive(curved({ runs: [{ ft: 15, where: "S", pickets: true }], spindles: { onSteps: 47, flatTop: 3 } }));
    expect(higher.spindles).toMatchObject({ value: 50, how: "written" });
    expect(higher.flags.some((f) => f.startsWith("Spindles"))).toBe(false);
    const lower = derive(curved({ runs: [{ ft: 15, where: "S", pickets: true }], spindles: { onSteps: 10 } }));
    expect(lower.spindles.value).toBe(10);
    expect(lower.flags.some((f) => f.startsWith("Spindles: the sheet says 10"))).toBe(true);
  });

  it("splits picket heights 36/39 on the steps and 36 on the flat top, unless they're written", () => {
    expect(derive(curved()).heights).toEqual({ h36: 18 + 3, h39: 17, h42: 0, how: "calculated" });
    expect(derive(curved({ heights: { h36: 20, h39: 18 } })).heights).toMatchObject({ h36: 20, h39: 18, how: "written" });
  });

  it("flags a tread total that doesn't add up, an empty G1 and a missing side staircase", () => {
    const d = derive(curved({ totalTreads: 12, where: ["Main", "Side"], want: { treads: [] } }));
    expect(d.flags.join(" ")).toMatch(/Total treads: the sheet says 12, the boxes add up to 13/);
    expect(d.flags.join(" ")).toMatch(/Nothing is ticked under What the customer wants \(G1\), so every option is built/);
    expect(d.flags.join(" ")).toMatch(/side or half staircase is ticked/);
  });

  it("works out oak boxes for landings at about 20 sq ft a box", () => {
    expect(derive(cleanSheet({ landings: { s3x3: 1, s3x6: 1 } })).oakBoxes).toBe(2);
  });
});

describe("building options from what the customer wants", () => {
  it("uses the Stair Items created with blank prices (2026-10-28) as soon as they're priced", () => {
    const priced = buildCatalogue([], [item("Task: Paint Risers White", 6), ...CARD.flatMap((e) => (e.kind === "stair" ? [{ id: e.recordId, name: e.name, category: null, size: null, rate: e.rate, cost: null }] : []))]);
    const sand = buildOptions(curved({ shape: "Straight", onSteps: "Wood caps", want: { treads: ["sand"] } }), priced).options[0];
    expect(sand.lines.find((l) => l.description === "Task: Paint Risers White")?.qty).toBe(14);
  });

  it("never holds an option back: Not sure builds every one, the ones advised against with a note (2026-10-31)", () => {
    const r = buildOptions(curved(), CARD);
    expect(r.options.map((o) => o.kind)).toEqual(["caps", "sand", "vinylTreads", "vinylSteps"]);
    const note = (k: string) => r.options.find((o) => o.kind === k)!.notes[0];
    expect(note("sand")).toMatch(/^Not advised: carpet/);
    expect(note("vinylTreads")).toMatch(/^Not advised: a curved staircase/);
    expect(r.options.filter((o) => o.recommended).map((o) => o.kind)).toEqual(["caps"]);
    // Carpet removal is never a line: it costs nothing extra (Albert, 2026-10-31).
    expect(r.options.some((o) => o.lines.some((l) => /carpet/i.test(l.description)))).toBe(false);
    // Nothing ticked under G1 reads as Not sure.
    expect(buildOptions(curved({ want: { treads: [] } }), CARD).options).toHaveLength(4);
    // A tick the conditions advise against is still built, alone, and not recommended.
    const sand = buildOptions(curved({ want: { treads: ["sand"] } }), CARD).options;
    expect(sand.map((o) => [o.kind, o.recommended])).toEqual([["sand", false]]);
  });

  it("new caps: priced pieces from the card, new risers, one line per thing, and recommended on a curved stair", () => {
    const caps = buildOptions(curved(), CARD).options[0];
    const by = Object.fromEntries(caps.lines.map((l) => [l.description, l.qty]));
    expect(by).toMatchObject({
      'Step (Right Side Open) (42")': 5,
      "Bullnose (Right Side Open)": 1,
      "Pie Shape Step (Right)": 7,
      Riser: 14,
      "Task: New Handrail + Stain": 8,
      "Task: New Curved Handrail + Stain": 15,
      "Iron Spindles (w/material)": 38,
      "New Post": 2,
      "Accents: Nosing": 18,
      "Task: 2 Side Paint (White)": 1,
    });
    expect(caps.lines.every((l) => l.section === "Stairs")).toBe(true);
    expect(caps.recommended).toBe(true);
    expect(optionTotals(caps.lines, 0, false).subtotal).toBe(5 * 120 + 200 + 7 * 130 + 14 * 10 + 8 * 20 + 15 * 35 + 38 * 20 + 2 * 150 + 18 * 20 + 100);
  });

  it("vinyl treads and vinyl steps are separate options; a curved stair's vinyl treads are advised against", () => {
    const r = buildOptions(curved({ want: { treads: ["vinylTreads", "vinylSteps"] } }), CARD);
    expect(r.options.map((o) => o.kind)).toEqual(["vinylTreads", "vinylSteps"]);
    expect(r.options[0].notes[0]).toMatch(/^Not advised/);
    expect(r.options[1].lines.map((l) => l.description)).toContain("Vinyl flooring on the steps");
    const straight = buildOptions(curved({ shape: "Straight", want: { treads: ["vinylTreads", "vinylSteps"] } }), CARD);
    expect(straight.options.map((o) => [o.kind, o.name])).toEqual([["vinylTreads", "Vinyl treads"], ["vinylSteps", "Vinyl steps"]]);
    expect(straight.options[0].lines.map((l) => l.description)).toContain("Vinyl treads");
    expect(straight.options.some((o) => o.notes.some((n) => n.startsWith("Not advised")))).toBe(false);
  });

  it("square off bullnose is one line per bullnose, in every option", () => {
    const r = buildOptions(curved({ shape: "Straight", bullnose: { rso: 1, lso: 1 }, want: { treads: ["caps", "vinylTreads"], squareBullnose: true } }), CARD);
    for (const o of r.options) expect(o.lines.find((l) => l.description === "Square off bullnose")?.qty).toBe(2);
    expect(buildOptions(curved({ want: { treads: ["caps"] } }), CARD).options[0].lines.some((l) => l.description === "Square off bullnose")).toBe(false);
  });

  it("custom pieces replace the standard one, never sit on top; the pie's open side picks left or right (2026-10-31)", () => {
    const s = cleanSheet({ shape: "Quarter winder", treads: { lso: { w36: 4 } }, pie: { lso: 2, rso: 1 }, pizza: { pc2: 1, pc3: 1 }, bullnose: { two: 1 }, want: { treads: ["caps"] } });
    const lines = buildOptions(s, CARD).options[0].lines;
    const by = Object.fromEntries(lines.map((l) => [l.description, l.qty]));
    // One standard set and one custom set (the 2-piece), not two standard plus an upcharge.
    expect(by).toMatchObject({ "Corner Turn Steps (Right) - 3PC Set": 1, "Custom corner turn set": 1 });
    // A 2-side-open bullnose is its own item, with nothing on top.
    expect(lines.filter((l) => /bullnose/i.test(l.description))).toHaveLength(1);
    // The card has no left pie step, so the left ones take the right one's price; two lines, left first.
    expect(lines.filter((l) => l.description === "Pie Shape Step (Right)").map((l) => l.qty)).toEqual([2, 1]);
  });

  it("wall rail brackets come from the wall runs, and the added wall rail by the same rule", () => {
    const caps = buildOptions(curved({ runs: [{ ft: 15, where: "S", curved: true, pickets: true }, { ft: 9, where: "W" }], want: { treads: ["caps"], handrail: "new", wallRailFt: 7 } }), CARD).options[0];
    const brackets = caps.lines.filter((l) => l.description === "Wall rail brackets").map((l) => l.qty);
    expect(brackets).toEqual([5, 4]);
  });

  it("sanding only on wood caps; painted wood is a red flag; it's the piano look", () => {
    const wood = buildOptions(curved({ shape: "Straight", onSteps: "Wood caps", want: { treads: ["sand"], stringer: "stain", handrail: "refinish" } }), CARD).options[0];
    expect(wood.kind).toBe("sand");
    expect(wood.lines.find((l) => l.description === "Task: Sand Steps")?.qty).toBe(13);
    expect(wood.lines.find((l) => l.description === "Task: 2 Side Paint (White)")).toBeTruthy();
    expect(wood.lines.find((l) => l.description === "Task: Sand + Stain Nosing")?.qty).toBe(2);
    expect(wood.lines.find((l) => l.description === "Task: Sand + Stain Handrail")?.qty).toBe(23);
    expect(wood.lines.some((l) => l.description === "Carpet removed from the stairs")).toBe(false);
    const painted = buildOptions(curved({ onSteps: "Painted wood", want: { treads: ["sand"] } }), CARD).options[0];
    expect(painted.notes.join(" ")).toMatch(/Red flag: the steps are painted/);
  });

  it("stained stringers: sand & stain on solid, oak skin on veneer or when blank", () => {
    const solid = buildOptions(curved({ want: { treads: ["caps"], stringer: "stain" } }), CARD).options[0];
    expect(solid.lines.map((l) => l.description)).toContain("Task: 2 Side Oak (Sand & Stain)");
    const veneer = buildOptions(curved({ stringers: { made: "Veneer" }, want: { treads: ["caps"], stringer: "stain" } }), CARD).options[0];
    expect(veneer.lines.map((l) => l.description)).toContain("Task: 2 Side Oak Skin (Glue and Stain)");
    const blank = buildOptions(curved({ stringers: {}, want: { treads: ["caps"], stringer: "stain" } }), CARD).options[0];
    expect(blank.lines.map((l) => l.description)).toContain("Task: 2 Side Oak Skin (Glue and Stain)");
  });

  it("new posts replace every existing one plus the ones to add; keep adds only the new ones", () => {
    const newPosts = buildOptions(curved({ posts: { now: 2, add: 1 }, want: { treads: ["caps"], posts: "new" } }), CARD).options[0];
    expect(newPosts.lines.find((l) => l.description === "New Post")?.qty).toBe(3);
    const keep = buildOptions(curved({ posts: { now: 2, add: 1 }, want: { treads: ["caps"], posts: "keep" } }), CARD).options[0];
    expect(keep.lines.find((l) => l.description === "New Post")?.qty).toBe(1);
  });

  it("a pizza set is one corner-turn price per set, however many pieces", () => {
    const s = cleanSheet({ shape: "Quarter winder", treads: { boxed: { w36: 10 } }, pizza: { pc3: 2 }, want: { treads: ["caps"] } });
    const caps = buildOptions(s, CARD).options[0];
    expect(caps.lines.find((l) => l.description === "Corner Turn Steps (Right) - 3PC Set")?.qty).toBe(2);
    expect(derive(cleanSheet({ pizza: { pc2: 1 } })).treads).toBe(2);
    expect(derive(s).treads).toBe(16);
    expect(derive(cleanSheet({ pizza: { sets: 2 } })).treads).toBe(6);
  });

  it("the side staircase is priced only when the customer wants it covered", () => {
    const s = (covers: string) => curved({ where: ["Main", "Side"], side: { steps: 4, type: "boxed" }, want: { treads: ["caps"], covers } });
    const main = buildOptions(s("main"), CARD).options[0];
    const both = buildOptions(s("both"), CARD).options[0];
    expect(main.lines.some((l) => l.area === "Side staircase")).toBe(false);
    expect(both.lines.find((l) => l.area === "Side staircase")?.qty).toBe(4);
  });
});

describe("what is sent with the photos", () => {
  it("carries the schema in the message, so the request has nothing the API can refuse for its shape", async () => {
    const { SHEET_PROMPT, SHEET_SCHEMA } = await import("../src/lib/sitesheet/prompt");
    expect(SHEET_PROMPT).toContain(JSON.stringify(SHEET_SCHEMA));
    expect(SHEET_PROMPT).toMatch(/one JSON object and nothing else/);
  });
});

describe("handing the options to the editor", () => {
  it("uses the editor's own draft key for the version, so the editor opens with them (2026-10-28)", async () => {
    const { draftKey } = await import("../src/lib/editor/model");
    expect(draftKey({ quoteRecordId: "recVERSION0000001" })).toBe("titan-quote-draft:recVERSION0000001");
  });
});

describe("site sheet photos", () => {
  it("knows an iPhone HEIC photo by its type, or by its name when the browser gives no type (2026-10-31)", () => {
    expect(looksHeic({ type: "image/heic", name: "IMG_1.HEIC" })).toBe(true);
    expect(looksHeic({ type: "image/heif", name: "x" })).toBe(true);
    expect(looksHeic({ type: "", name: "IMG_2.heic" })).toBe(true);
    expect(looksHeic({ type: "image/jpeg", name: "IMG_3.jpg" })).toBe(false);
  });
});

describe("Albert's answers on the Stair Items (2026-10-31)", () => {
  const card = buildCatalogue([], [
    { id: "recE1Hfg2Wq86PCPL", name: "Landing (3x3)", category: null, size: null, rate: 100, cost: null },
    { id: "recGlSSfQCF4SlVsP", name: "Landing (3x6)", category: null, size: null, rate: 200, cost: null },
    { id: "recjl6cQsM2YhyZRt", name: "1/2 Moon Landing", category: null, size: null, rate: 50, cost: null },
    { id: "recFut4r1tdIoYZHn", name: "Half Moon Solid One-Piece", category: null, size: null, rate: 70, cost: null },
    { id: "rec4dOhd8fcJfHYIh", name: "Stringers Paint White (per staircase)", category: null, size: null, rate: 10, cost: null },
    { id: "recN7dcO7PWdhWFwb", name: "Step (Right Side Open)", category: null, size: '48"', rate: 5, cost: null },
  ]);
  const caps = (over: Partial<Record<string, unknown>>) => buildOptions(curved({ shape: "Straight", ...over, want: { treads: ["caps"], stringer: "white" } }), card).options[0].lines;
  const qty = (lines: ReturnType<typeof caps>, name: string) => lines.filter((l) => l.description === name).map((l) => l.qty);

  it("a 3x6 landing is its own item; another size is priced as a 3x3 and said so", () => {
    const l = caps({ landings: { s3x3: 1, s3x6: 2, other: 1 } });
    expect(qty(l, "Landing (3x3)")).toEqual([2]);
    expect(qty(l, "Landing (3x6)")).toEqual([2]);
    expect(buildOptions(curved({ landings: { other: 1 }, want: { treads: ["caps"] } }), card).options[0].notes.some((x) => x.includes("priced as 3 × 3"))).toBe(true);
  });

  it("a solid half moon replaces the 1/2 moon, never adds to it", () => {
    expect(qty(caps({ halfMoons: { count: 1, solid: true } }), "1/2 Moon Landing")).toEqual([]);
    expect(qty(caps({ halfMoons: { count: 1, solid: true } }), "Half Moon Solid One-Piece")).toEqual([1]);
    expect(qty(caps({ halfMoons: { count: 1 } }), "1/2 Moon Landing")).toEqual([1]);
  });

  it("stringers are one per staircase, or the decimal written in D3", () => {
    expect(qty(caps({}), "Stringers Paint White (per staircase)")).toEqual([1]);
    expect(qty(caps({ stringers: { count: "1.5" } }), "Stringers Paint White (per staircase)")).toEqual([1.5]);
  });

  it("steps get one line per width, all at the item's one price", () => {
    const l = caps({ treads: { rso: { w36: 3, w42: 2, other: 1, otherWidth: 40 } } });
    expect(l.filter((x) => x.description.startsWith("Step")).map((x) => [x.description, x.qty, x.unitPriceSnap])).toEqual([
      ['Step (Right Side Open) (36")', 3, 5],
      ['Step (Right Side Open) (42")', 2, 5],
      ['Step (Right Side Open) (40")', 1, 5],
    ]);
  });
});

describe("linking the site sheet to Stair Items (2026-10-31)", () => {
  // Every list's record id and today's name, at an invented price: what the live card looks like after the renames.
  const lists = Object.values(ITEM_NAMES).flatMap((v) => (Array.isArray(v) ? [v] : Object.values(v))).filter((l) => l.length > 0);
  const live = buildCatalogue(
    [],
    lists.filter((l) => l[0].startsWith("rec")).map((l) => ({ id: l[0], name: `${l[1]} (renamed again)`, category: null, size: null, rate: 10, cost: null })),
  );

  it("finds every item by its record id, whatever it is called now: nothing is left unpriced", () => {
    const everything = curved({
      shape: "Straight",
      onSteps: "Carpet",
      treads: { rso: { w36: 2 }, lso: { w42: 2 }, boxed: { w48: 2 }, two: { w36: 1 } },
      pie: { lso: 1, rso: 1 },
      pizza: { pc2: 1, pc3: 1, two: 1 },
      bullnose: { lso: 1, rso: 1, two: 1 },
      landings: { s3x3: 1 },
      halfMoons: { count: 1, solid: true },
      nosings: [{ ft: 4 }, { ft: 4, sand: true }],
      runs: [{ ft: 10, where: "S", curved: true, pickets: true }, { ft: 6, where: "F", pickets: true }, { ft: 9, where: "W" }],
      posts: { now: 2, add: 1 },
      stringers: { now: "White", made: "Solid" },
      want: { treads: ["unsure"], squareBullnose: true, handrail: "new", wallRailFt: 7, spindles: "iron", posts: "new", stringer: "stain" },
    });
    const built = buildOptions(everything, live).options;
    const unpriced = [...new Set(built.flatMap((o) => o.lines.filter((l) => l.sourceKind !== "stair").map((l) => l.description)))];
    expect(unpriced).toEqual([]);
    const refinish = buildOptions(curved({ shape: "Straight", onSteps: "Wood caps", stringers: { made: "Veneer" }, want: { treads: ["sand"], handrail: "refinish", posts: "refinish", spindles: "wood", stringer: "stain" } }), live).options[0];
    expect(refinish.lines.every((l) => l.sourceKind === "stair")).toBe(true);
  });

  it("new wood spindles are the one wood item, never iron plus a stain", () => {
    const wood = buildOptions(curved({ want: { treads: ["caps"], spindles: "wood" } }), live).options[0];
    const names = wood.lines.map((l) => l.description);
    expect(names).toContain("New Stain Wood Spindles (w/material) (renamed again)");
    expect(names.some((x) => x.includes("Iron"))).toBe(false);
  });
});
