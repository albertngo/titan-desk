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
  /** Front page (2026-11-07): when it was sent, the good-until date, and its money. */
  sentAt?: string | null;
  validUntil?: string | null;
  acceptedOptionIds?: string[];
  acceptedAt?: string | null;
  options?: OptionMoney[];
  createdTime: string;
};

/** One option's customer total, as the list needs it. */
export type OptionMoney = {
  id: string;
  /** Quote Options → Total (Airtable's formula, HST in when charged). Null when Airtable has none. */
  total: number | null;
  recommended: boolean;
  /** Kept on the quote, left off what the customer is sent: never counted. */
  notOffered: boolean;
  /** Main floor / Upstairs / … and Flooring / Stairs: the customer takes one option per part. */
  part: string | null;
  scope: string | null;
  sortOrder: number | null;
};

/** A version's money, as the Value column reads it. */
export type VersionMoney = { status: string | null; options?: OptionMoney[]; acceptedOptionIds?: string[]; acceptedAt?: string | null };



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
  /** Quotes → Quote Description (2026-11-03): staff's short label for this quote, e.g. "Unit 1204 · kitchen + hall". */
  description?: string | null;
  /** Quotes → Contract's total with HST, when the quote has a contract (2026-11-07, the Value column). */
  contractTotal?: number | null;
};

/** The longest Quote Description kept: a label for the list, not the project notes. */
export const DESCRIPTION_MAX = 120;

/**
 * A Quote Description as it is stored (2026-11-03): one line, spaces collapsed, at most DESCRIPTION_MAX
 * characters, and null when nothing is left, so clearing the box clears the field.
 */
export function cleanDescription(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_MAX).trim();
  return s || null;
}

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

/**
 * The By origin view (2026-10-28): each version under the one it was made from, oldest first, with
 * its depth. A version whose source is not in the list (v1, or made before Supersedes was kept) is
 * a root. Every version appears exactly once, even if the links ever loop.
 */
export function versionTree<V extends Pick<VersionRow, "id" | "version" | "supersedes" | "createdTime">>(versions: V[]): { v: V; depth: number }[] {
  const ids = new Set(versions.map((v) => v.id));
  const byOldest = (a: V, b: V) => (a.version ?? 0) - (b.version ?? 0) || a.createdTime.localeCompare(b.createdTime);
  const kids = new Map<string, V[]>();
  for (const v of versions) if (v.supersedes && ids.has(v.supersedes) && v.supersedes !== v.id) kids.set(v.supersedes, [...(kids.get(v.supersedes) ?? []), v]);
  const out: { v: V; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (v: V, depth: number) => {
    if (seen.has(v.id)) return;
    seen.add(v.id);
    out.push({ v, depth });
    for (const k of (kids.get(v.id) ?? []).sort(byOldest)) walk(k, depth + 1);
  };
  const isRoot = (v: V) => !v.supersedes || !ids.has(v.supersedes) || v.supersedes === v.id;
  for (const v of [...versions].sort(byOldest)) if (isRoot(v)) walk(v, 0);
  for (const v of [...versions].sort(byOldest)) walk(v, 0); // a loop has no root: show it flat rather than lose it
  return out;
}

/** Statuses of a version that went out to the customer, so its link can have been opened. */
const WENT_OUT = new Set(["Sent", "Superseded", "Accepted", "Won"]);

/**
 * The version the Last opened column reports (Albert, 2026-10-31: "the last opened should still show
 * the previous quote's details even if there's a new draft"): the newest version that went out to the
 * customer, else one with opens recorded, else none. A draft is never it: nobody has its link.
 * `versions` is newest first, as groupVersions leaves it.
 */
export function lastSentVersion<V extends Pick<VersionRow, "status" | "openedCount">>(versions: V[]): V | null {
  return versions.find((v) => WENT_OUT.has(v.status ?? "")) ?? versions.find((v) => (v.openedCount ?? 0) > 0) ?? null;
}

/** "1 open", "3 opens": always the count, so one open reads as plainly as several. */
export const opensWords = (n: number) => (n === 1 ? "1 open" : `${n} opens`);

const byNewest = (a: VersionRow, b: VersionRow) => (b.version ?? 0) - (a.version ?? 0) || b.createdTime.localeCompare(a.createdTime);

/** Versions grouped under their quote. A version with no quote is a group of its own. */
export function groupVersions(versions: (VersionRow & { quoteRecordId: string | null })[], heads: Map<string, QuoteHead>): QuoteGroup[] {
  const groups = new Map<string, QuoteGroup>();
  const blank = (id: string | null): QuoteHead => ({ quoteRecordId: id, quoteNumber: null, customerName: null, siteCity: null, phone: null, email: null, projectNumber: null, linkStatus: null, addressStatus: null, description: null });
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
 * or project number, the city, the email, the quote's description, a version label, or the phone (digits only, so
 * "416 555" finds +14165550199).
 */
export function matchesSearch(g: QuoteGroup, query: string): boolean {
  const q = words(query);
  if (q.length === 0) return true;
  const hay = [g.customerName, g.quoteNumber, g.projectNumber, g.siteCity, g.email, g.description, ...g.versions.map((v) => v.label)]
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
  { key: "followup", label: "Follow up" },
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
export function inFilter(g: QuoteGroup, f: QuoteFilter, now: Date = new Date()): boolean {
  const s = g.versions[0]?.status ?? null;
  const accepted = g.versions.some((v) => v.status === "Accepted" || v.status === "Won");
  switch (f) {
    case "all":
      return true;
    case "followup":
      return followUpReasons(g, now).length > 0;
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

// ---------- value (2026-11-07) ----------

const round2 = (n: number) => Math.round(n * 100) / 100;
const byOrder = (a: OptionMoney, b: OptionMoney) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

export type QuoteValue =
  /** What the customer agreed to: the contract's total, else the accepted options' totals. */
  | { kind: "contract"; total: number }
  /**
   * The current version's offer. Options are grouped by part (then scope) because a customer takes one
   * of each; `low`/`high` add the cheapest/dearest of each group, `likely` the recommended one (else the
   * cheapest). A version whose options set neither part nor scope is one group, so a floor-and-stairs
   * quote made that way reads as a range rather than a sum: an estimate for the list, not a price.
   */
  | { kind: "quote"; low: number; high: number; likely: number; recommended: boolean; options: number };

/** The value of an offer: null when nothing offered has a total (the old A/B/C format, an empty draft). */
export function offerValue(options: OptionMoney[] | undefined): Extract<QuoteValue, { kind: "quote" }> | null {
  const offered = (options ?? []).filter((o) => !o.notOffered && typeof o.total === "number" && Number.isFinite(o.total));
  if (offered.length === 0) return null;
  const parts = new Map<string, OptionMoney[]>();
  for (const o of offered) {
    const k = o.part ?? o.scope ?? "";
    parts.set(k, [...(parts.get(k) ?? []), o]);
  }
  let low = 0, high = 0, likely = 0, recommended = true;
  for (const os of parts.values()) {
    const totals = os.map((o) => o.total as number);
    const min = Math.min(...totals);
    low += min;
    high += Math.max(...totals);
    const rec = [...os].sort(byOrder).find((o) => o.recommended);
    likely += rec ? (rec.total as number) : min;
    // One option in a part needs no recommending; several without a star is a real choice.
    if (!rec && os.length > 1) recommended = false;
  }
  return { kind: "quote", low: round2(low), high: round2(high), likely: round2(likely), recommended, options: offered.length };
}

const isAccepted = (g: Pick<QuoteGroup, "projectNumber"> & { versions: VersionMoney[] }) =>
  Boolean(g.projectNumber) || g.versions.some((v) => v.status === "Accepted" || v.status === "Won");

/**
 * What a quote is worth. An accepted or won quote is its contract (Quotes → Contract's total), else the
 * accepted options on the newest version that records any; anything else is the current version's offer.
 */
export function quoteValue(g: Pick<QuoteGroup, "projectNumber"> & { contractTotal?: number | null; versions: VersionMoney[] }): QuoteValue | null {
  if (isAccepted(g)) {
    if (typeof g.contractTotal === "number" && Number.isFinite(g.contractTotal)) return { kind: "contract", total: round2(g.contractTotal) };
    const v = g.versions.find((x) => (x.acceptedOptionIds ?? []).length > 0);
    if (v) {
      const picked = (v.options ?? []).filter((o) => v.acceptedOptionIds!.includes(o.id));
      if (picked.length === v.acceptedOptionIds!.length && picked.every((o) => typeof o.total === "number")) {
        return { kind: "contract", total: round2(picked.reduce((a, o) => a + (o.total as number), 0)) };
      }
    }
  }
  return offerValue(g.versions[0]?.options);
}

/** The one number a value adds to a total: the contract, else the likely offer. */
export const valueAmount = (v: QuoteValue | null): number | null => (v ? (v.kind === "contract" ? v.total : v.likely) : null);

// ---------- follow up ----------

/** When a sent quote wants a nudge. Named so they are easy to find and change. */
export const FOLLOW_UP = {
  /** Sent this many days ago and the customer has not opened the link. */
  unopenedDays: 2,
  /** Opened this many times and no yes: they are weighing it. */
  manyOpens: 3,
  /** The quote's Valid Until is this many days away, or past. */
  expiringDays: 7,
} as const;

export type FollowUpReason =
  | { kind: "unopened"; days: number }
  | { kind: "opened"; opens: number }
  | { kind: "expiring"; days: number };

/** A date or a date-time as its Toronto calendar day, "YYYY-MM-DD". */
export function torontoDay(s: string | Date): string {
  if (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date(s).toLocaleDateString("en-CA", { timeZone: TZ });
}
/** Whole calendar days from `a` to `b` (Toronto days). */
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** The follow-up fields a version carries. */
export type VersionFollow = {
  status: string | null;
  openedCount?: number;
  tracked?: boolean;
  sentAt?: string | null;
  validUntil?: string | null;
};

/**
 * Why a quote wants following up, or [] when it doesn't. Only a quote whose newest sent version is still
 * Sent (no yes, no project, not lost or expired) counts. A draft being worked on above it does not stop
 * it: the customer still has the sent one's link.
 */
export function followUpReasons(g: Pick<QuoteGroup, "projectNumber"> & { versions: VersionFollow[] }, now: Date): FollowUpReason[] {
  if (g.projectNumber || g.versions.some((v) => v.status === "Accepted" || v.status === "Won")) return [];
  const current = g.versions[0]?.status;
  if (current === "Lost" || current === "Expired") return [];
  const v = lastSentVersion(g.versions);
  if (!v || v.status !== "Sent") return [];
  const today = torontoDay(now);
  const out: FollowUpReason[] = [];
  const opens = v.openedCount ?? 0;
  if (v.tracked && opens === 0 && v.sentAt) {
    const days = dayDiff(torontoDay(v.sentAt), today);
    if (days >= FOLLOW_UP.unopenedDays) out.push({ kind: "unopened", days });
  }
  if (opens >= FOLLOW_UP.manyOpens) out.push({ kind: "opened", opens });
  if (v.validUntil) {
    const days = dayDiff(today, torontoDay(v.validUntil));
    if (days <= FOLLOW_UP.expiringDays) out.push({ kind: "expiring", days });
  }
  return out;
}

/** A reason as a chip: its words and how loud it is. */
export function reasonWords(r: FollowUpReason): { text: string; tone: "warn" | "bad" | "accent" } {
  switch (r.kind) {
    case "unopened":
      return { text: `Not opened in ${r.days} days`, tone: "warn" };
    case "opened":
      return { text: `Opened ${r.opens}×, no answer`, tone: "accent" };
    case "expiring":
      if (r.days < 0) return { text: `Expired ${-r.days === 1 ? "yesterday" : `${-r.days} days ago`}`, tone: "bad" };
      if (r.days === 0) return { text: "Expires today", tone: "bad" };
      return { text: `Expires in ${r.days === 1 ? "1 day" : `${r.days} days`}`, tone: "warn" };
  }
}

// ---------- sorting ----------

/**
 * Sortable columns (2026-11-05, Albert: "Can we have the columns sortable"). One per column heading on
 * All quotes. Created, newest first, is the default and what the page always opened on.
 */
export const QUOTE_SORTS = [
  { key: "customer", label: "Customer", first: "asc" },
  { key: "quote", label: "Quote", first: "asc" },
  { key: "version", label: "Current version", first: "asc" },
  { key: "value", label: "Value", first: "desc" },
  { key: "opened", label: "Last opened", first: "desc" },
  { key: "attention", label: "Attention", first: "desc" },
  { key: "created", label: "Created", first: "desc" },
] as const;
export type QuoteSortKey = (typeof QUOTE_SORTS)[number]["key"];
export type SortDir = "asc" | "desc";
export type QuoteSort = { key: QuoteSortKey; dir: SortDir };
export const DEFAULT_SORT: QuoteSort = { key: "created", dir: "desc" };

export const isQuoteSort = (v: unknown): v is QuoteSort =>
  typeof v === "object" && v !== null && QUOTE_SORTS.some((s) => s.key === (v as QuoteSort).key) && ((v as QuoteSort).dir === "asc" || (v as QuoteSort).dir === "desc");

/** Clicking a heading: a new column starts in its natural direction, the same column flips. */
export function nextSort(cur: QuoteSort, key: QuoteSortKey): QuoteSort {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: QUOTE_SORTS.find((s) => s.key === key)!.first };
}

/** Current version sorts along the quote's life: drafts, then out with the customer, then the outcome. */
const STATUS_RANK: Record<string, number> = { Draft: 0, Sent: 1, Accepted: 2, Won: 3, Lost: 4, Expired: 5, Superseded: 6 };

/** What the Attention column shows, weighted: Needs linking is the one that blocks work. */
export const attentionScore = (g: Pick<QuoteHead, "linkStatus" | "addressStatus">) =>
  (g.linkStatus === "Needs linking" ? 2 : 0) + (g.addressStatus === "Unconfirmed" || g.addressStatus === "No address" ? 1 : 0);

type SortValue = string | number | null;
const collator = new Intl.Collator("en-CA", { numeric: true, sensitivity: "base" });

function sortValue(g: QuoteGroup, key: QuoteSortKey): SortValue {
  switch (key) {
    case "customer":
      return g.customerName?.trim() || null;
    case "quote":
      return g.quoteNumber?.trim() || null;
    case "version": {
      const s = g.versions[0]?.status;
      return s == null ? null : (STATUS_RANK[s] ?? 7) * 10_000 + (g.versions[0]?.version ?? 0);
    }
    case "value":
      return valueAmount(quoteValue(g));
    case "opened": {
      const v = lastSentVersion(g.versions);
      return v && (v.openedCount ?? 0) > 0 && v.lastOpenedAt ? v.lastOpenedAt : null;
    }
    case "attention":
      return attentionScore(g) || null;
    case "created":
      return g.latestAt || null;
  }
}

/**
 * The list in the chosen order. Blanks (no customer, no number, never opened, nothing to look at) go
 * last whichever way the column runs, and ties keep the newest quote first. Never mutates `groups`.
 */
export function sortGroups(groups: QuoteGroup[], sort: QuoteSort): QuoteGroup[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const keyed = groups.map((g) => ({ g, v: sortValue(g, sort.key) }));
  keyed.sort((a, b) => {
    if (a.v !== b.v) {
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : collator.compare(String(a.v), String(b.v));
      if (c !== 0) return sign * c;
    }
    return b.g.latestAt.localeCompare(a.g.latestAt);
  });
  return keyed.map((k) => k.g);
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
