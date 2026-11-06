/**
 * Sand steps → only painted risers and stringers (Albert, 2026-11-06: "Logic to not allow for glue and stain
 * stringers when sanding steps! only white stringers or sand and stain stringers. Risers will also only be able to be
 * painted white… It should grey the other option out if one is selected. Some sort of flag should be shown in the
 * selections"). Sanding keeps the existing steps and gives the piano look, so on one option:
 *
 * - sanding the steps rules out stringers skinned in oak (glue and stain) and every riser that is not painted white
 *   (a new riser, a stained one);
 * - either of those on the option rules out sanding the steps.
 *
 * Whichever is on the option first wins: the picker greys the other out, and a line that clashes anyway (added
 * before this rule, or by a site sheet or quick form) is flagged on the line. A flag never stops a save or a send.
 * The site sheet already prices sanding with white risers and stringers (src/lib/sitesheet/options.ts).
 * Pure; tested in tests/sandRule.test.ts.
 */

/** The words under "sand steps" wherever it is picked (2026-11-06: "a description under 'sand steps' as a disclaimer"). */
export const SAND_DISCLAIMER = "Sanding the steps: risers are painted white only, and stringers are painted white or sanded and stained. No oak-skinned (glue and stain) stringers.";

/** What a stair line or item is to this rule. */
export type SandRole = "sand" | "badStringer" | "badRiser" | null;

/* Record ids first, so a rename in Airtable never unhooks the rule (the same ids as src/lib/sitesheet/options.ts). */
const SAND_IDS = new Set(["recnYAG8K2Upy1rQR"]);
const BAD_STRINGER_IDS = new Set(["recDTQT0pVFOWykrn"]);
const BAD_RISER_IDS = new Set(["rec0WAUmD4A8LowMB"]);
const WHITE_RISER_IDS = new Set(["recGmnXAUUEfi4pCp"]);

/** Sanding the existing steps: "Keep Existing Steps (Sand + Stain)", "Task: Sand Steps", "Sand & stain steps". */
const SAND_NAME = /\bsand(?:ing)?\b(?:\s*(?:\+|&|and)\s*stain)?\s+(?:existing\s+)?steps\b|keep\s+existing\s+steps/i;
/** Stringers skinned in oak: "2 Side Oak Skin (Glue and Stain)". */
const BAD_STRINGER_NAME = /oak\s+skin|glue\s*(?:\+|&|and)\s*stain/i;
/** A riser. Only the white-painted one may go with sanding. */
const RISER_NAME = /\briser/i;
const WHITE_NAME = /\bwhite\b/i;

/**
 * The role of a stair item or line, from its record id, else its name and category. Only Stair Items and stair
 * lines are looked at; a Stair Profile's preset line ("Main stairs – Sand & stain") counts as sanding too.
 */
export function sandRole(x: { id?: string | null; name: string; category?: string | null }): SandRole {
  const id = x.id ?? "";
  if (SAND_IDS.has(id)) return "sand";
  if (BAD_STRINGER_IDS.has(id)) return "badStringer";
  if (BAD_RISER_IDS.has(id)) return "badRiser";
  if (WHITE_RISER_IDS.has(id)) return null;
  const name = x.name ?? "";
  if (SAND_NAME.test(name) || /\s[–-]\s*sand\s*&\s*stain$/i.test(name)) return "sand";
  if (BAD_STRINGER_NAME.test(name)) return "badStringer";
  const riser = RISER_NAME.test(name) || x.category?.trim().toLowerCase() === "riser";
  if (riser && !(WHITE_NAME.test(name) && /paint/i.test(name))) return "badRiser";
  return null;
}

type Line = { sourceKind: string; sourceId: string | null; description: string; stairCategory?: string | null; include?: boolean; section?: string | null };

const lineRole = (l: Line): SandRole =>
  l.sourceKind === "stair" || l.sourceKind === "profile" || l.sourceKind === "manual" ? sandRole({ id: l.sourceId, name: l.description, category: l.stairCategory }) : null;

/** What the option's stair lines already hold. Lines left out (Include off) don't count. */
export function sandState(lines: Line[]): { sand: boolean; clash: boolean } {
  const roles = lines.filter((l) => l.include !== false && (l.section ?? "Stairs") === "Stairs").map(lineRole);
  return { sand: roles.includes("sand"), clash: roles.some((r) => r === "badStringer" || r === "badRiser") };
}

/**
 * Why a stair item can't be picked on this option, or null when it can (the picker greys it out and says this).
 */
export function sandBlocks(item: { id?: string | null; name: string; category?: string | null }, lines: Line[]): string | null {
  const role = sandRole(item);
  if (role === null) return null;
  const st = sandState(lines);
  if (role === "sand" && st.clash) return "Not with a new or stained riser, or oak-skinned stringers, on this option: sanding takes white risers and white or sanded stringers.";
  if (role === "badStringer" && st.sand) return "The steps are sanded on this option: stringers are painted white or sanded and stained, never glue and stain.";
  if (role === "badRiser" && st.sand) return "The steps are sanded on this option: risers are painted white only.";
  return null;
}

/** The flag on a line that clashes with the rule on its option, or null. */
export function sandFlag(line: Line, lines: Line[]): string | null {
  if (line.include === false) return null;
  const role = lineRole(line);
  if (role === null) return null;
  const st = sandState(lines);
  if (role === "sand" && st.clash) return "Sand steps take white risers and white or sanded stringers only. Remove the clashing riser or stringer.";
  if (role === "badStringer" && st.sand) return "Not with sanded steps: use painted white or sand & stain stringers.";
  if (role === "badRiser" && st.sand) return "Not with sanded steps: risers are painted white only.";
  return null;
}
