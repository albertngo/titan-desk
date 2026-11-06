import { topChoices, waterfall, type QuickChoice, type QuickGroup } from "@/lib/quick/plan";
import { lineFromEntry, type CardContractor, type CardEntry, type EditorLine, type PricedMaterial } from "./model";
import type { ServiceLevel } from "@/lib/pricing/service";

/**
 * The quick form's waterfall in the editor's Add search (Albert, 2026-11-06: "can the selection inside the editor
 * search also do the same type of 'waterfall selection' for the Nail -> Glue selections. Never a 'default'"). Pure.
 *
 * A family is the Quick Quote Choices sharing a Path's first part ("Solid Hardwood T&G"). In the editor nothing is
 * picked for you: the method row starts empty, the glue row starts empty, and Add waits for both. The lines are
 * made the editor's own way (`lineFromEntry()`, at the option's crew and service level), from the Rate Card rows the
 * picked choice links, with the picked glue. Each starts at quantity 1, like every line added in the editor.
 */

type RateEntry = Extract<CardEntry, { kind: "rate" }>;

/** Which quick-form group's families a section offers. */
export const SECTION_GROUP: Partial<Record<string, QuickGroup>> = { Install: "Install" };

/** A family on the search: its head, and every choice under it. */
export type Family = { key: string; label: string; members: QuickChoice[] };

/** The families a section offers whose name matches every word typed (all of them for an empty search). */
export function familiesFor(choices: QuickChoice[], section: string, q = ""): Family[] {
  const group = SECTION_GROUP[section];
  if (!group) return [];
  const inGroup = choices.filter((c) => c.group === group);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return topChoices(inGroup)
    .filter((t) => t.key.startsWith("path:") && t.members.length > 1)
    .map((t) => ({ key: t.key, label: t.label, members: t.members.map((id) => inGroup.find((c) => c.id === id)!).filter(Boolean) }))
    .filter((f) => words.every((w) => [f.label, ...f.members.map((m) => m.label)].join(" ").toLowerCase().includes(w)));
}

/** The Rate Card rows a section's families are built from: left off its plain search, so the family is the one way in. */
export function familyRows(choices: QuickChoice[], section: string): Set<string> {
  return new Set(familiesFor(choices, section).flatMap((f) => f.members.flatMap((c) => c.parts.filter((p) => p.kind === "rate").map((p) => p.recordId))));
}

/** The method row: one chip per second part of the Path, none picked until the person picks one. */
export function familyMethods(f: Family, pickedId: string | null): { label: string; choiceId: string; on: boolean }[] {
  const first = f.members[0];
  if (!first) return [];
  const levels = waterfall(f.members, pickedId ?? first.id);
  return (levels[0]?.options ?? []).map((o) => ({ ...o, on: pickedId !== null && o.on }));
}

/** The card entry and contractor a quick part becomes: the option's crew when it has a rate for the work, else the part's own row. */
function placed(recordId: string, catalogue: CardEntry[], crew: string | null): { entry: RateEntry; c: CardContractor } | null {
  for (const e of catalogue) {
    if (e.kind !== "rate") continue;
    const own = e.contractors.find((x) => x.recordId === recordId);
    if (!own) continue;
    return { entry: e, c: (crew ? e.contractors.find((x) => x.name === crew) : undefined) ?? own };
  }
  return null;
}

/**
 * The glue question for a picked choice: the first part whose row (at the contractor the line goes to) has a Material
 * Group, and that group's choices, cheapest first. Null when the choice takes no glue.
 */
export function familyGlue(choice: QuickChoice | undefined, catalogue: CardEntry[], crew: string | null): { label: string; choices: PricedMaterial[] } | null {
  for (const p of choice?.parts ?? []) {
    if (p.kind !== "rate") continue;
    const m = placed(p.recordId, catalogue, crew)?.c.material;
    if (m && m.choices.length > 0) return { label: /glue/i.test(m.default.group) ? "Type of glue" : m.default.group, choices: m.choices };
  }
  return null;
}

/**
 * The lines a family pick adds, or why it can't yet: a method must be picked, and a glue when the method takes one.
 * Never a default (2026-11-06). A part whose Rate Card row is no longer on the card is named, never guessed.
 */
export function familyLines(
  choice: QuickChoice | undefined,
  materialId: string | null,
  catalogue: CardEntry[],
  section: string,
  crew: string | null,
  level: ServiceLevel,
): { lines: EditorLine[]; missing: string | null } {
  if (!choice) return { lines: [], missing: "Pick how it's installed." };
  const glue = familyGlue(choice, catalogue, crew);
  if (glue && !glue.choices.some((m) => m.id === materialId)) return { lines: [], missing: `Pick the ${glue.label.toLowerCase()}.` };
  const lines: EditorLine[] = [];
  for (const p of choice.parts) {
    if (p.kind !== "rate") return { lines: [], missing: `${choice.label} links a Stair Item, which the editor adds from Stairs.` };
    const at = placed(p.recordId, catalogue, crew);
    if (!at) return { lines: [], missing: `${p.description} is no longer on the rate card.` };
    lines.push(lineFromEntry(at.entry, section, at.c.name, level, at.c.material ? materialId : null));
  }
  return { lines, missing: null };
}
