import { preferencesFromWords } from "./dictionary";
import type { DesignProfile, DictionaryRow, Preference } from "./types";

/**
 * Forced-choice pairs — the designer's trick for "I don't know": show two floors side by side
 * and ask which they'd rather live with. Each answer becomes a preference (source "pair").
 */
export type PairKey = "undertone" | "tone" | "busyness" | "texture";
export type PairChoice = { undertone?: "Warm" | "Cool"; tone?: "light" | "dark"; busyness?: "Calm" | "Busy"; texture?: "Smooth" | "Textured" };

export const PAIRS: { key: PairKey; question: string; a: { value: string; label: string }; b: { value: string; label: string } }[] = [
  { key: "undertone", question: "Which would you rather live with?", a: { value: "Warm", label: "Warm (honey, golden)" }, b: { value: "Cool", label: "Cool (grey, ashy)" } },
  { key: "tone", question: "Lighter or darker?", a: { value: "light", label: "Light" }, b: { value: "dark", label: "Dark" } },
  { key: "busyness", question: "Calm and even, or lots of character?", a: { value: "Calm", label: "Calm, even" }, b: { value: "Busy", label: "Knots and variation" } },
  { key: "texture", question: "Smooth, or a texture you can feel?", a: { value: "Smooth", label: "Smooth" }, b: { value: "Textured", label: "Textured" } },
];

const PAIR_WEIGHT = 0.7;

export function pairPreferences(choice: PairChoice): Preference[] {
  const base = { kind: "prefer" as const, source: "pair" as const, weight: PAIR_WEIGHT, also: null };
  const out: Preference[] = [];
  if (choice.undertone === "Warm") out.push({ ...base, id: "pair:undertone", label: "Picked warm", attrs: { undertone: ["Warm", "Neutral"] }, say: "You leaned warm, so these have warm or neutral undertones." });
  if (choice.undertone === "Cool") out.push({ ...base, id: "pair:undertone", label: "Picked cool", attrs: { undertone: ["Cool", "Neutral"] }, say: "You leaned cool, so these sit in the neutral-to-grey range." });
  if (choice.tone === "light") out.push({ ...base, id: "pair:tone", label: "Picked light", attrs: { tone: [1, 3] }, say: "You picked the lighter floor." });
  if (choice.tone === "dark") out.push({ ...base, id: "pair:tone", label: "Picked dark", attrs: { tone: [3, 5] }, say: "You picked the darker floor." });
  if (choice.busyness === "Calm") out.push({ ...base, id: "pair:busyness", label: "Picked calm", attrs: { busyness: ["Calm", "Moderate"] }, say: "You wanted it calm and even." });
  if (choice.busyness === "Busy") out.push({ ...base, id: "pair:busyness", label: "Picked character", attrs: { busyness: ["Moderate", "Busy"] }, say: "You liked knots and variation." });
  if (choice.texture === "Smooth") out.push({ ...base, id: "pair:texture", label: "Picked smooth", attrs: { texture: ["Smooth"] }, say: "You picked a smooth surface." });
  if (choice.texture === "Textured") out.push({ ...base, id: "pair:texture", label: "Picked textured", attrs: { texture: ["Brushed", "Rustic"] }, say: "You picked a surface you can feel." });
  return out;
}

export type Answers = Omit<DesignProfile, "prefs" | "open_questions" | "profile_version"> & {
  pairs: PairChoice;
  removed: string[]; // preference ids staff removed (a chip the words triggered by mistake)
};

/** Answers + the Dictionary -> the Design Profile the recommender reads. */
export function buildProfile(a: Answers, dictionary: DictionaryRow[]): DesignProfile {
  const removed = new Set(a.removed);
  const prefs = [...preferencesFromWords(a.said.like, a.said.dislike, dictionary), ...pairPreferences(a.pairs)]
    .filter((p) => !removed.has(p.id));
  const open: string[] = [];
  if (!a.hard.rooms.length) open.push("Which rooms? (Not asked yet — waterproof and sound rules may apply.)");
  if (a.hard.budget_ceiling_sf === null) open.push("No budget given — showing all price points.");
  if (a.fixed.cabinets === "wood" && a.fixed.cabinet_tone === null) open.push("Wood cabinets, but how light or dark? (Needed for the contrast rule.)");
  return { profile_version: "1", hard: a.hard, space: a.space, living: a.living, fixed: a.fixed, said: a.said, prefs, open_questions: open };
}

export const EMPTY_ANSWERS: Answers = {
  hard: {
    rooms: [], level: null, condo: false, min_iic: null, radiant_heat: false, accepts_wood_in_wet_rooms: false,
    categories_allowed: null, budget_ceiling_sf: null, max_thickness_mm: null,
  },
  space: { size: null, open_plan: false, light: null, heavy_sun: false, pattern: null },
  living: { pets: false, high_traffic: false, resale: false },
  fixed: { cabinets: null, cabinet_tone: null, fixed_undertone: null },
  said: { like: "", dislike: "" },
  pairs: {},
  removed: [],
};
