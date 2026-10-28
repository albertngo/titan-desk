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
    pieTurn: "R",
    bullnose: { rso: 1 },
    totalTreads: 13,
    nosings: [{ full: 12, holed: 8 }, { full: 6 }],
    rail: { stairsFt: 20 },
    spindles: { onSteps: 35, flatTop: 3 },
    posts: { now: 2 },
    stringers: { now: "White", made: "Solid" },
    want: { treads: ["unsure"], riser: "white", stringer: "white", handrail: "new", spindles: "iron", posts: "new", covers: "main" },
    unclear: [],
    ...over,
  });

describe("cleaning what was read", () => {
  it("keeps only values the sheet can hold, and never invents one", () => {
    const s = cleanSheet({ shape: "Zigzag", onSteps: "Carpet", treads: { rso: { w42: "5", w36: -2, w48: "x" } }, where: ["Main", "Attic", "Main"], unclear: ["B6", "nonsense", "B6"], pizzaPieces: 4 });
    expect(s.shape).toBeNull();
    expect(s.onSteps).toBe("Carpet");
    expect(s.treads.rso).toEqual({ w36: null, w42: 5, w48: null, other: null, otherWidth: null });
    expect(s.where).toEqual(["Main"]);
    expect(s.unclear).toEqual(["B6"]);
    expect(s.pizzaPieces).toBeNull();
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

  it("estimates spindles at 2 a step, 3 a 2-side-open step and 3 a foot of picket holes", () => {
    const d = derive(curved({ spindles: {} }));
    expect(d.spindles).toEqual({ value: 13 * 2 + 8 * 3, how: "calculated", estimate: 50 });
    const two = derive(cleanSheet({ treads: { two: { w42: 2 }, rso: { w42: 4 } } }));
    expect(two.spindles.value).toBe(2 * 3 + 4 * 2);
  });

  it("a written count higher than the estimate wins quietly; a lower one is flagged to confirm", () => {
    const higher = derive(curved({ nosings: [], spindles: { onSteps: 35, flatTop: 3 } }));
    expect(higher.spindles).toMatchObject({ value: 38, how: "written" });
    expect(higher.flags.some((f) => f.startsWith("Spindles"))).toBe(false);
    const lower = derive(curved({ nosings: [], spindles: { onSteps: 10 } }));
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
  it("Not sure builds every option the conditions allow, and says why sanding isn't one under carpet", () => {
    const r = buildOptions(curved(), CARD);
    expect(r.options.map((o) => o.kind)).toEqual(["caps", "vinyl"]);
    expect(r.dropped).toEqual([expect.objectContaining({ kind: "sand", why: expect.stringMatching(/Carpet/) })]);
  });

  it("new caps: priced pieces from the card, new risers, one line per thing, and recommended on a curved stair", () => {
    const caps = buildOptions(curved(), CARD).options[0];
    const by = Object.fromEntries(caps.lines.map((l) => [l.description, l.qty]));
    expect(by).toMatchObject({
      "Step (Right Side Open)": 5,
      "Bullnose (Right Side Open)": 1,
      "Pie Shape Step (Right)": 7,
      Riser: 14,
      "Task: New Handrail + Stain": 20,
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
    expect(optionTotals(caps.lines, 0, false).subtotal).toBe(5 * 120 + 200 + 7 * 130 + 14 * 10 + 20 * 20 + 38 * 20 + 2 * 150 + 20 + 25 + 100);
  });

  it("a curved stair gets vinyl flooring, never vinyl treads", () => {
    const vinyl = buildOptions(curved({ want: { treads: ["vinyl"] } }), CARD).options[0];
    expect(vinyl.lines.map((l) => l.description)).toContain("Vinyl flooring on the steps");
    expect(vinyl.lines.map((l) => l.description)).not.toContain("Vinyl treads");
  });

  it("sanding only on wood caps; painted wood is a red flag; it's the piano look", () => {
    const wood = buildOptions(curved({ shape: "Straight", onSteps: "Wood caps", want: { treads: ["sand"], stringer: "oak", handrail: "refinish" } }), CARD).options[0];
    expect(wood.kind).toBe("sand");
    expect(wood.lines.find((l) => l.description === "Task: Sand Steps")?.qty).toBe(13);
    expect(wood.lines.find((l) => l.description === "Task: 2 Side Paint (White)")).toBeTruthy();
    expect(wood.lines.find((l) => l.description === "Task: Sand + Stain Nosing")?.qty).toBe(2);
    expect(wood.lines.some((l) => l.description === "Carpet removed from the stairs")).toBe(false);
    const painted = buildOptions(curved({ onSteps: "Painted wood", want: { treads: ["sand"] } }), CARD).options[0];
    expect(painted.notes.join(" ")).toMatch(/Red flag: the steps are painted/);
  });

  it("oak stringers: sand & stain on solid, oak skin on veneer or don't know", () => {
    const solid = buildOptions(curved({ want: { treads: ["caps"], stringer: "oak" } }), CARD).options[0];
    expect(solid.lines.map((l) => l.description)).toContain("Task: 2 Side Oak (Sand & Stain)");
    const veneer = buildOptions(curved({ stringers: { made: "Veneer" }, want: { treads: ["caps"], stringer: "oak" } }), CARD).options[0];
    expect(veneer.lines.map((l) => l.description)).toContain("Task: 2 Side Oak Skin (Glue and Stain)");
  });

  it("new posts replace every existing one plus the ones to add; keep adds only the new ones", () => {
    const newPosts = buildOptions(curved({ posts: { now: 2, add: 1 }, want: { treads: ["caps"], posts: "new" } }), CARD).options[0];
    expect(newPosts.lines.find((l) => l.description === "New Post")?.qty).toBe(3);
    const keep = buildOptions(curved({ posts: { now: 2, add: 1 }, want: { treads: ["caps"], posts: "keep" } }), CARD).options[0];
    expect(keep.lines.find((l) => l.description === "New Post")?.qty).toBe(1);
  });

  it("a pizza set is one corner-turn price per set, whichever way it turns and however many pieces", () => {
    const s = cleanSheet({ shape: "Quarter winder", treads: { boxed: { w36: 10 } }, pizza: { boxed: 1 }, pizzaTurn: "L", pizzaPieces: 2, want: { treads: ["caps"] } });
    const caps = buildOptions(s, CARD).options[0];
    expect(caps.lines.find((l) => l.description === "Corner Turn Steps (Right) - 3PC Set")?.qty).toBe(1);
    expect(derive(s).treads).toBe(12);
  });

  it("the side staircase is priced only when the customer wants it covered", () => {
    const s = (covers: string) => curved({ where: ["Main", "Side"], side: { steps: 4, type: "boxed" }, want: { treads: ["caps"], covers } });
    const main = buildOptions(s("main"), CARD).options[0];
    const both = buildOptions(s("both"), CARD).options[0];
    expect(main.lines.some((l) => l.area === "Side staircase")).toBe(false);
    expect(both.lines.find((l) => l.area === "Side staircase")?.qty).toBe(4);
  });
});
