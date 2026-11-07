/**
 * Where the lead is in the journey (Albert, 2026-11-07: "showcase whether there has been; or hasnt been an appt yet?
 * so its clear where the lead is in the overall lead journey"). Pure: the contact's GHL appointments as one visit fact
 * for the Follow up row, its brief and its due date. Tested in tests/followup.test.ts.
 */

export type Appointment = { id: string; calendarId: string | null; start: string | null; status: string | null; title: string | null };
export type Where = "in-home" | "in store" | "appointment";
export type Visit =
  | { kind: "none" }
  | { kind: "booked"; day: string; where: Where }
  | { kind: "visited"; day: string; where: Where }
  | { kind: "missed"; day: string; where: Where; why: "cancelled" | "no-show" };

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/** What a UTC instant reads as on a Toronto clock, as if that reading were UTC. */
function torontoWall(t: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

/**
 * A GHL time as an ISO instant. GET /contacts/{id}/appointments gives "2026-10-24 16:30:00", Toronto wall time with no
 * offset (checked live 2026-11-07 against /calendars/events, which gives "2026-10-24T16:30:00-04:00" for the same
 * visit); read as is, a UTC server put it 4 to 5 hours early. A time that carries its zone passes through unchanged.
 */
export function torontoTime(s: string | null): string | null {
  if (!s) return null;
  const m = NAIVE.exec(s.trim());
  if (!m) return s;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  let t = wall - (torontoWall(wall) - wall);
  t = wall - (torontoWall(t) - t);
  return new Date(t).toISOString();
}

const MISSED = new Set(["cancelled", "canceled", "noshow", "no_show", "no-show", "invalid"]);

function whereOf(a: Appointment, calendars: { inHome: string; inStore: string }): Where {
  if (a.calendarId === calendars.inHome) return "in-home";
  if (a.calendarId === calendars.inStore) return "in store";
  const t = (a.title ?? "").toLowerCase();
  if (/in[- ]?home|measure|site visit/.test(t)) return "in-home";
  if (/store|showroom/.test(t)) return "in store";
  return "appointment";
}

/**
 * The visit, by these rules: a booked one still ahead wins (the soonest); else the latest one that went ahead
 * (in the past and not cancelled or a no-show); else the latest cancelled or no-show; else none.
 */
export function visitOf(appts: Appointment[] | null, now: Date, day: (s: string | Date) => string, calendars: { inHome: string; inStore: string }): Visit | null {
  if (!appts) return null;
  const today = day(now);
  const dated = appts.filter((a) => a.start && !Number.isNaN(Date.parse(a.start))).map((a) => ({ a, d: day(a.start as string), missed: MISSED.has((a.status ?? "").toLowerCase()) }));
  const ahead = dated.filter((x) => !x.missed && x.d >= today && Date.parse(x.a.start as string) >= now.getTime()).sort((x, y) => x.d.localeCompare(y.d))[0];
  if (ahead) return { kind: "booked", day: ahead.d, where: whereOf(ahead.a, calendars) };
  const went = dated.filter((x) => !x.missed && Date.parse(x.a.start as string) < now.getTime()).sort((x, y) => y.d.localeCompare(x.d))[0];
  if (went) return { kind: "visited", day: went.d, where: whereOf(went.a, calendars) };
  const miss = dated.filter((x) => x.missed).sort((x, y) => y.d.localeCompare(x.d))[0];
  if (miss) return { kind: "missed", day: miss.d, where: whereOf(miss.a, calendars), why: /no/.test(miss.a.status ?? "") ? "no-show" : "cancelled" };
  return { kind: "none" };
}

const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

/** The chip's words: "No visit yet", "Visit booked Nov 12 · in-home", "Visited Nov 4 · in store", "No-show Nov 3 · in-home". */
export function visitWords(v: Visit): string {
  const at = (w: Where) => (w === "appointment" ? "" : ` · ${w}`);
  switch (v.kind) {
    case "none":
      return "No visit yet";
    case "booked":
      return `Visit booked ${short(v.day)}${at(v.where)}`;
    case "visited":
      return `Visited ${short(v.day)}${at(v.where)}`;
    case "missed":
      return `${v.why === "no-show" ? "No-show" : "Cancelled"} ${short(v.day)}${at(v.where)}`;
  }
}

/** For the brief's facts and signature: one line. */
export const visitFact = (v: Visit | null) => (v ? visitWords(v) : "unknown (GHL appointments couldn't be read)");
