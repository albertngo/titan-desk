import { describe, expect, it } from "vitest";
import { optionTotals } from "../src/lib/calc";
import { buildCatalogue } from "../src/lib/editor/model";
import type { StairRow } from "../src/lib/quotes/types";
import { derive } from "../src/lib/sitesheet/derive";
import { buildOptions } from "../src/lib/sitesheet/options";
import { cleanSheet, parseStored, serializeStored, type SiteSheet } from "../src/lib/sitesheet/sheet";

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
    expect(s.pizza).toEqual({ sets: 1, twoSide: false, pieces: null });
    // v5: pie and bullnose have no boxed column.
    expect(s.pie).toEqual({ boxed: null, lso: null, rso: 1, two: null });
    expect(cleanSheet(null).want.treads).toEqual([]);
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

  it("estimates spindles from the railing: 2 a step on a run with pickets, 3 a 2-side-open step, 3 a foot of flat pickets", () => {
    const d = derive(curved({ spindles: {} }));
    expect(d.spindles).toEqual({ value: 13 * 2 + 8 * 3, how: "calculated", estimate: 50 });
    // A flat run with pickets on only part of it counts only those feet.
    expect(derive(curved({ spindles: {}, runs: [{ ft: 15, where: "S", pickets: true }, { ft: 10, where: "F", picketFt: 4 }] })).spindles.value).toBe(26 + 12);
    // Stair runs with no pickets give no step spindles.
    expect(derive(curved({ spindles: {}, runs: [{ ft: 15, where: "S" }] })).spindles.value).toBe(0);
    const two = derive(cleanSheet({ treads: { two: { w42: 2 }, rso: { w42: 4 } } }));
    expect(two.spindles.value).toBe(2 * 3 + 4 * 2);
  });

  it("splits handrail into straight and curved, and makes one holed nosing per flat run with pickets", () => {
    const d = derive(curved());
    expect(d.rail).toMatchObject({ straightFt: 8, curvedFt: 15, flatPicketFt: 8, totalFt: 23 });
    expect(d.nosing).toMatchObject({ pieces: 2, newPieces: 2, holedPieces: 1, feet: 18 });
  });

  it("flags a run on the steps far from about 1.1 ft a tread", () => {
    expect(derive(curved()).flags.some((f) => f.startsWith("Railing run"))).toBe(false);
    expect(derive(curved({ runs: [{ ft: 5, where: "S", pickets: true }] })).flags.some((f) => f.startsWith("Railing run 1 is 5 ft"))).toBe(true);
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
    const higher = derive(curved({ runs: [{ ft: 15, where: "S", pickets: true }], spindles: { onSteps: 35, flatTop: 3 } }));
    expect(higher.spindles).toMatchObject({ value: 38, how: "written" });
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
    expect(d.flags.join(" ")).toMatch(/Nothing is ticked under What the customer wants/);
    expect(d.flags.join(" ")).toMatch(/side or half staircase is ticked/);
  });

  it("works out oak boxes for landings at about 20 sq ft a box", () => {
    expect(derive(cleanSheet({ landings: { s3x3: 1, s3x6: 1 } })).oakBoxes).toBe(2);
  });
});

describe("building options from what the customer wants", () => {
  it("uses the Stair Items created with blank prices (2026-10-28) as soon as they're priced", () => {
    const priced = buildCatalogue([], [item("Task: Remove Carpet (Stairs)", 15), item("Task: Paint Risers White", 6), ...CARD.flatMap((e) => (e.kind === "stair" ? [{ id: e.recordId, name: e.name, category: null, size: null, rate: e.rate, cost: null }] : []))]);
    const caps = buildOptions(curved({ want: { treads: ["caps"] } }), priced).options[0];
    const carpet = caps.lines.find((l) => l.description === "Task: Remove Carpet (Stairs)")!;
    expect([carpet.sourceKind, carpet.qty, carpet.unitPriceSnap]).toEqual(["stair", 13, 15]);
    expect(caps.notes.some((x) => x.includes("no rate"))).toBe(false);
    const sand = buildOptions(curved({ shape: "Straight", onSteps: "Wood caps", want: { treads: ["sand"] } }), priced).options[0];
    expect(sand.lines.find((l) => l.description === "Task: Paint Risers White")?.qty).toBe(14);
  });

  it("Not sure builds every option the conditions allow, and says why sanding isn't one under carpet", () => {
    const r = buildOptions(curved(), CARD);
    expect(r.options.map((o) => o.kind)).toEqual(["caps", "vinylSteps"]);
    expect(r.dropped).toEqual([expect.objectContaining({ kind: "sand", why: expect.stringMatching(/Carpet/) }), expect.objectContaining({ kind: "vinylTreads", why: expect.stringMatching(/curved/) })]);
  });

  it("new caps: priced pieces from the card, new risers, one line per thing, and recommended on a curved stair", () => {
    const caps = buildOptions(curved(), CARD).options[0];
    const by = Object.fromEntries(caps.lines.map((l) => [l.description, l.qty]));
    expect(by).toMatchObject({
      "Step (Right Side Open)": 5,
      "Bullnose (Right Side Open)": 1,
      "Pie Shape Step (Right)": 7,
      Riser: 14,
      "Task: New Handrail + Stain": 8,
      "Task: New Curved Handrail + Stain": 15,
      "Iron Spindles (w/material)": 38,
      "New Post": 2,
      "Accents: Nosing": 1,
      "Accents: Nosing (w/Picket Holes)": 1,
      "Task: 2 Side Paint (White)": 1,
    });
    expect(caps.lines.every((l) => l.section === "Stairs")).toBe(true);
    expect(caps.recommended).toBe(true);
    // Carpet removal has no rate yet: a line with no price that says so, never a guess.
    const carpet = caps.lines.find((l) => l.description === "Carpet removed from the stairs")!;
    expect(carpet.sourceKind).toBe("manual");
    expect(carpet.unitPrice ?? null).toBeNull();
    expect(caps.notes.some((x) => x.startsWith("Carpet removed from the stairs: no rate"))).toBe(true);
    expect(optionTotals(caps.lines, 0, false).subtotal).toBe(5 * 120 + 200 + 7 * 130 + 14 * 10 + 8 * 20 + 15 * 35 + 38 * 20 + 2 * 150 + 20 + 25 + 100);
  });

  it("vinyl treads and vinyl steps are separate options; a curved stair gets vinyl steps only", () => {
    const r = buildOptions(curved({ want: { treads: ["vinylTreads", "vinylSteps"] } }), CARD);
    expect(r.options.map((o) => o.kind)).toEqual(["vinylSteps"]);
    expect(r.options[0].lines.map((l) => l.description)).toContain("Vinyl flooring on the steps");
    const straight = buildOptions(curved({ shape: "Straight", want: { treads: ["vinylTreads", "vinylSteps"] } }), CARD);
    expect(straight.options.map((o) => [o.kind, o.name])).toEqual([["vinylTreads", "Vinyl treads"], ["vinylSteps", "Vinyl steps"]]);
    expect(straight.options[0].lines.map((l) => l.description)).toContain("Vinyl treads");
    expect(straight.dropped).toEqual([]);
  });

  it("square off bullnose is one line per bullnose, in every option", () => {
    const r = buildOptions(curved({ shape: "Straight", bullnose: { rso: 1, lso: 1 }, want: { treads: ["caps", "vinylTreads"], squareBullnose: true } }), CARD);
    for (const o of r.options) expect(o.lines.find((l) => l.description === "Square off bullnose")?.qty).toBe(2);
    expect(buildOptions(curved({ want: { treads: ["caps"] } }), CARD).options[0].lines.some((l) => l.description === "Square off bullnose")).toBe(false);
  });

  it("custom pieces add their upcharge on top; the pie's open side picks left or right", () => {
    const s = cleanSheet({ shape: "Quarter winder", treads: { lso: { w36: 4 } }, pie: { lso: 2, rso: 1 }, pizza: { sets: 1, pieces: 2 }, bullnose: { two: 1 }, want: { treads: ["caps"] } });
    const lines = buildOptions(s, CARD).options[0].lines;
    const by = Object.fromEntries(lines.map((l) => [l.description, l.qty]));
    expect(by).toMatchObject({ "Corner Turn Steps (Right) - 3PC Set": 1, "Custom corner turn set": 1, "Custom-size bullnose (2 side open)": 1 });
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
    const s = cleanSheet({ shape: "Quarter winder", treads: { boxed: { w36: 10 } }, pizza: { sets: 1, pieces: 2 }, want: { treads: ["caps"] } });
    const caps = buildOptions(s, CARD).options[0];
    expect(caps.lines.find((l) => l.description === "Corner Turn Steps (Right) - 3PC Set")?.qty).toBe(1);
    expect(derive(s).treads).toBe(12);
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
