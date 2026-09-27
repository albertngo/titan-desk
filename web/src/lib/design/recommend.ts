import { applySafety, safetyQuestions } from "./safety";
import { floorValue, isFloorField, parseValues, triggered, valueMatches } from "./rules";
import { jobNotes, scoreFloor } from "./score";
import { FLOOR_CATEGORIES, LOOK_ALIKES, REAL_WOOD, VINYL, type Candidate, type DesignProfile, type DesignRule, type PickRole, type Recommendation, type Scored } from "./types";

export const BUDGET_STRETCH = 0.15;
const MIN_PICKS = 3;

type JobFilterState = {
  ceiling: number | null;      // $/sf; null = no budget filter
  categories: string[];
  requireRules: DesignRule[];  // Design Require/Exclude rules still enforced
};

/** Design Require/Exclude rules that are triggered for this job (Safety ones live in safety.ts). */
export function designFilters(rules: DesignRule[], p: DesignProfile): DesignRule[] {
  return rules.filter((r) => r.kind === "Design" && (r.effect === "Require" || r.effect === "Exclude") && triggered(r.rule_when, p));
}

function passesJob(f: Candidate, s: JobFilterState, p: DesignProfile): boolean {
  if (!f.category || !s.categories.includes(f.category)) return false;
  if (s.ceiling !== null) {
    if (f.price_unit !== "sf" || f.price_on_request || f.retail_price === null) return false;
    if (f.retail_price > s.ceiling) return false;
  }
  if (p.hard.max_thickness_mm !== null && f.thickness_mm !== null && f.thickness_mm > p.hard.max_thickness_mm) return false;
  for (const r of s.requireRules) {
    if (!isFloorField(r.field)) continue;
    // wear-layer thresholds are a vinyl measure; they say nothing about wood or tile
    if (r.field === "Wear layer (mil)" && !(VINYL as readonly string[]).includes(f.category ?? "")) continue;
    const hit = valueMatches(floorValue(r.field, f), parseValues(r.rule_values));
    if (hit === null) continue; // unknown on this floor: kept, never guessed either way
    if (r.effect === "Require" && !hit) return false;
    if (r.effect === "Exclude" && hit) return false;
  }
  return true;
}

function collectionKey(f: Candidate): string {
  return (f.collection ? `${f.brand ?? f.supplier ?? ""}|${f.collection}` : f.sku).toLowerCase();
}

function rank(a: Scored, b: Scored): number {
  return (
    b.score - a.score ||
    Number(a.untagged) - Number(b.untagged) ||
    Number(b.floor.stock_status === "In stock") - Number(a.floor.stock_status === "In stock") ||
    (a.floor.retail_price ?? Infinity) - (b.floor.retail_price ?? Infinity) ||
    a.floor.sku.localeCompare(b.floor.sku)
  );
}

/** Best match, a step up and a smart-value pick — never two from the same collection. */
export function pickThree(ranked: Scored[]): { picks: (Scored & { role: PickRole })[]; more: Scored[] } {
  const distinct: Scored[] = [];
  const seen = new Set<string>();
  for (const s of ranked) {
    const k = collectionKey(s.floor);
    if (seen.has(k)) continue;
    seen.add(k);
    distinct.push(s);
  }
  if (!distinct.length) return { picks: [], more: [] };
  const best = distinct[0];
  const used = new Set([best.floor.sku]);
  const bestPrice = best.floor.retail_price ?? 0;
  const isWood = (s: Scored) => (REAL_WOOD as readonly string[]).includes(s.floor.category ?? "");

  // Step up: a better-matching-or-equal floor that is real wood (when the best isn't), wider, or
  // pricier; among those the best score wins, then real wood, then price.
  const window = distinct.slice(1, 13);
  const woodUp = (s: Scored) => isWood(s) && !isWood(best);
  const upgrades = window.filter((s) => woodUp(s) || (s.floor.retail_price ?? 0) > bestPrice || (s.floor.width_in ?? 0) > (best.floor.width_in ?? 0));
  const stepUp =
    [...upgrades].sort((a, b) => b.score - a.score || Number(woodUp(b)) - Number(woodUp(a)) || (b.floor.retail_price ?? 0) - (a.floor.retail_price ?? 0))[0] ??
    window[0];
  if (stepUp) used.add(stepUp.floor.sku);

  const floor = best.score - Math.max(Math.abs(best.score) * 0.35, 0.2);
  const pool = distinct.slice(1, 16).filter((s) => !used.has(s.floor.sku));
  const value =
    [...pool].filter((s) => s.score >= floor && s.floor.retail_price !== null).sort((a, b) => a.floor.retail_price! - b.floor.retail_price!)[0] ??
    pool[0];
  if (value) used.add(value.floor.sku);

  const picks: (Scored & { role: PickRole })[] = [{ ...best, role: "Best match" }];
  if (stepUp) picks.push({ ...stepUp, role: "Step up" });
  if (value) picks.push({ ...value, role: "Smart value" });
  return { picks, more: distinct.filter((s) => !used.has(s.floor.sku)).slice(0, 10) };
}

/**
 * The whole pipeline. Pure: same inputs, same answer. `floors` is whatever the page loaded (all
 * active flooring, tagged first); `rules` and `profile.prefs` come from the Airtable mirrors.
 */
export function recommend(floors: Candidate[], profile: DesignProfile, rules: DesignRule[]): Recommendation {
  const safety = applySafety(floors, profile);
  const allowed = profile.hard.categories_allowed?.length ? [...profile.hard.categories_allowed] : [...FLOOR_CATEGORIES];
  const state: JobFilterState = { ceiling: profile.hard.budget_ceiling_sf, categories: allowed, requireRules: designFilters(rules, profile) };
  const relaxed: string[] = [];

  let pool = safety.passed.filter((f) => passesJob(f, state, profile));
  const steps: [() => boolean, () => string][] = [
    [() => state.ceiling !== null && profile.hard.budget_ceiling_sf !== null && state.ceiling === profile.hard.budget_ceiling_sf,
     () => { state.ceiling = Math.round(profile.hard.budget_ceiling_sf! * (1 + BUDGET_STRETCH) * 100) / 100; return `Included floors up to ${Math.round(BUDGET_STRETCH * 100)}% over budget (to $${state.ceiling.toFixed(2)}/sf).`; }],
    [() => LOOK_ALIKES.some((c) => !state.categories.includes(c)) && state.categories.some((c) => (REAL_WOOD as readonly string[]).includes(c)),
     () => { state.categories = [...new Set([...state.categories, ...LOOK_ALIKES])]; return "Added look-alike vinyl and laminate alongside real wood."; }],
    [() => state.requireRules.length > 0,
     () => { const names = state.requireRules.map((r) => r.rule); state.requireRules = []; return `Relaxed: ${names.join("; ")}.`; }],
    [() => state.ceiling !== null,
     () => { state.ceiling = null; return "Ignored the budget — nothing close enough fit it."; }],
  ];
  for (const [can, run] of steps) {
    if (pool.length >= MIN_PICKS) break;
    if (!can()) continue;
    relaxed.push(run());
    pool = safety.passed.filter((f) => passesJob(f, state, profile));
  }

  const active = rules.filter((r) => r.kind === "Design" && triggered(r.rule_when, profile));
  const scored = pool.map((f) => scoreFloor(f, profile, active, { ceiling: profile.hard.budget_ceiling_sf })).sort(rank);
  const { picks, more } = pickThree(scored);

  return {
    picks,
    more,
    relaxed,
    excluded_by_safety: safety.failed,
    unconfirmed: safety.unconfirmed,
    pool: pool.length,
    tagged_in_pool: scored.filter((s) => !s.untagged).length,
    open_questions: [...profile.open_questions, ...safetyQuestions(profile), ...jobNotes(active)],
  };
}
