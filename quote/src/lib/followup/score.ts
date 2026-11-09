/**
 * How much a quote needs a person (Albert, 2026-11-09; vault 05_decisions/2026-11-07-quote-follow-up-worklist,
 * addendum 2026-11-09). Pure, no I/O. A 0 to 100 score that reads roughly as "the chance this closes", a tier, and
 * the reasons in plain words. Tested in tests/followup.score.test.ts.
 *
 * The base is the Lead to Won Review (2026-11-03, GHL Nov 2025 to Oct 2026): the close rate by two-way touches,
 * automation left out. 0 to 5 touches closed about 3%, 6 to 10 about 8%, 11 to 20 about 20%, 21 to 40 about 33%,
 * 41 or more about 47%. Customer messages separate wins best (13.4 a won lead against 3.4 a lost one), so they
 * count one and a half. Home plus store visits closed 80%, a home or store visit alone about 28%.
 *
 * Every number below is a dial: change it here, and record the change as a dated addendum on the decision note.
 */

import type { Brief } from "./brief";
import type { Visit, Where } from "./visit";

/** Two-way touches → close %, from the deck's buckets (each point near its bucket's middle). Straight lines between. */
export const TOUCH_CURVE: readonly (readonly [number, number])[] = [
  [0, 2],
  [3, 3],
  [8, 8],
  [15, 20],
  [30, 33],
  [41, 47],
];
/** A customer message counts this much against one of ours (Albert, 2026-11-09: "inbound ×1.5"). */
export const INBOUND_WEIGHT = 1.5;
/** The quote's likely total → a multiplier (Albert, 2026-11-09: "higher desire from our end if the project is higher in value"). */
export const VALUE_BANDS: readonly { from: number; factor: number; words: string }[] = [
  { from: 0, factor: 0.8, words: "under $3k" },
  { from: 3_000, factor: 1, words: "$3k to $10k" },
  { from: 10_000, factor: 1.2, words: "$10k to $25k" },
  { from: 25_000, factor: 1.4, words: "$25k or more" },
];
/** The top band always needs a person (a hard flag). */
export const TOP_VALUE = 25_000;
export const NEEDS_YOU_AT = 20;
export const WATCH_AT = 8;
/** At or above this, or Needs you with a hard flag, the sender also gets a WhatsApp (the hot tier). */
export const HOT_AT = 33;
/** Needs you rows a sender sees a day before the rest wait under Next up. Hard flags ignore it. */
export const DAILY_CAP = 8;
export const POINTS = {
  visitBooked: 10,
  /** A visit that went ahead: at least what a home-only visit closes. */
  visitedFloor: 28,
  /** Both a home measure and a store visit: the deck's 80%, held a little lower for a score. */
  homeAndStoreFloor: 60,
  noShow: -5,
  openedRecently: 3,
  intentReply: 5,
} as const;
/** Quiet from the customer this long: the score fades (unless they named a later day). */
export const QUIET = [
  { days: 14, factor: 0.5 },
  { days: 7, factor: 0.75 },
] as const;
/** A conversation this warm, then quiet this long, has gone cold: a person should ask why. */
export const COLD_AFTER_TOUCHES = 15;
export const COLD_AFTER_DAYS = 5;
export const OPENED_RECENTLY_DAYS = 3;

export type Tier = "needs" | "watch" | "auto";
export const TIER_WORDS: Record<Tier, string> = { needs: "Needs you", watch: "Watch", auto: "Auto" };

export type HardFlag = "buying" | "objection" | "big" | "cold" | "complaint" | "undelivered" | "unopened";
export const FLAG_WORDS: Record<HardFlag, string> = {
  buying: "asked about price, dates or availability",
  objection: "named a competitor or pushed back",
  big: "large or commercial job",
  cold: "went quiet after a long conversation",
  complaint: "unhappy with us",
  undelivered: "the quote didn't arrive: check the email or number",
  unopened: "measured quote not opened after 4 days",
};
/** GHL message statuses that mean it never reached them (2026-11-09: "Yes, flag it"). */
export const UNDELIVERED = /^(failed|undelivered|bounced?|error|rejected)$/;
/** A measured quote unopened this many days after sending needs a person (GHL's measured text goes at day 2). */
export const UNOPENED_MEASURED_DAYS = 4;

/** What the brief reads in the conversation (src/lib/followup/brief.ts). Null when no current brief has them. */
export type Signals = NonNullable<Brief["signals"]>;

export type ScoreMessage = { direction: "in" | "out"; channel: string; automated: boolean; at: string | null; callSeconds: number | null; status?: string | null };

/**
 * A message of ours since the quote went that GHL says never arrived, with nothing since to show it got through: no
 * later delivered message on that channel, and no word from the customer.
 */
export function undelivered(messages: ScoreMessage[], sentAt: string, day: (s: string | Date) => string): boolean {
  const from = day(sentAt);
  const ours = messages.filter((m) => m.at && day(m.at) >= from && m.direction === "out" && m.channel !== "note" && m.channel !== "activity" && m.channel !== "call");
  const failed = ours.filter((m) => UNDELIVERED.test((m.status ?? "").toLowerCase()));
  if (!failed.length) return false;
  return failed.some((f) => {
    const after = (m: ScoreMessage) => (m.at as string) > (f.at as string);
    const replied = messages.some((m) => m.direction === "in" && m.at && after(m));
    const gotThrough = ours.some((m) => m.channel === f.channel && after(m) && !UNDELIVERED.test((m.status ?? "").toLowerCase()));
    return !replied && !gotThrough;
  });
}

export type ScoreInput = {
  /** The contact's thread (GHL), from a month before the quote was sent on; null when GHL couldn't be read. */
  messages: ScoreMessage[] | null;
  sentAt: string;
  preliminary: boolean;
  visit: Visit | null;
  /** Where visits went ahead (the contact's appointments), for home plus store. */
  visited: readonly Where[];
  /** The quote's likely total with HST, or null when nothing offered has one. */
  value: number | null;
  opens: number;
  lastOpened: string | null;
  signals: Signals | null;
  /** The day the customer named ("next week"), from a current brief. */
  namedDay: string | null;
  now: Date;
  torontoDay: (s: string | Date) => string;
};

export type Score = { score: number; tier: Tier; reasons: string[]; flags: HardFlag[]; hot: boolean; touches: number };

/** Two-way touches, as the deck counts them: our texts, emails and chats a person sent, calls that connected, and every customer message. */
export function twoWay(messages: ScoreMessage[], from: string): { ours: number; theirs: number; lastTheirs: string | null; lastOurs: string | null } {
  let ours = 0;
  let theirs = 0;
  let lastTheirs: string | null = null;
  let lastOurs: string | null = null;
  for (const m of messages) {
    if (!m.at || m.at < from || m.automated) continue;
    if (m.channel === "note" || m.channel === "activity") continue;
    const call = m.channel === "call";
    if (call && !((m.callSeconds ?? 0) > 0)) continue; // a missed call is not a conversation
    if (m.direction === "out") {
      ours++;
      if (!lastOurs || m.at > lastOurs) lastOurs = m.at;
    } else {
      theirs++;
      if (!lastTheirs || m.at > lastTheirs) lastTheirs = m.at;
    }
  }
  return { ours, theirs, lastTheirs, lastOurs };
}

/** The close % the deck puts against this many weighted touches. */
export function curve(t: number): number {
  const pts = TOUCH_CURVE;
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x0, y0] = pts[i - 1];
    if (t <= x1) return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1][1];
}

export const valueBand = (v: number | null) => (v == null ? null : [...VALUE_BANDS].reverse().find((b) => v >= b.from) ?? VALUE_BANDS[0]);

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const money = (n: number) => `$${n >= 1000 ? `${Math.round(n / 1000)}k` : Math.round(n)}`;

export function scoreOf(i: ScoreInput): Score {
  const today = i.torontoDay(i.now);
  const from = new Date(Date.parse(i.sentAt) - 30 * 86_400_000).toISOString();
  const tw = i.messages ? twoWay(i.messages, from) : { ours: 0, theirs: 0, lastTheirs: null, lastOurs: null };
  const t = tw.ours + INBOUND_WEIGHT * tw.theirs;
  const touches = tw.ours + tw.theirs;
  const reasons: { w: number; text: string }[] = [];
  let s = curve(t);
  reasons.push({ w: s, text: touches === 0 ? "no conversation yet" : `${touches} two-way message${touches === 1 ? "" : "s"}${tw.theirs ? `, ${tw.theirs} from them` : ""}` });

  // Visits: home plus store is the strongest thing the deck found.
  const home = i.visited.includes("in-home");
  const store = i.visited.includes("in store");
  if (home && store) {
    if (s < POINTS.homeAndStoreFloor) s = POINTS.homeAndStoreFloor;
    reasons.push({ w: 60, text: "visited at home and in the store" });
  } else if (i.visited.length > 0 || i.visit?.kind === "visited") {
    if (s < POINTS.visitedFloor) s = POINTS.visitedFloor;
    reasons.push({ w: 28, text: home ? "measured at home, not in the store yet" : store ? "seen in the store, not measured yet" : "visited" });
  } else if (i.visit?.kind === "booked") {
    s += POINTS.visitBooked;
    reasons.push({ w: POINTS.visitBooked, text: "visit booked" });
  }
  if (i.visit?.kind === "missed" && i.visit.why === "no-show") {
    s += POINTS.noShow;
    reasons.push({ w: 4, text: "missed the visit" });
  }
  if (i.opens > 0 && i.lastOpened && days(i.torontoDay(i.lastOpened), today) <= OPENED_RECENTLY_DAYS) {
    s += POINTS.openedRecently;
    reasons.push({ w: POINTS.openedRecently, text: "opened the quote this week" });
  }
  const unanswered = Boolean(tw.lastTheirs && (!tw.lastOurs || tw.lastTheirs > tw.lastOurs));
  if (i.signals?.replyClass === "intent" && unanswered) {
    s += POINTS.intentReply;
    reasons.push({ w: POINTS.intentReply + 10, text: "replied with a question or a plan" });
  }

  // Quiet fades it, unless they told us when to come back.
  const quiet = tw.lastTheirs ? days(i.torontoDay(tw.lastTheirs), today) : days(i.torontoDay(i.sentAt), today);
  const waiting = Boolean(i.namedDay && i.namedDay > today);
  if (!waiting) {
    const q = QUIET.find((x) => quiet >= x.days);
    if (q) {
      s *= q.factor;
      reasons.push({ w: 3, text: `quiet ${quiet} days` });
    }
  } else reasons.push({ w: 5, text: `said to come back ${i.namedDay}` });

  const band = valueBand(i.value);
  if (band) {
    s *= band.factor;
    reasons.push({ w: band.factor >= 1.2 ? 12 : 2, text: money(i.value as number) });
  }
  const score = Math.max(0, Math.min(100, Math.round(s)));

  // Hard flags: Needs you whatever the number says.
  const flags: HardFlag[] = [];
  const sig = i.signals;
  if (sig && unanswered && (sig.buyingQuestion || sig.namedDate)) flags.push("buying");
  if (sig && (sig.competitor || sig.objection)) flags.push("objection");
  if ((i.value != null && i.value >= TOP_VALUE) || sig?.commercial) flags.push("big");
  if (touches >= COLD_AFTER_TOUCHES && tw.lastTheirs && days(i.torontoDay(tw.lastTheirs), today) >= COLD_AFTER_DAYS && !waiting) flags.push("cold");
  if (sig?.complaint) flags.push("complaint");
  if (i.messages && undelivered(i.messages, i.sentAt, i.torontoDay)) flags.push("undelivered");
  const age = days(i.torontoDay(i.sentAt), today);
  const wroteSince = Boolean(tw.lastTheirs && tw.lastTheirs > i.sentAt);
  if (!i.preliminary && i.opens === 0 && age >= UNOPENED_MEASURED_DAYS && !wroteSince) flags.push("unopened");
  // An unopened preliminary is GHL's drip's (Albert, 2026-11-09: "GHL only, app never"): a reason, never a flag.
  if (i.preliminary && i.opens === 0 && age >= 3) reasons.push({ w: 4, text: "not opened yet" });

  let tier: Tier = flags.length || score >= NEEDS_YOU_AT ? "needs" : score >= WATCH_AT ? "watch" : "auto";
  // A measured quote always has a person on it (Albert, 2026-11-09): the score orders it, it never runs on its own.
  if (!i.preliminary && tier === "auto") tier = "watch";
  // Hot = a WhatsApp. An unopened measured quote is a person's job today, not an alarm.
  const hot = tier === "needs" && (score >= HOT_AT || flags.some((f) => f !== "unopened"));
  const top = [...flags.map((f) => ({ w: 100, text: FLAG_WORDS[f] })), ...reasons].sort((a, b) => b.w - a.w).map((r) => r.text);
  return { score, tier, reasons: [...new Set(top)].slice(0, 3), flags, hot, touches };
}

/**
 * Whether a preliminary stays with GHL's automated texts instead of the manual list (Albert, 2026-11-09:
 * "handle the preliminaries automatically; notify IF human intervention is best"). Only an Auto preliminary, and
 * never when the visit happened (the measured quote is owed), a postpone came back, or the customer wrote and no
 * current brief has said it was only a closer.
 */
export function staysAuto(i: { preliminary: boolean; tier: Tier; reason: string; signals: Signals | null }): boolean {
  if (!i.preliminary || i.tier !== "auto") return false;
  if (i.reason === "measure" || i.reason === "postponed") return false;
  if (i.reason === "replied") return i.signals != null && i.signals.replyClass !== "intent";
  return true;
}

/**
 * The daily cap: each sender's Needs you rows past DAILY_CAP, highest score first, wait under Next up. A hard flag
 * never waits. Returns the ids that wait.
 */
export function overCap<T extends { id: string; owner: string | null; score: Score }>(rows: T[], cap = DAILY_CAP): Set<string> {
  const byOwner = new Map<string, T[]>();
  for (const r of rows) if (r.score.tier === "needs") byOwner.set(r.owner ?? "", [...(byOwner.get(r.owner ?? "") ?? []), r]);
  const wait = new Set<string>();
  for (const list of byOwner.values()) {
    const flagged = list.filter((r) => r.score.flags.length > 0).length;
    const rest = list.filter((r) => r.score.flags.length === 0).sort((a, b) => b.score.score - a.score.score);
    rest.slice(Math.max(0, cap - flagged)).forEach((r) => wait.add(r.id));
  }
  return wait;
}
