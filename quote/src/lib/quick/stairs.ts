import { manualLine, type EditorLine, type EditorQuote } from "@/lib/editor/model";
import type { StairProfileRow } from "@/lib/quotes/types";

/**
 * Stair profiles on the preliminary (Albert, 2026-10-18; presets 2026-10-20; Stair Item lines
 * 2026-11-02). The GHL mobile quote priced stairs by "profile" (Wood on Main Stairs, Sand Steps…) at
 * a preset price, and a ChatGPT step turned the profile into a customer-facing description. Here a
 * profile is a Stair Profiles row in Airtable (a name, a stair type, a method, its Stair Items and
 * preset counts; the lines are made in src/lib/quick/plan.ts) and the description is the old
 * prompt's rules written out from the type and method, so the same profile always produces the same
 * words. Pure, no I/O; tested in tests/stairs.test.ts.
 *
 * The phrases are customer copy, not data: change them here and they change everywhere. The
 * prices are data: they live on the rows, never here.
 */

export const STAIR_TYPES = ["Main stairs", "Townhome", "Basement", "Half staircase"] as const;
export type StairType = (typeof STAIR_TYPES)[number];

export const STAIR_METHODS = ["Sand & stain", "Solid red oak caps", "Vinyl treads", "Vinyl flooring"] as const;
export type StairMethod = (typeof STAIR_METHODS)[number];

export type StairProfile = { type: StairType; method: StairMethod };

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
 * One staircase as a hand-priced line in the Stairs section (the fallback when no Stair Profiles
 * row fits). It has no card source, so Premium never marks it up and the typed price is the price.
 */
export function stairProfileLine(type: StairType, method: StairMethod, price: number | null): EditorLine {
  return { ...manualLine("Stairs", profileName({ type, method })), uom: "flat", qty: 1, unitPrice: price };
}

/** What a Stair Profiles row says for the description: its type and method. */
export const profileOf = (row: Pick<StairProfileRow, "type" | "method">): StairProfile => ({ type: row.type, method: row.method });

/**
 * One staircase at a Stair Profiles row's stored price and cost (2026-10-20). Since 2026-11-02 only
 * for a row with no Stair Items linked yet, so the preliminary keeps working while the links are
 * filled in; no typed price. The row is the line's source, so the editor's builder can still expand
 * it into Stair Item lines; Premium never marks it up.
 */
export function profileLine(row: Pick<StairProfileRow, "id" | "name" | "price" | "cost">): EditorLine {
  return {
    ...manualLine("Stairs", row.name),
    sourceKind: "profile",
    sourceId: row.id,
    uom: "each",
    qty: 1,
    unitPriceSnap: row.price,
    unitCostSnap: row.cost,
    unitPrice: null,
    hasSource: true,
  };
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

/* ---------- the wording from the option's Stair Profile lines (2026-11-07) ---------- */

/** A Stair Profiles row as the wording needs it: its name, type and method, and the Stair Item that stands for it. */
export type WordingProfile = { id: string; name: string; type: StairType; method: StairMethod; standardItemId?: string | null };

/** One staircase profile on an option, and how many of it. */
export type ProfileUse = { name: string; type: StairType; method: StairMethod; count: number };

type WordingLine = { section?: string | null; sourceKind: string; sourceId: string | null; qty: number | null; include?: boolean };

/**
 * The Stair Profiles an option's lines stand for, in the order they first appear (Albert, 2026-11-07: "the
 * description/customer wording should always be populated to the stair profile line items chosen"). A line is a
 * profile's when it is that profile's Standard Stair Item, or an older one-line preset of it (`sourceKind: "profile"`).
 * Lines left out of the total don't count; a quantity of 2 is two of that staircase.
 */
export function profileUses(lines: WordingLine[], profiles: WordingProfile[]): ProfileUse[] {
  const byItem = new Map(profiles.flatMap((p) => (p.standardItemId ? [[p.standardItemId, p] as const] : [])));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const uses = new Map<string, ProfileUse>();
  for (const l of lines) {
    if (l.include === false || (l.section ?? "Stairs") !== "Stairs" || !l.sourceId) continue;
    const p = l.sourceKind === "stair" ? byItem.get(l.sourceId) : l.sourceKind === "profile" ? byId.get(l.sourceId) : undefined;
    if (!p) continue;
    const n = Math.max(1, Math.round(l.qty ?? 1));
    const u = uses.get(p.id);
    if (u) u.count += n;
    else uses.set(p.id, { name: p.name, type: p.type, method: p.method, count: n });
  }
  return [...uses.values()];
}

/**
 * The customer wording for those staircases: each profile by name (with "× 2" when there are two), then the old GHL
 * prompt's words for its method and stair type, one block each, blank line between (Albert, 2026-11-07: "If there is
 * more than one. simply make it clear in the description the profiles and wordings"). The closing sentence comes once
 * at the end, only when no staircase got a sentence of its own, as before. Empty when there are none.
 */
export function profileWording(uses: ProfileUse[]): string {
  if (uses.length === 0) return "";
  let modified = false;
  const blocks = uses.map((u) => {
    const mod = modifierFor(u.type);
    if (mod) modified = true;
    return `${u.name}${u.count > 1 ? ` (× ${u.count})` : ""}\n${[METHOD_PHRASE[u.method], mod].filter(Boolean).join(" ")}`;
  });
  return modified ? blocks.join("\n\n") : `${blocks.join("\n\n")}\n\n${CLOSING_SENTENCE}`;
}

/** What the wording is written from, so it is rewritten only when the staircases change, never over a typed edit otherwise. */
export const profileSignature = (uses: ProfileUse[]) => uses.map((u) => `${u.name}×${u.count}`).join("|");

/**
 * On a preliminary, every option whose Stair Profile lines changed gets its wording rewritten from them (2026-11-07),
 * and a new option with staircases and no wording gets one. Nothing else is touched: an option whose staircases did
 * not change keeps whatever was typed, and one whose last staircase was taken off keeps its words for a person to clear.
 */
export function syncStairWording(before: EditorQuote, next: EditorQuote, profiles: WordingProfile[]): EditorQuote {
  if (profiles.length === 0) return next;
  let changed = false;
  const options = next.options.map((o) => {
    const uses = profileUses(o.lines, profiles);
    if (uses.length === 0) return o;
    const was = before.options.find((b) => b.id === o.id);
    const moved = was ? profileSignature(profileUses(was.lines, profiles)) !== profileSignature(uses) : !o.description.trim();
    const words = profileWording(uses);
    if (!moved || o.description === words) return o;
    changed = true;
    return { ...o, description: words };
  });
  return changed ? { ...next, options } : next;
}
