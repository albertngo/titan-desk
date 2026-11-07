/**
 * The Follow up page (Albert, 2026-11-07; vault 05_decisions/2026-11-07-quote-follow-up-worklist). Pure, no I/O:
 * what is kept on Quotes → Follow Up, which quotes are due, and why. src/lib/quotes/followup.ts reads Airtable and
 * GHL and writes; this file decides. Tested in tests/followup.test.ts.
 *
 * Dates are Toronto calendar days, "YYYY-MM-DD".
 */

import { parseBrief, type Brief } from "./brief";
import type { Visit } from "./visit";

/** Days after the quote is sent when, with nothing else to go on, a follow-up is due (Albert: "the looser"). */
export const SCHEDULE_DAYS = [3, 10, 21] as const;
/** The day the page asks to close it out or postpone it. Never lost on its own. */
export const CLOSE_OUT_DAY = 45;
/** After the third touch, the gap before the close-out question comes round again. */
export const LATE_GAP_DAYS = 14;
/**
 * Most quotes close by about this day (vault: visit → close median 11.7 days, 2026-Q4 S3 baseline). Shown as the
 * quote's age against it, not used to schedule. Re-measure sent → accepted from Airtable and tune (decision note).
 */
export const TYPICAL_CLOSE_DAYS = 12;
/** A postpone comes back this many days before its date, or halfway there when the date is under twice this away. */
export const POSTPONE_BACK_DAYS = 30;
export const SNOOZE_CHOICES = [3, 7, 14] as const;
export const NOTE_MAX = 500;

export type Touch = { at: string; by: string; note?: string };
export type Snooze = { until: string; at: string; by: string };
export type Postpone = { until: string; back: string; at: string; by: string; note?: string };
export type Lost = { at: string; by: string; reasonId: string | null; reason: string | null; note?: string };

/** Quotes → Follow Up. Only what the app itself knows: anything GHL already shows (messages, calls) is read live. */
/** Quotes → Follow Up also keeps the last brief (step 2), rewritten only when its signature moves. */
export type FollowUpState = { touches: Touch[]; snooze: Snooze | null; postpone: Postpone | null; lost: Lost | null; brief?: Brief | null };

export const emptyState = (): FollowUpState => ({ touches: [], snooze: null, postpone: null, lost: null });

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(v));
const isTime = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const text = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : undefined);
const who = (v: unknown) => text(v, 200) ?? "unknown";

/** The field as stored; anything unreadable reads as nothing kept, never as a guess. */
export function parseState(raw: string | null | undefined): FollowUpState {
  if (!raw) return emptyState();
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return emptyState();
  }
  if (!d || typeof d !== "object") return emptyState();
  const touches = Array.isArray(d.touches)
    ? (d.touches as Record<string, unknown>[]).filter((t) => t && isTime(t.at)).map((t) => ({ at: String(t.at), by: who(t.by), ...(text(t.note, NOTE_MAX) ? { note: text(t.note, NOTE_MAX) } : {}) }))
    : [];
  const s = d.snooze as Record<string, unknown> | null;
  const snooze = s && isDay(s.until) && isTime(s.at) ? { until: s.until, at: String(s.at), by: who(s.by) } : null;
  const p = d.postpone as Record<string, unknown> | null;
  const postpone =
    p && isDay(p.until) && isDay(p.back) && isTime(p.at) ? { until: p.until, back: p.back, at: String(p.at), by: who(p.by), ...(text(p.note, NOTE_MAX) ? { note: text(p.note, NOTE_MAX) } : {}) } : null;
  const l = d.lost as Record<string, unknown> | null;
  const lost =
    l && isTime(l.at)
      ? { at: String(l.at), by: who(l.by), reasonId: text(l.reasonId, 60) ?? null, reason: text(l.reason, 120) ?? null, ...(text(l.note, NOTE_MAX) ? { note: text(l.note, NOTE_MAX) } : {}) }
      : null;
  const brief = parseBrief(d.brief);
  return { touches, snooze, postpone, lost, ...(brief ? { brief } : {}) };
}

export const serializeState = (s: FollowUpState): string => JSON.stringify(s);

/** Whole calendar days from `a` to `b`. */
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
/** `d` moved by `n` days. */
export function addDays(d: string, n: number): string {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const later = (a: string, b: string) => (a >= b ? a : b);
const earlier = (a: string, b: string) => (a <= b ? a : b);

/**
 * When a postponed quote comes back (Albert, 2026-11-07: "1 month before the picked date"; under two months away,
 * "halfway"). Never before tomorrow, never after the date itself.
 */
export function postponeBack(today: string, until: string): string {
  const span = dayDiff(today, until);
  const back = span >= POSTPONE_BACK_DAYS * 2 ? addDays(until, -POSTPONE_BACK_DAYS) : addDays(today, Math.round(span / 2));
  return earlier(later(back, addDays(today, 1)), until);
}

/** A postpone date staff may pick: after today, within two years. */
export function postponeProblem(today: string, until: unknown): string | null {
  if (!isDay(until)) return "Pick the date they want to be followed up around.";
  if (until <= today) return "Pick a date after today.";
  if (dayDiff(today, until) > 730) return "Pick a date within two years.";
  return null;
}

/**
 * What GHL shows about the conversation since the quote went out, as days: each time staff reached the customer (a
 * text, email or chat a person sent, or a call that connected; never an automation or an internal comment), and the
 * customer's last message. Read in src/lib/quotes/followup.ts from the GHL thread.
 */
export type Thread = { staffTouches: string[]; lastCustomer: string | null };

/** The messages of a GHL thread (src/lib/conversation/thread.ts's shape, the fields this needs) as a Thread, from `since` on. */
export function threadSince(
  messages: { direction: "in" | "out"; channel: string; automated: boolean; at: string | null; callSeconds: number | null }[],
  since: string,
): Thread {
  const staffTouches: string[] = [];
  let lastCustomer: string | null = null;
  for (const m of messages) {
    if (!m.at || m.at <= since || m.automated) continue;
    if (m.channel === "note" || m.channel === "activity") continue;
    const call = m.channel === "call";
    const connected = (m.callSeconds ?? 0) > 0;
    if (m.direction === "out") {
      // A call we placed counts once it connected; a text, email or chat a person sent always does.
      if (!call || connected) staffTouches.push(m.at);
      continue;
    }
    // Their call that someone answered was a conversation too; a missed one wants an answer like a text does.
    if (call && connected) staffTouches.push(m.at);
    if (!lastCustomer || m.at > lastCustomer) lastCustomer = m.at;
  }
  return { staffTouches, lastCustomer };
}

export type DueReason =
  | { kind: "scheduled"; touch: number } // the 1st, 2nd or 3rd follow-up on the schedule
  | { kind: "replied" } // the customer wrote after our last touch
  | { kind: "close-out" } // day 45: close it out or postpone it
  | { kind: "postponed"; until: string } // back from a postpone
  | { kind: "expired" } // past its good-until date
  | { kind: "named"; day: string; quote: string | null } // the customer named a time ("next week"), read by the brief
  | { kind: "measure"; day: string }; // a preliminary whose visit happened: the measured quote is owed

export type Bucket = "due" | "upcoming" | "snoozed" | "postponed";

export type Due = {
  bucket: Bucket;
  /** The day it is (or was) due. */
  day: string;
  reason: DueReason;
  /** Days since it was sent, for "day 9 · most close by day 12". */
  age: number;
  /** How many times staff reached the customer since it was sent (GHL and "I followed up"). */
  touches: number;
  lastTouch: string | null;
};

export type DueInput = {
  /** When the newest sent version went out (ISO). */
  sentAt: string;
  /** Its good-until date, if it has one (a preliminary has none). */
  validUntil: string | null;
  state: FollowUpState;
  /** What GHL shows; null when GHL couldn't be read, so only "I followed up" counts. */
  thread: Thread | null;
  now: Date;
  torontoDay: (s: string | Date) => string;
  /** The day the customer named, from a brief written for the thread as it stands; it replaces the fallback schedule. */
  named?: { day: string; quote: string | null } | null;
  /** The visit, from GHL's appointments (null when they couldn't be read), and whether the quote out is a preliminary. */
  visit?: Visit | null;
  preliminary?: boolean;
};

/**
 * Where a quote stands on the Follow up page, or null when it is off it (lost). The rules, in order:
 * - Postponed and not yet back: under Postponed, due on its return day.
 * - Otherwise the schedule: the k-th follow-up is due SCHEDULE_DAYS[k] days after sending, and never sooner after the
 *   last touch than the gap between the two schedule days; after three, the close-out question at day 45, then every
 *   LATE_GAP_DAYS after the last touch. Back from a postpone, it is due on its return day, then a week after a touch.
 * - The customer wrote after our last touch: due the day they wrote.
 * - Past its good-until date: due now, to send it again or close it out.
 * - Snoozed: not before the snooze ends, unless the customer wrote after it was set.
 */
export function dueOf(i: DueInput): Due | null {
  if (i.state.lost) return null;
  const day = i.torontoDay;
  const today = day(i.now);
  const sent = day(i.sentAt);
  // Sent At is a day, not a time, and the quote's own email and text go out that day: GHL's messages count from the
  // next day on (a reply the same day still counts). "I followed up" is a person's word, so it counts any day.
  const touchDays = [...(i.thread?.staffTouches ?? []).map(day).filter((d) => d > sent), ...i.state.touches.map((t) => day(t.at)).filter((d) => d >= sent)];
  // One touch a day: a text and a call the same afternoon are one follow-up.
  const days = [...new Set(touchDays)].sort();
  const k = days.length;
  const lastTouch = days.at(-1) ?? null;
  const age = dayDiff(sent, today);
  const base = { age, touches: k, lastTouch };
  const p = i.state.postpone;

  if (p && today < p.back) return { ...base, bucket: "postponed", day: p.back, reason: { kind: "postponed", until: p.until } };

  let due: string;
  let reason: DueReason;
  if (p) {
    due = lastTouch && lastTouch >= p.back ? addDays(lastTouch, 7) : p.back;
    reason = { kind: "postponed", until: p.until };
  } else if (k < SCHEDULE_DAYS.length) {
    const onSchedule = addDays(sent, SCHEDULE_DAYS[k]);
    const gap = k === 0 ? 0 : SCHEDULE_DAYS[k] - SCHEDULE_DAYS[k - 1];
    due = lastTouch ? later(onSchedule, addDays(lastTouch, gap)) : onSchedule;
    reason = { kind: "scheduled", touch: k + 1 };
    const closeOut = addDays(sent, CLOSE_OUT_DAY);
    if (due >= closeOut) {
      due = closeOut;
      reason = { kind: "close-out" };
    }
  } else {
    due = later(addDays(sent, CLOSE_OUT_DAY), addDays(lastTouch as string, LATE_GAP_DAYS));
    reason = { kind: "close-out" };
  }

  // "It should be dynamic but a looser standard to fall back on" (Albert): a time the customer named wins over the schedule.
  if (i.named && (reason.kind === "scheduled" || reason.kind === "close-out")) {
    due = i.named.day;
    reason = { kind: "named", day: i.named.day, quote: i.named.quote };
  }

  // A preliminary is a quote before a visit (2026-10-27): once the visit has happened, the measured quote is owed.
  if (i.preliminary && i.visit?.kind === "visited" && i.visit.day >= sent && i.visit.day < today && reason.kind !== "postponed") {
    due = earlier(due, addDays(i.visit.day, 1));
    reason = { kind: "measure", day: i.visit.day };
  }

  const replied = i.thread?.lastCustomer ? day(i.thread.lastCustomer) : null;
  const unanswered = replied && replied >= sent && (!lastTouch || replied > lastTouch) ? replied : null;
  if (unanswered) {
    due = earlier(due, unanswered);
    reason = { kind: "replied" };
  }
  if (i.validUntil && day(i.validUntil) < today && reason.kind !== "replied") {
    due = earlier(due, today);
    reason = { kind: "expired" };
  }

  const s = i.state.snooze;
  const snoozeHolds = s && today < s.until && !(i.thread?.lastCustomer && i.thread.lastCustomer > s.at);
  if (snoozeHolds) return { ...base, bucket: "snoozed", day: later(due, s.until), reason };
  return { ...base, bucket: due <= today ? "due" : "upcoming", day: due, reason };
}

/** A reason in words, for the row. */
export function dueWords(d: Due): string {
  const r = d.reason;
  switch (r.kind) {
    case "scheduled":
      return r.touch === 1 ? "First follow-up" : r.touch === 2 ? "Second follow-up" : "Third follow-up";
    case "replied":
      return "They replied, no answer yet";
    case "close-out":
      return "Close it out or postpone it";
    case "postponed":
      return `Postponed to ${r.until}, follow up`;
    case "expired":
      return "Past its good-until date: send it again or close it out";
    case "named":
      return r.quote ? `They said: "${r.quote}"` : "Around the time they asked for";
    case "measure":
      return "Visited: the measured quote is owed";
  }
}

/** "day 9 · most close by day 12", or "day 15 · past the usual close" once it is. */
export const ageWords = (age: number) => (age <= TYPICAL_CLOSE_DAYS ? `day ${age} · most close by day ${TYPICAL_CLOSE_DAYS}` : `day ${age} · past the usual close (day ${TYPICAL_CLOSE_DAYS})`);

/** Most urgent first: due before upcoming before snoozed before postponed; within each, the earliest day, then the oldest quote. */
export function byUrgency<T extends { due: Due }>(a: T, b: T): number {
  const order: Record<Bucket, number> = { due: 0, upcoming: 1, snoozed: 2, postponed: 3 };
  return order[a.due.bucket] - order[b.due.bucket] || a.due.day.localeCompare(b.due.day) || b.due.age - a.due.age;
}

/** A quote is someone's: whoever last sent it, else who created it (Albert, 2026-11-07; the app no longer reads GHL's assigned user). */
export const ownerOf = (sentBy: string | null, createdBy: string | null): string | null => (sentBy ?? createdBy)?.toLowerCase() ?? null;

/** The note staff typed, cleaned; undefined for nothing. */
export const cleanNote = (v: unknown) => text(v, NOTE_MAX);

/** The state after each action, built on what was read just before the write (compare-and-swap in followup.ts). */
export const withTouch = (s: FollowUpState, t: Touch): FollowUpState => ({ ...s, touches: [...s.touches, t].slice(-50), snooze: null });
export const withSnooze = (s: FollowUpState, today: string, days: number, at: string, by: string): FollowUpState => ({ ...s, snooze: { until: addDays(today, days), at, by } });
export const withPostpone = (s: FollowUpState, p: Postpone): FollowUpState => ({ ...s, postpone: p, snooze: null, lost: null });
export const withLost = (s: FollowUpState, l: Lost): FollowUpState => ({ ...s, lost: l, snooze: null });

export const withBrief = (s: FollowUpState, b: Brief): FollowUpState => ({ ...s, brief: b });
