/**
 * The All quotes page (Albert, 2026-10-15): one row per quote, its versions folded underneath, and
 * a search over the customer. Pure, no I/O: load.ts reads Airtable, this shapes and filters it.
 */

export type VersionRow = {
  id: string;
  label: string | null;
  version: number | null;
  status: string | null;
  basis: string | null;
  optionCount: number;
  createdTime: string;
};

export type QuoteHead = {
  /** The Quotes record, or null for a version that belongs to no quote. */
  quoteRecordId: string | null;
  quoteNumber: string | null;
  customerName: string | null;
  siteCity: string | null;
  phone: string | null;
  email: string | null;
  projectNumber: string | null;
  linkStatus: string | null;
  addressStatus: string | null;
};

export type QuoteGroup = QuoteHead & {
  /** Newest version first. The first one is what opening the quote shows. */
  versions: VersionRow[];
  /** When its newest version was made: groups sort on it, newest first. */
  latestAt: string;
};

const byNewest = (a: VersionRow, b: VersionRow) => (b.version ?? 0) - (a.version ?? 0) || b.createdTime.localeCompare(a.createdTime);

/** Versions grouped under their quote. A version with no quote is a group of its own. */
export function groupVersions(versions: (VersionRow & { quoteRecordId: string | null })[], heads: Map<string, QuoteHead>): QuoteGroup[] {
  const groups = new Map<string, QuoteGroup>();
  const blank = (id: string | null): QuoteHead => ({ quoteRecordId: id, quoteNumber: null, customerName: null, siteCity: null, phone: null, email: null, projectNumber: null, linkStatus: null, addressStatus: null });
  for (const { quoteRecordId, ...v } of versions) {
    const key = quoteRecordId ?? `version:${v.id}`;
    const g = groups.get(key) ?? { ...(quoteRecordId ? (heads.get(quoteRecordId) ?? blank(quoteRecordId)) : blank(null)), versions: [], latestAt: "" };
    g.versions.push(v);
    if (v.createdTime > g.latestAt) g.latestAt = v.createdTime;
    groups.set(key, g);
  }
  for (const g of groups.values()) g.versions.sort(byNewest);
  return [...groups.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);

/**
 * Does the group match what was typed? Every word must appear somewhere: the customer, the quote
 * or project number, the city, the email, a version label, or the phone (digits only, so
 * "416 555" finds +14165550199).
 */
export function matchesSearch(g: QuoteGroup, query: string): boolean {
  const q = words(query);
  if (q.length === 0) return true;
  const hay = [g.customerName, g.quoteNumber, g.projectNumber, g.siteCity, g.email, ...g.versions.map((v) => v.label)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  const phone = (g.phone ?? "").replace(/\D/g, "");
  return q.every((w) => {
    if (hay.includes(w)) return true;
    // A word of digits (and phone punctuation) is looked for in the phone number.
    const d = w.replace(/\D/g, "");
    return /^[\d\-().+]+$/.test(w) && d.length >= 3 && phone.includes(d);
  });
}
