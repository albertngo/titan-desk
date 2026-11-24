import type { FileGroup } from "./sheets";

/**
 * Company files, live from OneDrive (Albert, 2026-11-23: "Yes and the WSIB as well. All from the onedrive"; vault
 * `05_decisions/2026-11-23-company-files-live-from-onedrive`). Make "Warranty and Insurance -> Company Files" (5062776)
 * saves each new save of each file in OneDrive `TITAN FILES/Warranty and Insurance` as a PDF on a row of the Company
 * Files table; this offers the newest row of each document. The Project Expectations come the same way, from Terms
 * Versions. Pure: rows in, menu entries out; `live.ts` reads them.
 *
 * A document is told by its file name, so a renewal saved under a new name ("WSIB… Feb 2027.pdf") replaces the old
 * one. A file that matches none is offered under its own name. A row with Hidden ticked, or with no PDF yet (Make
 * attaches it a moment after making the row), is never offered.
 */

export type DocRow = { id: string; fileName: string; modifiedAt: string; pdfUrl: string | null; hidden: boolean };

export type LiveDoc = {
  /** Its address, `/files/<kind>`: a known kind, or `doc-<file name>` for any other file. */
  kind: string;
  title: string;
  note: string;
  group: FileGroup;
  /** When it was last saved, "Nov 23" this year or "Mar 2025" before: what the menu shows in place of a version. */
  chip: string;
  downloadName: string;
  /** Airtable's address for the PDF: expires within hours, fetched only by our server. */
  pdfUrl: string;
};

export const LIVE_GROUP: FileGroup = "Warranty, insurance & terms";

/** The known documents, in menu order, each with the words its file name carries. */
const KNOWN: { kind: string; match: RegExp; title: string; note: string }[] = [
  { kind: "warranty", match: /warrant/i, title: "Installation Labor Warranty", note: "Our 12-month workmanship warranty" },
  { kind: "insurance", match: /commercial/i, title: "Commercial Insurance Policy", note: "Co-operators: liability, property and stock" },
  { kind: "auto", match: /\bauto\b/i, title: "Auto Insurance Policy", note: "Our vehicles' policy" },
  { kind: "wsib", match: /wsib/i, title: "WSIB Clearance Certificate", note: "Proof we're in good standing with WSIB" },
];

export const EXPECTATIONS = { kind: "expectations", title: "Project Expectations", note: "The terms a customer accepts" };

const ORDER = [EXPECTATIONS.kind, ...KNOWN.map((k) => k.kind)];

/** The file name without its extension. */
const bare = (name: string) => name.replace(/\.[A-Za-z0-9]+$/, "").trim();

/** Which document a file is: its known kind, or `doc-<its name>` (letters, digits and dashes only). */
export function kindOf(fileName: string): string {
  const known = KNOWN.find((k) => k.match.test(fileName));
  if (known) return known.kind;
  const slug = bare(fileName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `doc-${slug || "file"}`;
}

/** "Nov 23" when saved this year, "Mar 2025" before, in Toronto: short enough for the chip. Null for anything that isn't a date. */
export function savedOn(iso: string, now: number = Date.now()): string | null {
  const d = new Date(iso);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso) || Number.isNaN(d.getTime())) return null;
  const year = (t: Date) => t.toLocaleDateString("en-US", { timeZone: "America/Toronto", year: "numeric" });
  return year(d) === year(new Date(now))
    ? d.toLocaleDateString("en-US", { timeZone: "America/Toronto", month: "short", day: "numeric" })
    : d.toLocaleDateString("en-US", { timeZone: "America/Toronto", month: "short", year: "numeric" });
}

const torontoDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

function entry(kind: string, title: string, note: string, modifiedAt: string, pdfUrl: string, now: number): LiveDoc | null {
  const chip = savedOn(modifiedAt, now);
  if (!chip) return null;
  return { kind, title, note, group: LIVE_GROUP, chip, pdfUrl, downloadName: `Titan-${title.replace(/[^A-Za-z0-9]+/g, "-").replace(/-+$/, "")}-${torontoDay(modifiedAt)}.pdf` };
}

/** The newest offerable row of each document, the Project Expectations first, then the known ones, then the rest by name. */
export function liveDocs(rows: readonly DocRow[], expectations: { modifiedAt: string; pdfUrl: string } | null, now: number = Date.now()): LiveDoc[] {
  const best = new Map<string, DocRow>();
  for (const r of rows) {
    if (r.hidden || !r.pdfUrl || !savedOn(r.modifiedAt)) continue;
    const kind = kindOf(r.fileName);
    const now = best.get(kind);
    if (!now || r.modifiedAt > now.modifiedAt) best.set(kind, r);
  }
  const out: LiveDoc[] = [];
  if (expectations) {
    const e = entry(EXPECTATIONS.kind, EXPECTATIONS.title, EXPECTATIONS.note, expectations.modifiedAt, expectations.pdfUrl, now);
    if (e) out.push(e);
  }
  for (const [kind, r] of best) {
    const known = KNOWN.find((k) => k.kind === kind);
    const e = entry(kind, known?.title ?? bare(r.fileName), known?.note ?? "From the Warranty and Insurance folder", r.modifiedAt, r.pdfUrl as string, now);
    if (e) out.push(e);
  }
  const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);
  return out.sort((a, b) => rank(a.kind) - rank(b.kind) || a.title.localeCompare(b.title));
}
