/**
 * Company files (Albert, 2026-11-07: "an option to download the Site Sheets (Flooring, Stairs) and show the
 * latest version… inside the What's new section… Keep the two files separate downloads"; then "add the followup
 * guide in the downloads section": `follow-up-staff-guide-v<N>.pdf`, under Staff guides; 2026-11-23, "upload the folder in
 * Warranty and Insurance, into the Company Files": `installation-labor-warranty-v<N>.pdf`, under Warranty & insurance).
 * A version may carry a minor number (`v1.1`), as the warranty's own footer does; 1.10 beats 1.9.
 * The commercial insurance policy (same day, "its ok upload it", knowing the repo is public) is versioned by the year
 * its term starts, `commercial-insurance-policy-v2026.pdf`, and shows its term ("2026–27") instead of a v number.
 *
 * The printable masters live in `quote/sheets/` as `<kind>-site-sheet-v<N>.pdf` (see its README). The newest
 * version of each kind is the one offered, so dropping in v8 needs no code change. Pure: the file names come
 * in, the list comes out. `next.config.ts` reads the folder at build time and inlines the names as
 * COMPANY_SHEETS; `/files/<kind>` serves the file.
 */

export type SheetKind = "flooring" | "stair" | "followup" | "warranty" | "insurance";

/** The menu's two groups: printable site sheets, and guides for staff (Albert, 2026-11-07: "add the followup guide"). */
export type FileGroup = "Site sheets" | "Staff guides" | "Warranty & insurance";

/** The line under each group's heading. */
export const GROUP_NOTE: Record<FileGroup, string> = {
  "Site sheets": "Latest versions. Print on Letter.",
  "Staff guides": "Latest versions, for training.",
  "Warranty & insurance": "Latest versions, to send a customer or builder.",
};

export const SHEET_KINDS: { kind: SheetKind; title: string; note: string; group: FileGroup; base: string; term?: true }[] = [
  { kind: "flooring", title: "Flooring Site Sheet", note: "One page, on top of the stair sheet", group: "Site sheets", base: "flooring-site-sheet" },
  { kind: "stair", title: "Stair Site Sheet", note: "Two pages, printed as a pair", group: "Site sheets", base: "stair-site-sheet" },
  { kind: "followup", title: "Follow up staff guide", note: "How to work the Follow up page", group: "Staff guides", base: "follow-up-staff-guide" },
  { kind: "warranty", title: "Installation Labor Warranty", note: "Our 12-month workmanship warranty", group: "Warranty & insurance", base: "installation-labor-warranty" },
  { kind: "insurance", title: "Commercial Insurance Policy", note: "Co-operators: liability, property and stock", group: "Warranty & insurance", base: "commercial-insurance-policy", term: true },
];

export type LatestSheet = {
  kind: SheetKind;
  title: string;
  note: string;
  group: FileGroup;
  /** As written in the file name: "7", "1.1". */
  version: string;
  /** What the menu shows for it: "v7", or a policy's term, "2026–27". */
  chip: string;
  /** The file in quote/sheets/. */
  file: string;
  /** What the browser saves it as. */
  downloadName: string;
};

const NAME = /^(flooring-site-sheet|stair-site-sheet|follow-up-staff-guide|installation-labor-warranty|commercial-insurance-policy)-v(\d+)(?:\.(\d+))?\.pdf$/;

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
  return SHEET_KINDS.flatMap(({ kind, title, note, group, term }) => {
    const b = best.get(kind);
    if (!b) return [];
    const start = b.rank[0];
    const chip = term ? `${start}–${String(start + 1).slice(-2)}` : `v${b.version}`;
    const tag = term ? `${start}-${start + 1}` : `v${b.version}`;
    return [{ kind, title, note, group, version: b.version, chip, file: b.file, downloadName: `Titan-${title.replace(/ /g, "-")}-${tag}.pdf` }];
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
