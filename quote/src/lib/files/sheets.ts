/**
 * Company files (Albert, 2026-11-07: "an option to download the Site Sheets (Flooring, Stairs) and show the
 * latest version… inside the What's new section… Keep the two files separate downloads"; then "add the followup
 * guide in the downloads section": `follow-up-staff-guide-v<N>.pdf`, under Staff guides). A version may carry a minor
 * number (`v1.1`); 1.10 beats 1.9. The warranty, insurance and Project Expectations are not committed here: since
 * 2026-11-23 they come live from OneDrive (`docs.ts`, `live.ts`).
 *
 * The printable masters live in `quote/sheets/` as `<kind>-site-sheet-v<N>.pdf` (see its README). The newest
 * version of each kind is the one offered, so dropping in v8 needs no code change. Pure: the file names come
 * in, the list comes out. `next.config.ts` reads the folder at build time and inlines the names as
 * COMPANY_SHEETS; `/files/<kind>` serves the file.
 */

export type SheetKind = "flooring" | "stair" | "followup";

/** The menu's groups: printable site sheets, guides for staff, and the live documents from OneDrive (2026-11-23). */
export type FileGroup = "Site sheets" | "Staff guides" | "Warranty, insurance & terms";

/** The line under each group's heading. */
export const GROUP_NOTE: Record<FileGroup, string> = {
  "Site sheets": "Latest versions. Print on Letter.",
  "Staff guides": "Latest versions, for training.",
  "Warranty, insurance & terms": "Latest from OneDrive, to send a customer or builder.",
};

export const SHEET_KINDS: { kind: SheetKind; title: string; note: string; group: FileGroup; base: string }[] = [
  { kind: "flooring", title: "Flooring Site Sheet", note: "One page, on top of the stair sheet", group: "Site sheets", base: "flooring-site-sheet" },
  { kind: "stair", title: "Stair Site Sheet", note: "Two pages, printed as a pair", group: "Site sheets", base: "stair-site-sheet" },
  { kind: "followup", title: "Follow up staff guide", note: "How to work the Follow up page", group: "Staff guides", base: "follow-up-staff-guide" },
];

/** One line of the Company files menu, whether a committed sheet or a live document: downloaded at `/files/<kind>`. */
export type MenuFile = { kind: string; title: string; note: string; group: FileGroup; chip: string; downloadName: string };

export type LatestSheet = {
  kind: SheetKind;
  title: string;
  note: string;
  group: FileGroup;
  /** As written in the file name: "7", "1.1". */
  version: string;
  /** What the menu shows for it: "v7". */
  chip: string;
  /** The file in quote/sheets/. */
  file: string;
  /** What the browser saves it as. */
  downloadName: string;
};

const NAME = /^(flooring-site-sheet|stair-site-sheet|follow-up-staff-guide)-v(\d+)(?:\.(\d+))?\.pdf$/;

/** Major first, then minor: v1.10 is newer than v1.9, and v2 newer than v1.9. */
const newer = (a: [number, number], b: [number, number]) => a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1];

/** The newest PDF of each kind among `files`, in SHEET_KINDS order; a kind with none is left out. */
export function latestSheets(files: readonly string[]): LatestSheet[] {
  const best = new Map<SheetKind, { rank: [number, number]; version: string; file: string }>();
  for (const file of files) {
    const m = NAME.exec(file);
    if (!m) continue;
    const kind = SHEET_KINDS.find((k) => k.base === m[1])?.kind;
    if (!kind) continue;
    const rank: [number, number] = [Number(m[2]), Number(m[3] ?? 0)];
    const version = m[3] === undefined ? m[2] : `${m[2]}.${m[3]}`;
    const now = best.get(kind);
    if (!now || newer(rank, now.rank)) best.set(kind, { rank, version, file });
  }
  return SHEET_KINDS.flatMap(({ kind, title, note, group }) => {
    const b = best.get(kind);
    if (!b) return [];
    return [{ kind, title, note, group, version: b.version, chip: `v${b.version}`, file: b.file, downloadName: `Titan-${title.replace(/ /g, "-")}-v${b.version}.pdf` }];
  });
}

/** The sheets this build carries (COMPANY_SHEETS, inlined by next.config.ts). Unreadable reads as none. */
export function companySheets(): LatestSheet[] {
  try {
    const names: unknown = JSON.parse(process.env.COMPANY_SHEETS ?? "[]");
    return Array.isArray(names) ? latestSheets(names.filter((n): n is string => typeof n === "string")) : [];
  } catch {
    return [];
  }
}

/** The one sheet `/files/<kind>` may serve, or null for anything else (never a path from the request). */
export function sheetFor(kind: string): LatestSheet | null {
  return companySheets().find((s) => s.kind === kind) ?? null;
}
