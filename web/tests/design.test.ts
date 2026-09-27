import { describe, expect, it } from "vitest";
import { matchPhrases, preferencesFromWords } from "../src/lib/design/dictionary";
import { buildProfile, EMPTY_ANSWERS, type Answers } from "../src/lib/design/profile";
import { pickThree, recommend } from "../src/lib/design/recommend";
import { parseValues, triggered, valueMatches } from "../src/lib/design/rules";
import { applySafety } from "../src/lib/design/safety";
import { scoreFloor } from "../src/lib/design/score";
import type { Candidate, DesignRule, DictionaryRow } from "../src/lib/design/types";

// ---- fixtures ------------------------------------------------------------------------------

const dict = (over: Partial<DictionaryRow> & Pick<DictionaryRow, "id" | "phrase" | "matches">): DictionaryRow => ({
  kind: "Preference", undertone: [], tone_depth_min: null, tone_depth_max: null, busyness: [], texture: [], style: [],
  width_min_in: null, width_max_in: null, weight: 1, also_look_for: null, also_avoid: null, say_to_client: null, ...over,
});

const DICT: DictionaryRow[] = [
  dict({ id: "warm", phrase: "Warm, cozy", matches: ["warm", "cozy"], undertone: ["Warm"], tone_depth_min: 2, tone_depth_max: 4, busyness: ["Moderate", "Busy"], say_to_client: "Warm and cozy." }),
  dict({ id: "modern", phrase: "Modern, clean", matches: ["modern", "clean"], undertone: ["Neutral"], busyness: ["Calm"], style: ["Modern"], say_to_client: "Clean and calm." }),
  dict({ id: "grey", phrase: "Too grey / cold", matches: ["too grey", "cold"], kind: "Avoid", undertone: ["Cool"] }),
  dict({ id: "busy", phrase: "Too busy", matches: ["too busy", "too many knots"], kind: "Avoid", busyness: ["Busy"] }),
];

const rule = (over: Partial<DesignRule> & Pick<DesignRule, "key" | "rule_when" | "effect">): DesignRule => ({
  rule: over.key, kind: "Design", field: null, rule_values: null, weight: 0, say_to_client: null, ...over,
});

const RULES: DesignRule[] = [
  rule({ key: "pets_mid_tones", rule_when: "Pets", effect: "Boost", field: "Tone depth", rule_values: "2-3", weight: 0.5, say_to_client: "Mid tones hide pet hair." }),
  rule({ key: "pets_no_darkest", rule_when: "Pets", effect: "Penalize", field: "Tone depth", rule_values: "5", weight: 0.5 }),
  rule({ key: "pets_wear_layer", rule_when: "Pets", effect: "Require", field: "Wear layer (mil)", rule_values: "20+" }),
  rule({ key: "cabinet_contrast", rule_when: "Wood cabinets", effect: "Penalize", field: "Contrast with cabinets", rule_values: "1", weight: 0.6 }),
  rule({ key: "sun_hardwood_warn", rule_when: "Heavy sun", effect: "Warn", field: "Category", rule_values: "Engineered hardwood, Solid hardwood", say_to_client: "Real wood fades in sun." }),
  rule({ key: "pattern_waste", rule_when: "Herringbone or chevron", effect: "Warn", field: "Layout pattern", say_to_client: "Add 10–15% waste." }),
  rule({ key: "below_grade_waterproof", kind: "Safety", rule_when: "Below grade", effect: "Require", field: "Waterproof" }),
];

let n = 0;
const floor = (over: Partial<Candidate> = {}): Candidate => ({
  sku: `LVP-TEST-${String(++n).padStart(4, "0")}`, product_name: "Test", brand: "B", collection: `C${n}`, category: "LVP",
  supplier: "S", grade: null, layout_pattern: null, retail_price: 4, price_unit: "sf", price_on_request: false, promo_active: false,
  price_stale: false, stock_status: "In stock", coming_soon: false, active: true, waterproof: true, radiant_heat_compatible: true,
  pet_friendly: true, iic_rating: 72, wear_layer_mil: 22, thickness_mm: 7, width_in: 7, undertone: "Neutral", tone_depth: 3,
  texture: "Smooth", style: ["Modern"], busyness: "Calm", style_tags_status: "AI suggested", hero: null, ...over,
});

const answers = (over: (a: Answers) => void = () => undefined): Answers => {
  const a: Answers = structuredClone(EMPTY_ANSWERS);
  over(a);
  return a;
};

// ---- dictionary ---------------------------------------------------------------------------

describe("dictionary matching", () => {
  it("matches whole words, case-insensitively", () => {
    expect(matchPhrases("Something WARM and cozy!", DICT).map((m) => m.row.id)).toEqual(["warm"]);
    expect(matchPhrases("a warmish tone", DICT)).toEqual([]);
  });

  it("longest trigger wins, so 'too busy' is not also a liking for busy", () => {
    const ids = matchPhrases("nothing too busy, and not too grey", DICT).map((m) => m.row.id);
    expect(ids.sort()).toEqual(["busy", "grey"]);
  });

  it("a preference named in the dislike box becomes an avoid", () => {
    const prefs = preferencesFromWords("warm", "too modern", DICT);
    expect(prefs.map((p) => [p.id, p.kind])).toEqual([["dict:warm", "prefer"], ["not:modern", "avoid"]]);
  });
});

// ---- rules ---------------------------------------------------------------------------------

describe("rule values and triggers", () => {
  it("parses ranges, minimums and lists", () => {
    expect(parseValues("2-3")).toEqual({ kind: "range", min: 2, max: 3 });
    expect(parseValues("72+")).toEqual({ kind: "min", min: 72 });
    expect(parseValues("Warm, Neutral")).toEqual({ kind: "list", items: ["Warm", "Neutral"] });
    expect(parseValues("")).toEqual({ kind: "any" });
  });

  it("a blank floor value is unknown, never a match or a miss", () => {
    expect(valueMatches(null, parseValues("2-3"))).toBeNull();
    expect(valueMatches(3, parseValues("2-3"))).toBe(true);
    expect(valueMatches(["Modern", "Coastal"], parseValues("Coastal"))).toBe(true);
  });

  it("triggers come from the job", () => {
    const p = buildProfile(answers((a) => { a.hard.rooms = ["Basement"]; a.living.pets = true; }), DICT);
    expect(triggered("Below grade", p)).toBe(true);
    expect(triggered("Pets", p)).toBe(true);
    expect(triggered("Condo", p)).toBe(false);
    expect(triggered("Not a real trigger", p)).toBe(false);
  });
});

// ---- safety --------------------------------------------------------------------------------

describe("safety (never relaxed)", () => {
  it("below grade: solid hardwood out, unticked waterproof held back and counted", () => {
    const p = buildProfile(answers((a) => { a.hard.level = "basement"; }), DICT);
    const r = applySafety([floor(), floor({ category: "Solid hardwood" }), floor({ waterproof: false })], p);
    expect(r.passed).toHaveLength(1);
    expect(r.failed).toBe(1);
    expect(r.unconfirmed[0]).toMatch(/^1 more might suit the basement/);
  });

  it("condo: IIC below the minimum fails, unknown IIC is held back", () => {
    const p = buildProfile(answers((a) => { a.hard.condo = true; }), DICT);
    const r = applySafety([floor({ iic_rating: 74 }), floor({ iic_rating: 66 }), floor({ iic_rating: null })], p);
    expect(r.passed.map((f) => f.iic_rating)).toEqual([74]);
    expect(r.failed).toBe(1);
    expect(r.unconfirmed[0]).toMatch(/no IIC rating/);
  });

  it("discontinued and inactive floors never appear", () => {
    const p = buildProfile(answers(), DICT);
    expect(applySafety([floor({ stock_status: "Discontinued" }), floor({ active: false })], p).passed).toEqual([]);
  });

  it("a relaxed budget never brings back a floor safety removed", () => {
    const p = buildProfile(answers((a) => { a.hard.level = "basement"; a.hard.budget_ceiling_sf = 1; }), DICT);
    const rec = recommend([floor({ waterproof: false, retail_price: 0.5 }), floor({ retail_price: 9 })], p, RULES);
    expect(rec.picks.map((x) => x.floor.waterproof)).toEqual([true]);
  });
});

// ---- scoring -------------------------------------------------------------------------------

describe("scoring", () => {
  it("a floor matching what was said beats one that doesn't, and says why", () => {
    const p = buildProfile(answers((a) => { a.said.like = "warm and cozy"; }), DICT);
    const warm = scoreFloor(floor({ undertone: "Warm", tone_depth: 3, busyness: "Moderate" }), p, []);
    const cool = scoreFloor(floor({ undertone: "Cool", tone_depth: 3, busyness: "Calm" }), p, []);
    expect(warm.score).toBeGreaterThan(cool.score);
    expect(warm.reasons).toContain("Warm and cozy.");
  });

  it("an untagged floor sits between a match and a miss", () => {
    const p = buildProfile(answers((a) => { a.said.like = "warm"; }), DICT);
    const hit = scoreFloor(floor({ undertone: "Warm", busyness: "Busy" }), p, []).score;
    const blank = scoreFloor(floor({ undertone: null, tone_depth: null, busyness: null, texture: null, style: [] }), p, []);
    const miss = scoreFloor(floor({ undertone: "Cool", tone_depth: 5, busyness: "Calm" }), p, []).score;
    expect(blank.untagged).toBe(true);
    expect(blank.score).toBeLessThan(hit);
    expect(blank.score).toBeGreaterThan(miss);
  });

  it("an avoid costs heavily and is reported", () => {
    const p = buildProfile(answers((a) => { a.said.dislike = "too grey"; }), DICT);
    const s = scoreFloor(floor({ undertone: "Cool" }), p, []);
    expect(s.score).toBeLessThan(0);
    expect(s.warnings[0]).toMatch(/Too grey/);
  });

  it("wood cabinets: one shade off is penalized, clear contrast is not", () => {
    const p = buildProfile(answers((a) => { a.fixed.cabinets = "wood"; a.fixed.cabinet_tone = 3; }), DICT);
    const oneOff = scoreFloor(floor({ tone_depth: 4 }), p, RULES.filter((r) => r.rule_when === "Wood cabinets"));
    const contrast = scoreFloor(floor({ tone_depth: 1 }), p, RULES.filter((r) => r.rule_when === "Wood cabinets"));
    expect(oneOff.score).toBeLessThan(contrast.score);
  });

  it("pets: mid tones boosted with the rule's line", () => {
    const p = buildProfile(answers((a) => { a.living.pets = true; }), DICT);
    const s = scoreFloor(floor({ tone_depth: 3 }), p, RULES.filter((r) => r.rule_when === "Pets"));
    expect(s.reasons).toContain("Mid tones hide pet hair.");
  });
});

// ---- the whole flow ------------------------------------------------------------------------

describe("recommend", () => {
  it("returns best match, step up and smart value from different collections", () => {
    const floors = [
      floor({ collection: "A", retail_price: 4, undertone: "Warm", busyness: "Moderate" }),
      floor({ collection: "A", retail_price: 4.1, undertone: "Warm", busyness: "Moderate" }),
      floor({ collection: "B", retail_price: 6.5, undertone: "Warm", busyness: "Busy", category: "Engineered hardwood" }),
      floor({ collection: "C", retail_price: 2.9, undertone: "Warm", busyness: "Calm" }), // 2 of 3 attributes
      floor({ collection: "D", retail_price: 3.5, undertone: "Cool" }),
    ];
    const p = buildProfile(answers((a) => { a.said.like = "warm and cozy"; }), DICT);
    const rec = recommend(floors, p, RULES);
    expect(rec.picks.map((x) => x.role)).toEqual(["Best match", "Step up", "Smart value"]);
    expect(rec.picks[0].floor.collection).toBe("A");
    expect(new Set(rec.picks.map((x) => x.floor.collection)).size).toBe(3);
    expect(rec.picks.find((x) => x.role === "Step up")!.floor.collection).toBe("B");
    expect(rec.picks.find((x) => x.role === "Smart value")!.floor.retail_price).toBe(2.9);
  });

  it("relaxes the budget first, and says so", () => {
    const floors = [floor({ retail_price: 3 }), floor({ retail_price: 3.3 }), floor({ retail_price: 3.4 }), floor({ retail_price: 9 })];
    const p = buildProfile(answers((a) => { a.hard.budget_ceiling_sf = 3; }), DICT);
    const rec = recommend(floors, p, RULES);
    expect(rec.relaxed[0]).toMatch(/15% over budget/);
    expect(rec.pool).toBe(3);
    expect(rec.picks.filter((x) => x.above_budget)).toHaveLength(2);
  });

  it("a design Require (vinyl wear layer with pets) filters vinyl only and can be relaxed", () => {
    const floors = [floor({ wear_layer_mil: 12 }), floor({ wear_layer_mil: 30 }), floor({ category: "Laminate", wear_layer_mil: null })];
    const p = buildProfile(answers((a) => { a.living.pets = true; }), DICT);
    const rec = recommend(floors, p, RULES);
    expect(rec.relaxed.some((r) => r.includes("pets_wear_layer"))).toBe(true);
    const strict = recommend([...floors, floor({ wear_layer_mil: 20 })], p, RULES);
    expect(strict.relaxed).toEqual([]);
    expect(strict.picks.map((x) => x.floor.wear_layer_mil)).not.toContain(12);
  });

  it("job-level warnings and open questions come back once", () => {
    const p = buildProfile(answers((a) => { a.space.pattern = "herringbone"; a.hard.condo = true; }), DICT);
    const rec = recommend([floor(), floor(), floor()], p, RULES);
    expect(rec.open_questions).toContain("Add 10–15% waste.");
    expect(rec.open_questions.some((q) => q.includes("IIC minimum not confirmed"))).toBe(true);
  });

  it("pickThree never repeats a collection", () => {
    const s = (collection: string, score: number) => ({ floor: floor({ collection }), score, reasons: [], warnings: [], untagged: false, above_budget: false });
    const { picks } = pickThree([s("A", 3), s("A", 2.9), s("B", 2), s("C", 1)]);
    expect(picks.map((x) => x.floor.collection)).toEqual(["A", "B", "C"]);
  });
});
