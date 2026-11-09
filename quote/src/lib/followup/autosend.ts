/**
 * The app sends measured follow-ups (Albert, 2026-11-09: "I like the app sending out the messages… How can we make
 * this a norm for the measured quote"; vault 05_decisions/2026-11-07-quote-follow-up-worklist, round 3). Pure, no I/O:
 * the check every draft passes before it goes, the guardrails an automatic send passes on top, and the report that
 * says when Stage 2 is ready. src/lib/quotes/followup.ts sends. Tested in tests/followup.autosend.test.ts.
 *
 * Stage 1: a person taps Send (they may edit). Stage 2: the routine kinds go on their own, only once Albert flips
 * QUOTE_AUTO_FOLLOWUPS on, and never without every guardrail below.
 */

import type { HardFlag } from "./score";

/** What a draft is for; only the routine ones may ever go on their own. */
export const DRAFT_KINDS = ["checkin", "opened", "nudge", "slot", "call", "other"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];
export const AUTO_KINDS: readonly DraftKind[] = ["checkin", "opened", "nudge"];

export type Channel = "sms" | "email";
/** One message the app sent, kept on Quotes → Follow Up (`sent[]`). */
export type SentLog = { at: string; kind: DraftKind; how: "tap" | "auto"; channel: Channel; by: string; edited: number };

export const SMS_MAX = 480;
export const EMAIL_MAX = 1500;
/** Stage 2's guardrails (Albert, 2026-11-09). */
export const SEND_HOURS = { from: 9, to: 19 } as const; // Toronto, 9am up to 7pm
export const SEND_DAYS = [1, 2, 3, 4, 5, 6] as const; // Mon to Sat
export const MIN_GAP_HOURS = 48;
export const MAX_APP_MESSAGES = 4;
export const AUTO_VALUE_LIMIT = 25_000;
/** Stage 2 is offered (never switched on) after this many taps with this share sent unchanged or lightly edited. */
export const READY_SENDS = 30;
export const READY_SHARE = 0.8;
/** At or under this edit share a send counts as "lightly edited". */
export const LIGHT_EDIT = 0.15;

const money = (n: number) => Math.round(n);

/**
 * Every dollar amount in a draft must be one the quote itself carries: an option's total, or a range's low or high
 * (rounded to the dollar, with or without cents). No invented price, discount or deposit can go out.
 */
export function amountsOk(text: string, allowed: number[]): { ok: true } | { ok: false; amount: string } {
  const ok = new Set(allowed.filter((n) => Number.isFinite(n)).map(money));
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s?(k|K)?/g)) {
    const n = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
    const hit = [...ok].some((a) => a === n || (m[2] && Math.abs(a - n) < 500) || Math.abs(a - n) < 1);
    if (!hit) return { ok: false, amount: m[0].trim() };
  }
  return { ok: true };
}

/** The check every send passes, tapped or automatic. Null = fine, else what is wrong in plain words. */
export function checkDraft(d: { text: string; channel: Channel; subject?: string | null }, allowed: number[]): string | null {
  const t = d.text.trim();
  if (!t) return "The message is empty.";
  if (t.includes("\u2014")) return "Take the long dash out of the message.";
  if (d.channel === "sms" && t.length > SMS_MAX) return `A text is at most ${SMS_MAX} characters (this is ${t.length}).`;
  if (d.channel === "email" && t.length > EMAIL_MAX) return `Keep the email under ${EMAIL_MAX} characters.`;
  if (d.channel === "email" && !(d.subject ?? "").trim()) return "An email needs a subject.";
  const a = amountsOk(`${d.subject ?? ""} ${t}`, allowed);
  if (!a.ok) return `${a.amount} isn't a price on this quote. Use the quote's own total, or leave the price out.`;
  return null;
}

/** How much a person changed the draft before sending: 0 = as written, 1 = rewritten. Word-level, order-blind. */
export function editShare(draft: string, sent: string): number {
  const words = (s: string) => s.toLowerCase().match(/[a-z0-9$']+/g) ?? [];
  const a = words(draft);
  const b = words(sent);
  if (!a.length && !b.length) return 0;
  const bag = new Map<string, number>();
  for (const w of a) bag.set(w, (bag.get(w) ?? 0) + 1);
  let same = 0;
  for (const w of b) {
    const n = bag.get(w) ?? 0;
    if (n > 0) {
      same++;
      bag.set(w, n - 1);
    }
  }
  return Math.round((1 - same / Math.max(a.length, b.length)) * 100) / 100;
}

/** The Stage 2 report: how many taps, how many went out as written or lightly edited, and whether the bar is met. */
export function readiness(sent: SentLog[]): { taps: number; light: number; share: number; ready: boolean } {
  const taps = sent.filter((s) => s.how === "tap");
  const light = taps.filter((s) => s.edited <= LIGHT_EDIT).length;
  const share = taps.length ? Math.round((light / taps.length) * 100) / 100 : 0;
  return { taps: taps.length, light, share, ready: taps.length >= READY_SENDS && share >= READY_SHARE };
}

/** Toronto weekday (0 Sun) and hour. */
function torontoClock(now: Date): { weekday: number; hour: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), hour: Number(p.hour) };
}

export type AutoInput = {
  /** QUOTE_AUTO_FOLLOWUPS is on (Albert's switch). */
  switchOn: boolean;
  /** The quote's own "Auto follow-ups" (on unless staff turned it off). */
  quoteOn: boolean;
  measured: boolean;
  /** The quote is due now on the Follow up page. */
  dueNow: boolean;
  /** The brief is current (written for the thread as it stands). */
  briefCurrent: boolean;
  kind: DraftKind | null;
  stepKind: string | null;
  draft: string;
  flags: HardFlag[];
  /** The customer wrote after our last message. */
  unanswered: boolean;
  value: number | null;
  sent: SentLog[];
  now: Date;
};

/** Why the app may not send this one on its own; null = it may. Every rule is Albert's (2026-11-09). */
export function autoBlock(i: AutoInput): string | null {
  if (!i.switchOn) return "Auto follow-ups are off for the app.";
  if (!i.quoteOn) return "Auto follow-ups are off for this quote.";
  if (!i.measured) return "Only measured quotes are followed up by the app.";
  if (!i.dueNow) return "Not due yet.";
  if (!i.briefCurrent) return "The brief is out of date.";
  if (!i.draft.trim()) return "No draft.";
  if (i.stepKind !== "text" && i.stepKind !== "email") return "The next step is for a person.";
  if (!i.kind || !AUTO_KINDS.includes(i.kind)) return "Only check-ins and nudges go on their own.";
  if (i.unanswered) return "The customer is waiting on a person's reply.";
  if (i.flags.length) return "It needs a person (a flag is up).";
  if ((i.value ?? 0) >= AUTO_VALUE_LIMIT) return "A $25k+ job always gets a person's tap.";
  const c = torontoClock(i.now);
  if (!(SEND_DAYS as readonly number[]).includes(c.weekday) || c.hour < SEND_HOURS.from || c.hour >= SEND_HOURS.to) return "Outside 9am to 7pm, Monday to Saturday.";
  if (i.sent.length >= MAX_APP_MESSAGES) return `The app has sent ${MAX_APP_MESSAGES} already: a person takes it from here.`;
  const last = i.sent.map((s) => Date.parse(s.at)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  if (last && i.now.getTime() - last < MIN_GAP_HOURS * 3_600_000) return "The app sent one in the last 2 days.";
  return null;
}

/**
 * Which channel (Albert, 2026-11-09: "match theirs, else SMS"): the one the customer last wrote on, else a text, and
 * email only when there's no mobile number.
 */
export function channelFor(lastCustomerChannel: string | null, hasPhone: boolean, hasEmail: boolean): Channel | null {
  if (lastCustomerChannel === "email" && hasEmail) return "email";
  if (lastCustomerChannel === "sms" && hasPhone) return "sms";
  if (hasPhone) return "sms";
  if (hasEmail) return "email";
  return null;
}
