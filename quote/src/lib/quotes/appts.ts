/**
 * Appointments on All quotes (Albert, 2026-11-26: "a tab filter that has 'with appt already' and then which one they had
 * or both 'in-home - when' / 'in-store - when' as a quick info in the table"). Pure: the two booking calendars'
 * appointments, per GHL contact, as one in-home and one in-store visit each. Read in src/lib/quotes/appointments.ts;
 * tested in tests/appts.test.ts.
 */

export type ApptWhere = "in-home" | "in-store";
/** One visit: its Toronto day, and whether it is still ahead (booked) rather than gone ahead. */
export type Appt = { day: string; ahead: boolean };
export type QuoteAppts = { inHome: Appt | null; inStore: Appt | null };

export type ApptEvent = { contactId: string | null; calendarId: string | null; start: string | null; status: string | null };

/** Cancelled, no-show or invalid: never counts as an appointment. */
const MISSED = /cancel|no.?show|invalid/i;

/**
 * Per contact and per calendar: the soonest booked visit still ahead, else the latest one that went ahead.
 * Cancelled and no-show visits are left out. Events on any other calendar are ignored.
 */
export function apptsByContact(events: ApptEvent[], now: Date, day: (s: string) => string, calendars: { inHome: string; inStore: string }): Map<string, QuoteAppts> {
  const out = new Map<string, QuoteAppts>();
  const t0 = now.getTime();
  for (const e of events) {
    if (!e.contactId || !e.start || MISSED.test(e.status ?? "")) continue;
    const key: keyof QuoteAppts | null = e.calendarId === calendars.inHome ? "inHome" : e.calendarId === calendars.inStore ? "inStore" : null;
    if (!key) continue;
    const t = Date.parse(e.start);
    if (Number.isNaN(t)) continue;
    const next: Appt = { day: day(e.start), ahead: t >= t0 };
    const row = out.get(e.contactId) ?? { inHome: null, inStore: null };
    const had = row[key];
    // A booked one ahead beats any past one; among booked, the soonest; among past, the latest.
    const better = !had || (next.ahead && !had.ahead) || (next.ahead && had.ahead && next.day < had.day) || (!next.ahead && !had.ahead && next.day > had.day);
    if (better) row[key] = next;
    out.set(e.contactId, row);
  }
  return out;
}

export const APPT_FILTERS = [
  { key: "any", label: "Any" },
  { key: "with", label: "With appt" },
  { key: "in-home", label: "In-home" },
  { key: "in-store", label: "In-store" },
  { key: "both", label: "Both" },
] as const;
export type ApptFilter = (typeof APPT_FILTERS)[number]["key"];

/** In-home and In-store mean that one was had (the other may be too); Both means both. */
export function inApptFilter(a: QuoteAppts | null | undefined, f: ApptFilter): boolean {
  const home = Boolean(a?.inHome);
  const store = Boolean(a?.inStore);
  switch (f) {
    case "any":
      return true;
    case "with":
      return home || store;
    case "in-home":
      return home;
    case "in-store":
      return store;
    case "both":
      return home && store;
  }
}

/** "Nov 12", with the year when it isn't this year's. */
export function apptDay(d: string, today: string): string {
  const date = new Date(`${d}T12:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC", ...(d.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) };
  return date.toLocaleDateString("en-CA", opts);
}

/** The row's words, one per visit: "In-home · Nov 12", "In-store · Dec 3, booked". */
export function apptWords(a: QuoteAppts | null | undefined, today: string): { where: ApptWhere; text: string; ahead: boolean }[] {
  if (!a) return [];
  const out: { where: ApptWhere; text: string; ahead: boolean }[] = [];
  for (const [where, v] of [["in-home", a.inHome], ["in-store", a.inStore]] as const) {
    if (!v) continue;
    out.push({ where, ahead: v.ahead, text: `${where === "in-home" ? "In-home" : "In-store"} · ${apptDay(v.day, today)}${v.ahead ? ", booked" : ""}` });
  }
  return out;
}
