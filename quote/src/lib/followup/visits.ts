/**
 * "Visited, no quote yet" (Albert, 2026-11-07: "does this also give a notification if there has been a visit; and no post
 * visit quotes have been made?"; then "okay build and merge", with no GHL note). Pure: the two booking calendars' recent
 * appointments that went ahead, against the customers' quotes, as the visits still waiting on a measured quote. Read in
 * src/lib/quotes/followup.ts; tested in tests/followup.test.ts.
 */

/** How far back a finished visit is looked for. Older ones are the quote's own Follow up row or long gone. */
export const VISIT_LOOKBACK_DAYS = 14;

export type CalendarEvent = { id: string; contactId: string | null; calendarId: string | null; start: string | null; status: string | null; title: string | null; assignedUserId: string | null };

/** What the app knows about one GHL contact's quotes. */
export type ContactQuotes = {
  quoteRecordId: string;
  quoteNumber: string | null;
  customer: string | null;
  /** The version a click should open: the newest one. */
  versionId: string | null;
  /** Days a measured version went out (Sent At), any status after. */
  measuredSent: string[];
  /** Accepted, won, or marked lost: nothing more is owed. */
  closed: boolean;
};

export type VisitNoQuote = {
  contactId: string;
  day: string;
  where: "in-home" | "in store";
  /** Who was booked on it (GHL's assigned user), by first name when known. */
  visitorId: string | null;
  name: string | null;
  quote: Omit<ContactQuotes, "measuredSent" | "closed"> | null;
  /** Days since the visit. */
  days: number;
};

const MISSED = /cancel|no.?show|invalid/i;

/**
 * Every contact whose latest in-home or in-store visit in the last VISIT_LOOKBACK_DAYS went ahead (started in the past,
 * not cancelled or a no-show) and has no measured quote sent on or after that day, and no quote already accepted, won
 * or lost. Newest visit first.
 */
export function visitsWithoutQuote(events: CalendarEvent[], quotesOf: Map<string, ContactQuotes[]>, now: Date, day: (s: string | Date) => string, calendars: { inHome: string; inStore: string }): VisitNoQuote[] {
  const today = day(now);
  const from = new Date(now.getTime() - VISIT_LOOKBACK_DAYS * 86_400_000).getTime();
  const latest = new Map<string, CalendarEvent>();
  for (const e of events) {
    if (!e.contactId || !e.start || MISSED.test(e.status ?? "")) continue;
    if (e.calendarId !== calendars.inHome && e.calendarId !== calendars.inStore) continue;
    const t = Date.parse(e.start);
    if (Number.isNaN(t) || t >= now.getTime() || t < from) continue;
    const had = latest.get(e.contactId);
    if (!had || Date.parse(had.start as string) < t) latest.set(e.contactId, e);
  }
  const out: VisitNoQuote[] = [];
  for (const [contactId, e] of latest) {
    const visitDay = day(e.start as string);
    const qs = quotesOf.get(contactId) ?? [];
    if (qs.some((q) => q.closed)) continue;
    if (qs.some((q) => q.measuredSent.some((d) => d >= visitDay))) continue;
    // The newest quote is the one the measured version belongs on.
    const q = qs[0] ?? null;
    out.push({
      contactId,
      day: visitDay,
      where: e.calendarId === calendars.inHome ? "in-home" : "in store",
      visitorId: e.assignedUserId,
      name: q?.customer ?? cleanTitle(e.title),
      quote: q ? { quoteRecordId: q.quoteRecordId, quoteNumber: q.quoteNumber, customer: q.customer, versionId: q.versionId } : null,
      days: Math.round((Date.parse(today) - Date.parse(visitDay)) / 86_400_000),
    });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day));
}

/** An appointment title as a name: GHL titles often read "In-home measure - Jane Doe". */
function cleanTitle(t: string | null): string | null {
  if (!t) return null;
  const parts = t.split(/\s[-–|:]\s/);
  return (parts.length > 1 ? parts[parts.length - 1] : t).trim().slice(0, 80) || null;
}
