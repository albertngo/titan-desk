import { floorValue, isFloorField, parseValues, valueMatches } from "./rules";
import type { AttrSet, Candidate, DesignProfile, DesignRule, Preference, Scored } from "./types";

/**
 * Scoring. A preference's "fit" is the share of its attributes the floor matches; an attribute
 * the floor has no tag for earns UNKNOWN_CREDIT (a little, so an untagged floor is neither
 * buried nor allowed to beat a tagged match). Avoids cost AVOID_COST × weight when the floor
 * clearly has what the client disliked; an untagged attribute never triggers an avoid.
 */
export const UNKNOWN_CREDIT = 0.3;
export const AVOID_COST = 1.5;
const SOURCE_WEIGHT: Record<Preference["source"], number> = { said: 1, pair: 0.8, inferred: 0.6 };

type AttrCheck = { key: keyof AttrSet; hit: boolean | null; label: string };

function inRange(v: number | null, lo: number | null, hi: number | null): boolean | null {
  if (v === null) return null;
  return (lo === null || v >= lo) && (hi === null || v <= hi);
}

function inList(v: string | null, list: string[]): boolean | null {
  if (v === null) return null;
  return list.some((x) => x.toLowerCase() === v.toLowerCase());
}

export function checkAttrs(a: AttrSet, f: Candidate): AttrCheck[] {
  const out: AttrCheck[] = [];
  if (a.undertone) out.push({ key: "undertone", hit: inList(f.undertone, a.undertone), label: `${f.undertone ?? "?"} undertone` });
  if (a.tone) out.push({ key: "tone", hit: inRange(f.tone_depth, a.tone[0], a.tone[1]), label: `tone ${f.tone_depth ?? "?"}` });
  if (a.busyness) out.push({ key: "busyness", hit: inList(f.busyness, a.busyness), label: `${(f.busyness ?? "?").toLowerCase()} pattern` });
  if (a.texture) out.push({ key: "texture", hit: inList(f.texture, a.texture), label: `${(f.texture ?? "?").toLowerCase()} texture` });
  if (a.style) out.push({ key: "style", hit: f.style.length ? f.style.some((s) => a.style!.includes(s)) : null, label: f.style.join("/") || "style ?" });
  if (a.width) out.push({ key: "width", hit: inRange(f.width_in, a.width[0], a.width[1]), label: `${f.width_in ?? "?"}" wide` });
  return out;
}

export function prefFit(p: Preference, f: Candidate): { fit: number | null; checks: AttrCheck[] } {
  const checks = checkAttrs(p.attrs, f);
  if (!checks.length) return { fit: null, checks };
  const credit = checks.reduce((s, c) => s + (c.hit === true ? 1 : c.hit === null ? UNKNOWN_CREDIT : 0), 0);
  return { fit: credit / checks.length, checks };
}

export function isUntagged(f: Candidate): boolean {
  return f.undertone === null && f.tone_depth === null && f.texture === null && f.busyness === null && f.style.length === 0;
}

/** Tone-depth gap between the floor and wood cabinets (null when either is unknown). */
export function cabinetGap(f: Candidate, p: DesignProfile): number | null {
  if (p.fixed.cabinets !== "wood" || p.fixed.cabinet_tone === null || f.tone_depth === null) return null;
  return Math.abs(f.tone_depth - p.fixed.cabinet_tone);
}

export function scoreFloor(f: Candidate, p: DesignProfile, rules: DesignRule[], opts: { ceiling: number | null } = { ceiling: null }): Scored {
  let score = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];

  for (const pref of p.prefs) {
    const { fit, checks } = prefFit(pref, f);
    if (fit === null) continue;
    const w = pref.weight * SOURCE_WEIGHT[pref.source];
    if (pref.kind === "prefer") {
      score += w * fit;
      const matched = checks.filter((c) => c.hit === true);
      if (fit >= 0.66 && matched.length) reasons.push(pref.say ?? `Fits “${pref.label}”: ${matched.map((c) => c.label).join(", ")}.`);
    } else {
      const hits = checks.filter((c) => c.hit === true);
      if (hits.length) {
        score -= w * AVOID_COST;
        warnings.push(`Has ${hits.map((c) => c.label).join(", ")} — the client said “${pref.label}”.`);
      }
    }
  }

  for (const r of rules) {
    if (r.effect !== "Boost" && r.effect !== "Penalize" && r.effect !== "Warn") continue;
    let hit: boolean | null;
    if (r.field === "Contrast with cabinets") {
      const gap = cabinetGap(f, p);
      const bad = parseValues(r.rule_values);
      hit = gap === null ? null : valueMatches(gap, bad.kind === "any" ? { kind: "list", items: ["1"] } : bad);
    } else {
      if (!isFloorField(r.field)) continue; // job-level rule (layout pattern, stairs): reported once, not per floor
      const v = floorValue(r.field, f);
      hit = valueMatches(v, parseValues(r.rule_values));
    }
    if (hit !== true) continue;
    if (r.effect === "Boost") {
      score += r.weight;
      if (r.say_to_client) reasons.push(r.say_to_client);
    } else if (r.effect === "Penalize") {
      score -= r.weight;
      warnings.push(r.say_to_client ?? `${r.rule}.`);
    } else {
      warnings.push(r.say_to_client ?? `${r.rule}.`);
    }
  }

  const untagged = isUntagged(f);
  if (untagged) warnings.push("Not style-tagged yet — judge the look from the photo.");
  if (f.promo_active) reasons.push("It's on promo right now.");
  if (f.price_stale) warnings.push("Price hasn't been updated in 90+ days — confirm before quoting.");
  if (f.coming_soon) warnings.push("Coming soon — not in stock yet.");
  else if (f.stock_status === "Special order") warnings.push("Special order — check the lead time.");
  const above = opts.ceiling !== null && f.retail_price !== null && f.price_unit === "sf" && f.retail_price > opts.ceiling;
  if (above) warnings.push("Above the stated budget.");

  return { floor: f, score: Math.round(score * 1000) / 1000, reasons: dedupe(reasons), warnings: dedupe(warnings), untagged, above_budget: above };
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

/** Rules that apply to the job rather than a floor (Warn on layout pattern, stairs accessories). */
export function jobNotes(rules: DesignRule[]): string[] {
  return dedupe(rules.filter((r) => r.effect === "Warn" && !isFloorField(r.field) && r.field !== "Contrast with cabinets")
    .map((r) => r.say_to_client ?? r.rule));
}
