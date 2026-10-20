import { manualLine, type EditorLine } from "@/lib/editor/model";

/**
 * Stair profiles on the preliminary (Albert, 2026-10-18). The GHL mobile quote priced stairs by
 * "profile" (Main Stairs – Sand, Townhome – Vinyl Tread…) and a ChatGPT step turned the profile
 * into a customer-facing description. Here a profile is a stair type plus a method, the price is a
 * flat amount typed by staff, and the description is the old prompt's rules written out, so the
 * same profile always produces the same words. Pure, no I/O; tested in tests/stairs.test.ts.
 *
 * The phrases are customer copy, not data: change them here and they change everywhere.
 */

export const STAIR_TYPES = ["Main stairs", "Townhome", "Basement", "Half staircase"] as const;
export type StairType = (typeof STAIR_TYPES)[number];

export const STAIR_METHODS = ["Sand & stain", "Solid red oak caps", "Vinyl treads", "Vinyl flooring"] as const;
export type StairMethod = (typeof STAIR_METHODS)[number];

export type StairProfile = { type: StairType; method: StairMethod };
/** One staircase on the quick form: its profile and the flat price staff typed. */
export type StairWork = StairProfile & { price: number };

/** How many staircases the quick form offers (the GHL form had two profiles; three gives room). */
export const STAIR_ROWS = 3;

export const isStairType = (v: unknown): v is StairType => typeof v === "string" && (STAIR_TYPES as readonly string[]).includes(v);
export const isStairMethod = (v: unknown): v is StairMethod => typeof v === "string" && (STAIR_METHODS as readonly string[]).includes(v);

/** What each method means for the customer, word for word from the GHL stairs prompt. */
export const METHOD_PHRASE: Record<StairMethod, string> = {
  "Sand & stain":
    "We will sand your existing wooden steps down to bare wood, custom stain them to the color of your liking, and finish everything off with a durable protective coat that keeps them looking great and lasting for years.",
  "Solid red oak caps":
    "We will cap your old stair steps with solid red oak, a strong, beautiful hardwood, and custom stain them to match your floors, then seal everything with a durable protective coat for a seamless, long-lasting finish.",
  "Vinyl treads":
    "We'll install waterproof vinyl treads over your existing steps and finish everything off with clean, properly fitted trims and edgings for a durable, low-maintenance result.",
  "Vinyl flooring": "We will install vinyl flooring right over your steps and finish the edges with a matching nosing for a smooth, seamless look.",
};

/** The sentence a stair type adds after the method, or null when it adds nothing (basement and half staircases). */
export function modifierFor(type: StairType): string | null {
  if (type === "Townhome") return "The handrails will be sanded and refinished to match, and up to 50 spindles are included.";
  if (type === "Basement" || type === "Half staircase") return null;
  return "Up to 30 new spindles are included.";
}

/** Said once at the end, only when no staircase got a modifier sentence (every one was a basement or half staircase). */
export const CLOSING_SENTENCE =
  "If there are posts, handrails and spindles, those will either be completely brand new, refinished, or reused depending on your style and taste.";

/* ---------- the line ---------- */

export const PROFILE_SEP = " – ";

/** The line's wording, and the only durable mark of the profile: "Main stairs – Sand & stain". */
export const profileName = (p: StairProfile) => `${p.type}${PROFILE_SEP}${p.method}`;

/** A profile read back from a line's wording; null for anything that isn't exactly a profile. */
export function parseProfile(description: string | null | undefined): StairProfile | null {
  const parts = (description ?? "").split(/\s+[–\-·]\s+/).map((s) => s.trim());
  if (parts.length !== 2) return null;
  const type = STAIR_TYPES.find((t) => t.toLowerCase() === parts[0].toLowerCase());
  const method = STAIR_METHODS.find((m) => m.toLowerCase() === parts[1].toLowerCase());
  return type && method ? { type, method } : null;
}

/**
 * One staircase as a quote line: a flat, hand-priced line in the Stairs section. It has no card
 * source, so Premium never marks it up and the typed price is the customer's price.
 */
export function stairProfileLine(type: StairType, method: StairMethod, price: number | null): EditorLine {
  return { ...manualLine("Stairs", profileName({ type, method })), uom: "flat", qty: 1, unitPrice: price };
}

/* ---------- the description ---------- */

/**
 * The customer-facing description of the staircases, as the GHL prompt produced it: one bullet
 * per staircase (its name, the method phrase, then the stair type's sentence if it has one), and
 * the closing sentence only when no staircase received one. Empty when there are no staircases.
 */
export function stairDescription(profiles: StairProfile[]): string {
  if (profiles.length === 0) return "";
  let modified = false;
  const bullets = profiles.map((p) => {
    const mod = modifierFor(p.type);
    if (mod) modified = true;
    return `* ${[profileName(p), METHOD_PHRASE[p.method], mod].filter(Boolean).join(" ")}`;
  });
  return modified ? bullets.join("\n") : `${bullets.join("\n")}\n\n${CLOSING_SENTENCE}`;
}
