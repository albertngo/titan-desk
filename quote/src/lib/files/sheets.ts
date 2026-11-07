/**
 * Company files (Albert, 2026-11-07: "an option to download the Site Sheets (Flooring, Stairs) and show the
 * latest version… inside the What's new section… Keep the two files separate downloads"; then "add the followup
 * guide in the downloads section": `follow-up-staff-guide-v<N>.pdf`, under Staff guides).
 *
 * The printable masters live in `quote/sheets/` as `<kind>-site-sheet-v<N>.pdf` (see its README). The newest
 * version of each kind is the one offered, so dropping in v8 needs no code change. Pure: the file names come
 * in, the list comes out. `next.config.ts` reads the folder at build time and inlines the names as
 * COMPANY_SHEETS; `/files/<kind>` serves the file.
 */

export type SheetKind = "flooring" | "stair" | "followup";

/** The menu's two groups: printable site sheets, and guides for staff (Albert, 2026-11-07: "add the followup guide"). */
export type FileGroup = "Site sheets" | "Staff guides";

export const SHEET_KINDS: { kind: SheetKind; title: string; note: string; group: FileGroup; base: string }[] = [
  { kind: "flooring", title: "Flooring Site Sheet", note: "One page, on top of the stair sheet", group: "Site sheets", base: "flooring-site-sheet" },
  { kind: "stair", title: "Stair Site Sheet", note: "Two pages, printed as a pair", group: "Site sheets", base: "stair-site-sheet" },
  { kind: "followup", title: "Follow up staff guide", note: "How to work the Follow up page", group: "Staff guides", base: "follow-up-staff-guide" },
];

export type LatestSheet = {
  kind: SheetKind;
  title: string;
  note: string;
  group: FileGroup;
  version: number;
  /** The file in quote/sheets/. */
  file: string;
  /** What the browser saves it as. */
  downloadName: string;
};

const NAME = /^(flooring-site-sheet|stair-site-sheet|follow-up-staff-guide)-v(\d+)\.pdf$/;

/** The newest PDF of each kind among `files`, in SHEET_KINDS order; a kind with none is left out. */
export function latestSheets(files: readonly string[]): LatestSheet[] {
  const best = new Map<SheetKind, { version: number; file: string }>();
  for (const file of files) {
    const m = NAME.exec(file);
    if (!m) continue;
    const kind = SHEET_KINDS.find((k) => k.base === m[1])?.kind;
    if (!kind) continue;
    const version = Number(m[2]);
    const now = best.get(kind);
    if (!now || version > now.version) best.set(kind, { version, file });
  }
  return SHEET_KINDS.flatMap(({ kind, title, note, group }) => {
    const b = best.get(kind);
    if (!b) return [];
    return [{ kind, title, note, group, version: b.version, file: b.file, downloadName: `Titan-${title.replace(/ /g, "-")}-v${b.version}.pdf` }];
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
