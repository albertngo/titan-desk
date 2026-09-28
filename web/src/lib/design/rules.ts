import type { Candidate, DesignProfile, DesignRule, RuleWhen } from "./types";

/** "2-3" -> range, "7+" / "72+" -> minimum, "Warm, Neutral" -> list, "5" -> [5], blank -> any. */
export type Values =
  | { kind: "any" }
  | { kind: "range"; min: number; max: number }
  | { kind: "min"; min: number }
  | { kind: "list"; items: string[] };

export function parseValues(raw: string | null | undefined): Values {
  const s = (raw ?? "").trim();
  if (!s) return { kind: "any" };
  let m = /^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (m) return { kind: "range", min: Math.min(+m[1], +m[2]), max: Math.max(+m[1], +m[2]) };
  m = /^(\d+(?:\.\d+)?)\s*\+$/.exec(s);
  if (m) return { kind: "min", min: +m[1] };
  return { kind: "list", items: s.split(",").map((x) => x.trim()).filter(Boolean) };
}

const WET_ROOMS = new Set(["Kitchen", "Bathroom", "Laundry"]);

/** Does the job/profile make this rule's WHEN true? Unknown triggers are false (never guess). */
export function triggered(when: RuleWhen | string, p: DesignProfile): boolean {
  const styles = new Set(p.prefs.filter((x) => x.kind === "prefer").flatMap((x) => x.attrs.style ?? []));
  switch (when) {
    case "Always": return true;
    case "Below grade": return p.hard.level === "basement" || p.hard.rooms.includes("Basement");
    case "Radiant heat": return p.hard.radiant_heat;
    case "Condo": return p.hard.condo;
    case "Kitchen or bath": return p.hard.rooms.some((r) => WET_ROOMS.has(r));
    case "Pets": return p.living.pets;
    case "High traffic": return p.living.high_traffic;
    case "Small room": return p.space.size === "small";
    case "Large open plan": return p.space.open_plan || p.space.size === "large";
    case "Low light": return p.space.light === "low";
    case "Heavy sun": return p.space.heavy_sun;
    case "Resale or timeless": return p.living.resale;
    case "Wood cabinets": return p.fixed.cabinets === "wood" && p.fixed.cabinet_tone !== null;
    case "Warm fixed elements": return p.fixed.fixed_undertone === "Warm";
    case "Cool fixed elements": return p.fixed.fixed_undertone === "Cool";
    case "Wants Modern": return styles.has("Modern");
    case "Wants Rustic": return styles.has("Rustic");
    case "Herringbone or chevron": return p.space.pattern === "herringbone" || p.space.pattern === "chevron";
    case "Stairs": return p.hard.rooms.includes("Stairs");
    default: return false;
  }
}

const FLOOR_FIELDS = new Set([
  "Waterproof", "Radiant heat compatible", "IIC rating", "Category", "Stock status", "Wear layer (mil)",
  "Undertone", "Tone depth", "Busyness", "Texture", "Style", "Width (in)",
]);

/** Is this rule field an attribute of a floor (vs. a job-level note such as layout pattern)? */
export function isFloorField(field: string | null): boolean {
  return field !== null && FLOOR_FIELDS.has(field);
}

/** The floor's value for a rule field, or undefined when the rule field is not a floor attribute. */
export function floorValue(field: string | null, f: Candidate): string | number | boolean | string[] | null | undefined {
  switch (field) {
    case "Waterproof": return f.waterproof;
    case "Radiant heat compatible": return f.radiant_heat_compatible;
    case "IIC rating": return f.iic_rating;
    case "Category": return f.category;
    case "Stock status": return f.stock_status;
    case "Wear layer (mil)": return f.wear_layer_mil;
    case "Undertone": return f.undertone;
    case "Tone depth": return f.tone_depth;
    case "Busyness": return f.busyness;
    case "Texture": return f.texture;
    case "Style": return f.style;
    case "Width (in)": return f.width_in;
    default: return undefined;
  }
}

/**
 * true = the floor's value satisfies `values`; false = it does not; null = unknown (blank on the
 * floor, so the rule can neither reward nor punish it).
 */
export function valueMatches(v: ReturnType<typeof floorValue>, values: Values): boolean | null {
  if (v === undefined) return null;
  if (typeof v === "boolean") return values.kind === "any" ? v : null;
  if (v === null || (Array.isArray(v) && v.length === 0)) return null;
  switch (values.kind) {
    case "any": return true;
    case "range": return typeof v === "number" ? v >= values.min && v <= values.max : null;
    case "min": return typeof v === "number" ? v >= values.min : null;
    case "list": {
      const want = new Set(values.items.map((x) => x.toLowerCase()));
      if (Array.isArray(v)) return v.some((x) => want.has(x.toLowerCase()));
      if (typeof v === "number") return values.items.some((x) => Number(x) === v);
      return want.has(String(v).toLowerCase());
    }
  }
}

export function activeDesignRules(rules: DesignRule[], p: DesignProfile): DesignRule[] {
  return rules.filter((r) => r.kind === "Design" && triggered(r.rule_when, p));
}
