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
  /** Open tracking (2026-10-27): customer opens of this version's link, and whether it was sent since tracking began. */
  openedCount?: number;
  /** When the customer last had the link open (a reload within 30 minutes moves it too). */
  lastOpenedAt?: string | null;
  tracked?: boolean;
  /** The version this one was made from (Quote Versions → Supersedes), and its change number if it is a change. */
  supersedes?: string | null;
  changeNo?: number | null;
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

/** "Change 2 · from v4", "from v8", or null for a version made from nothing (v1, or one made before Supersedes was kept). */
export function fromWords(changeNo: number | null | undefined, fromVersion: number | null | undefined): string | null {
  const parts = [changeNo ? `Change ${changeNo}` : null, fromVersion != null ? `from v${fromVersion}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Where a version came from (2026-10-28), looked up among its own quote's versions: an id from elsewhere shows nothing. */
export function fromLabel(v: Pick<VersionRow, "supersedes" | "changeNo">, versions: Pick<VersionRow, "id" | "version">[]): string | null {
  const src = v.supersedes ? versions.find((x) => x.id === v.supersedes) : undefined;
  return fromWords(v.changeNo, src?.version);
}

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

// ---------- filters ----------

export const QUOTE_FILTERS = [
  { key: "all", label: "All" },
  { key: "linking", label: "Needs linking" },
  { key: "draft", label: "Drafts" },
  { key: "sent", label: "Sent" },
  { key: "accepted", label: "Accepted" },
  { key: "won", label: "Won" },
] as const;
export type QuoteFilter = (typeof QUOTE_FILTERS)[number]["key"];

/**
 * Which quick filter a quote falls under. Drafts and Sent go by its newest version. Since 2026-10-27
 * Accepted is a quote the customer said yes to whose Notion project has no PP number yet, and Won one
 * that has it; a change sent after the yes keeps the quote under those, not under Sent.
 */
export function inFilter(g: QuoteGroup, f: QuoteFilter): boolean {
  const s = g.versions[0]?.status ?? null;
  const accepted = g.versions.some((v) => v.status === "Accepted" || v.status === "Won");
  switch (f) {
    case "all":
      return true;
    case "linking":
      return g.linkStatus === "Needs linking";
    case "draft":
      return s === "Draft";
    case "sent":
      return s === "Sent" && !accepted && !g.projectNumber;
    case "accepted":
      return accepted && !g.projectNumber;
    case "won":
      return Boolean(g.projectNumber);
  }
}

const TZ = "America/Toronto";
/** Calendar days from `then` to `now`, in Toronto time. */
const daysBetween = (then: Date, now: Date) => {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
  return Math.round((Date.parse(day(now)) - Date.parse(day(then))) / 86_400_000);
};
const dateWords = (then: Date, days: number) =>
  then.toLocaleDateString("en-CA", { timeZone: TZ, month: "short", day: "numeric", ...(days > 300 ? { year: "numeric" } : {}) }).replace(/\./g, "");

/** "Today", "Yesterday", "3 days ago", then a date: when a quote last had a new version, in Toronto time. */
export function ago(iso: string, now: Date): string {
  const then = new Date(iso);
  const days = daysBetween(then, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return dateWords(then, days);
}

/** When the customer last opened a version (2026-10-27): "today 2:14 pm", "yesterday 9:05 am", then the date, in Toronto time. */
export function openedOn(iso: string, now: Date): string {
  const then = new Date(iso);
  const days = daysBetween(then, now);
  if (days > 1) return dateWords(then, days);
  const time = then
    .toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s*a\.?m\.?/i, " am")
    .replace(/\s*p\.?m\.?/i, " pm");
  return `${days <= 0 ? "today" : "yesterday"} ${time}`;
}
