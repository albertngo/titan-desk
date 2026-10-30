/**
 * The Stairs section, grouped by the Stair Item's Category (Albert, 2026-10-28: "the stairs should have a
 * separation based on what the Airtable category is for the item"). Display only: money, sections and
 * Airtable are unchanged. The category comes from Quote Lines → Stair Category (a lookup through the line's
 * Stair Item) or, for a line just picked in the editor, from the card. Pure; tested in tests/stairGroups.test.ts.
 */

/** Categories in the order the work happens; anything else follows them, under its own name. */
export const STAIR_GROUP_ORDER = ["step", "bullnose", "riser", "landing", "accent", "railing", "task"] as const;

const LABEL: Record<string, string> = { step: "Steps", bullnose: "Bullnoses", riser: "Risers", landing: "Landings", accent: "Accents", railing: "Railing", task: "Tasks" };

/** A line's category, lower case; null when it has none (typed lines, older lines, items with no category). */
export const stairGroupOf = (l: { stairCategory?: string | null }): string | null => l.stairCategory?.trim().toLowerCase() || null;

/** "Steps", "Accents"…; a category this file doesn't know reads as written, and no category as "Other". */
export const stairGroupLabel = (g: string | null) => (g === null ? "Other" : (LABEL[g] ?? g.charAt(0).toUpperCase() + g.slice(1)));

const rank = (g: string | null) => {
  const i = g === null ? -1 : (STAIR_GROUP_ORDER as readonly string[]).indexOf(g);
  return i >= 0 ? i : g === null ? STAIR_GROUP_ORDER.length + 1 : STAIR_GROUP_ORDER.length;
};

/**
 * The lines in their groups, in work order, each group keeping the lines' own order. When no line has a
 * category there is one group with no heading (`group: null, heading: false`), so nothing changes on screen.
 */
export function stairGroups<T extends { stairCategory?: string | null }>(lines: T[]): { group: string | null; heading: boolean; lines: T[] }[] {
  if (!lines.some((l) => stairGroupOf(l) !== null)) return lines.length ? [{ group: null, heading: false, lines }] : [];
  const map = new Map<string | null, T[]>();
  for (const l of lines) {
    const g = stairGroupOf(l);
    map.set(g, [...(map.get(g) ?? []), l]);
  }
  return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || String(a[0]).localeCompare(String(b[0]))).map(([group, ls]) => ({ group, heading: true, lines: ls }));
}

/** A section's lines in the order they show: grouped for Stairs, as they are for every other section. */
export function sectionLinesInOrder<T extends { stairCategory?: string | null }>(section: string, lines: T[]): T[] {
  return section === "Stairs" ? stairGroups(lines).flatMap((g) => g.lines) : lines;
}

/**
 * What an option can add (Albert, 2026-10-30: "For stairs, the only options should be from stair items. And the select
 * options should be from the category there"; a hand-typed line and the Private section stay). A Stairs option: the
 * staircase builder, then one button per Stair Item category in work order, a typed line, and Private (stair items
 * or a typed line only). A Flooring option: every work section but Stairs. Lines already on an option are untouched.
 */
export type AddChoice = { label: string; section: string; category?: string; stairsOnly?: true; typed?: true };

export function addChoices(scope: "Flooring" | "Stairs", categories: (string | null | undefined)[], sections: readonly string[]): AddChoice[] {
  if (scope === "Flooring") return sections.filter((s) => s !== "Stairs").map((s) => ({ label: s, section: s }));
  const groups = [...new Set(categories.map((c) => stairGroupOf({ stairCategory: c })).filter((g): g is string => g !== null))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return [
    { label: "Staircase", section: "Stairs" },
    ...groups.map((g) => ({ label: stairGroupLabel(g), section: "Stairs", category: g })),
    { label: "Typed line", section: "Stairs", typed: true as const },
    ...(sections.includes("Private") ? [{ label: "Private", section: "Private", stairsOnly: true as const }] : []),
  ];
}
