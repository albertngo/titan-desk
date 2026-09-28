import { triggered } from "./rules";
import type { Candidate, DesignProfile } from "./types";

/**
 * Safety rules. FIXED IN CODE and never relaxed, whatever the Design Rules table says (the table
 * lists them, with the same keys, so staff can see them and quote the wording).
 *
 * A catalogue checkbox cannot tell "no" from "nobody filled it in", so an unticked Waterproof or
 * Radiant box is treated as NOT CONFIRMED: the floor is kept out of the picks, and the result
 * says how many floors were held back that way so staff can check with the supplier.
 */

export const DEFAULT_CONDO_IIC = 72;

type Verdict = "ok" | "fail" | "unconfirmed";

type SafetyRule = {
  key: string;
  applies: (p: DesignProfile) => boolean;
  check: (f: Candidate, p: DesignProfile) => Verdict;
  unconfirmed: string; // "{n} floors …" sentence template for held-back floors
};

const WET = (p: DesignProfile) => triggered("Kitchen or bath", p) && !p.hard.accepts_wood_in_wet_rooms;

export const SAFETY_RULES: SafetyRule[] = [
  {
    key: "no_discontinued",
    applies: () => true,
    check: (f) => (!f.active || f.stock_status === "Discontinued" ? "fail" : "ok"),
    unconfirmed: "",
  },
  {
    key: "below_grade_no_solid",
    applies: (p) => triggered("Below grade", p),
    check: (f) => (f.category === "Solid hardwood" ? "fail" : "ok"),
    unconfirmed: "",
  },
  {
    key: "below_grade_waterproof",
    applies: (p) => triggered("Below grade", p),
    check: (f) => (f.waterproof ? "ok" : "unconfirmed"),
    unconfirmed: "{n} more might suit the basement, but Waterproof isn't ticked on them — confirm with the supplier before offering",
  },
  {
    key: "wet_rooms_waterproof",
    applies: WET,
    check: (f) => (f.waterproof ? "ok" : "unconfirmed"),
    unconfirmed: "{n} more might suit, but Waterproof isn't ticked on them — confirm before offering for a kitchen or bathroom",
  },
  {
    key: "radiant_compatible",
    applies: (p) => p.hard.radiant_heat,
    check: (f) => (f.radiant_heat_compatible ? "ok" : "unconfirmed"),
    unconfirmed: "{n} more might suit, but they aren't marked radiant-heat compatible — confirm with the supplier",
  },
  {
    key: "condo_iic",
    applies: (p) => p.hard.condo,
    check: (f, p) => {
      if (f.iic_rating === null) return "unconfirmed";
      return f.iic_rating >= (p.hard.min_iic ?? DEFAULT_CONDO_IIC) ? "ok" : "fail";
    },
    unconfirmed: "{n} more have no IIC rating on file — they may pass the condo's sound rule, but check first",
  },
];

export type SafetyResult = {
  passed: Candidate[];
  failed: number;
  unconfirmed: string[];
};

export function applySafety(floors: Candidate[], p: DesignProfile): SafetyResult {
  const rules = SAFETY_RULES.filter((r) => r.applies(p));
  const held = new Map<string, number>();
  const passed: Candidate[] = [];
  let failed = 0;
  for (const f of floors) {
    let verdict: Verdict = "ok";
    let heldBy: SafetyRule | null = null;
    for (const r of rules) {
      const v = r.check(f, p);
      if (v === "fail") { verdict = "fail"; break; }
      if (v === "unconfirmed" && verdict === "ok") { verdict = "unconfirmed"; heldBy = r; }
    }
    if (verdict === "ok") passed.push(f);
    else if (verdict === "fail") failed += 1;
    else if (heldBy) held.set(heldBy.key, (held.get(heldBy.key) ?? 0) + 1);
  }
  const unconfirmed = rules
    .filter((r) => held.get(r.key))
    .map((r) => r.unconfirmed.replace("{n}", String(held.get(r.key))));
  return { passed, failed, unconfirmed };
}

/** Open questions the job raises (asked back to the client, shown with the results). */
export function safetyQuestions(p: DesignProfile): string[] {
  const q: string[] = [];
  if (p.hard.condo && p.hard.min_iic === null) q.push(`Building's IIC minimum not confirmed — assumed ${DEFAULT_CONDO_IIC}.`);
  if (triggered("Kitchen or bath", p) && p.hard.accepts_wood_in_wet_rooms) q.push("Client accepts real wood in a wet room — remind them about spills.");
  return q;
}
