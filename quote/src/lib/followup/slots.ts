/**
 * The firm-date offer (Albert, 2026-11-09: "a firm date offered saying something like 'we have an opening and I happen
 * to be in the area'"). Pure: from the in-home calendar's real open slots and the visits already booked, the few the
 * brief may offer. A slot is `near` when it starts within NEAR_HOURS of another booked visit's start that day, so
 * "in the area" is only said when we already have a visit going. Tested in tests/followup.score.test.ts.
 */

export const SLOT_DAYS = 7;
export const SLOTS_OFFERED = 3;
export const NEAR_HOURS = 2;
/** Not before this hour (Toronto), so the brief doesn't offer 7am. */
const EARLIEST_HOUR = 9;

const hourOf = (iso: string) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));

export function slotLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function pickSlots(free: string[], booked: (string | null)[], now: Date, day: (s: string | Date) => string): { at: string; label: string; near: boolean }[] {
  const starts = booked.filter((b): b is string => Boolean(b) && !Number.isNaN(Date.parse(b as string)));
  const today = day(now);
  const ok = free.filter((s) => Date.parse(s) > now.getTime() + 12 * 3_600_000 && day(s) > today && hourOf(s) >= EARLIEST_HOUR);
  const near = (s: string) => starts.some((b) => day(b) === day(s) && Math.abs(Date.parse(b) - Date.parse(s)) <= NEAR_HOURS * 3_600_000);
  // Near ones first (soonest), then the soonest of the rest, one a day so the offer reads as a choice.
  const seenDays = new Set<string>();
  const out: { at: string; label: string; near: boolean }[] = [];
  for (const s of [...ok.filter(near), ...ok.filter((x) => !near(x))]) {
    if (out.length >= SLOTS_OFFERED || seenDays.has(day(s))) continue;
    seenDays.add(day(s));
    out.push({ at: s, label: slotLabel(s), near: near(s) });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
