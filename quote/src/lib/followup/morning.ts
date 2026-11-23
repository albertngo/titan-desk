/**
 * Follow up as a morning brief (Albert, 2026-11-22; vault 05_decisions/2026-11-22-follow-up-morning-brief: "a quick
 * overview for each contact is 90% of the time needed. Then deeper info and analysis is on an expand").
 *
 * Pure, no I/O: which group a row sits in, whether it was done today, the order, the one button that does the brief's
 * step, the step in one line, and the sentence at the top. src/components/FollowUpList.tsx draws it.
 * Tested in tests/followup.morning.test.ts.
 */

import type { Brief, StepKind } from "./brief";
import type { Choice, Group } from "./choices";
import type { Bucket, Due, FollowUpState } from "./plan";
import type { Tier } from "./score";

export const STEP_WORDS: Record<StepKind, string> = { call: "Call them", text: "Send a text", email: "Send an email", visit: "Book the visit", wait: "Wait", close: "Close it out" };

/** What a row needs from FollowUpRow (src/lib/quotes/followup.ts), kept small so tests build one by hand. */
export type MorningRow = {
  due: Pick<Due, "bucket" | "day" | "reason" | "lastTouch">;
  score: { score: number; tier: Tier };
  state: Pick<FollowUpState, "touches" | "snooze" | "postpone" | "lost" | "sent" | "choices">;
  waiting: boolean;
  basis: string | null;
  channel: "sms" | "email" | null;
  ghlUrl: string | null;
};

export type Done = { words: string; at: string };

const ACTED: readonly Choice["did"][] = ["send", "touch", "snooze", "postpone", "lost"];

/** "9:14 AM", Toronto. */
export const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" });

/**
 * Done today (Albert: "any touch today"): a Send, I followed up, Snooze, Postpone or Lost pressed today, or a text,
 * email or call in GHL today. The newest wins. Null when nothing happened today.
 */
export function doneToday(r: MorningRow, today: string, day: (s: string) => string): Done | null {
  const found: Done[] = [];
  const s = r.state;
  for (const c of s.choices ?? []) {
    if (!ACTED.includes(c.did) || day(c.at) !== today) continue;
    if (c.did === "send") {
      const sent = [...(s.sent ?? [])].reverse().find((x) => day(x.at) === today);
      found.push({ at: c.at, words: `${sent?.channel === "email" ? "Emailed" : "Texted"} ${clock(c.at)}` });
    } else if (c.did === "touch") found.push({ at: c.at, words: `Followed up ${clock(c.at)}` });
    else if (c.did === "snooze") found.push({ at: c.at, words: `Snoozed${s.snooze ? ` to ${s.snooze.until}` : ""}` });
    else if (c.did === "postpone") found.push({ at: c.at, words: `Postponed${s.postpone ? ` to ${s.postpone.until}` : ""}` });
    else found.push({ at: c.at, words: "Marked lost" });
  }
  // The same things from before the choice log, and anything pressed elsewhere.
  for (const t of s.touches) if (day(t.at) === today) found.push({ at: t.at, words: t.note?.startsWith("App ") ? `${t.note.includes("email") ? "Emailed" : "Texted"} ${clock(t.at)}` : `Followed up ${clock(t.at)}` });
  if (s.snooze && day(s.snooze.at) === today) found.push({ at: s.snooze.at, words: `Snoozed to ${s.snooze.until}` });
  if (s.postpone && day(s.postpone.at) === today) found.push({ at: s.postpone.at, words: `Postponed to ${s.postpone.until}` });
  if (s.lost && day(s.lost.at) === today) found.push({ at: s.lost.at, words: "Marked lost" });
  if (!found.length && r.due.lastTouch === today) return { at: `${today}T12:00:00.000Z`, words: "Followed up in GHL" };
  return found.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
}

/** The group a row was in when it was acted on today, from the choice log; null when it wasn't logged. */
const groupActedFrom = (r: MorningRow, today: string, day: (s: string) => string): Group | null =>
  [...(r.state.choices ?? [])].reverse().find((c) => ACTED.includes(c.did) && day(c.at) === today)?.group ?? null;

/**
 * Where a row sits: Reach today (Needs you, due), If you have time (Watch, due), or Later (everything else). A row done
 * today stays in the group it was acted from, ticked, until tomorrow.
 */
export function placeOf(r: MorningRow, done: Done | null, today: string, day: (s: string) => string): Group {
  if (done) {
    const from = groupActedFrom(r, today, day);
    if (from && from !== "later") return from;
    if (from === "later") return "later";
    return r.score.tier === "needs" ? "reach" : "time";
  }
  if (r.due.bucket !== "due" || r.waiting) return "later";
  return r.score.tier === "needs" ? "reach" : "time";
}

/** Later's lines, in order. */
export type LaterKind = "next" | "upcoming" | "postponed" | "snoozed" | "auto";
export const LATER: { kind: LaterKind; title: string; hint: string }[] = [
  { kind: "next", title: "Next up", hint: "Needs you, past today's limit for this person" },
  { kind: "upcoming", title: "Coming up", hint: "Due in the next few days" },
  { kind: "postponed", title: "Postponed", hint: "Back on the list before their date" },
  { kind: "snoozed", title: "Snoozed", hint: "Still deciding" },
  { kind: "auto", title: "On auto", hint: "GHL's texts are handling these; each moves up when the customer engages" },
];
export function laterOf(r: MorningRow): LaterKind {
  if (r.waiting && r.due.bucket === "due") return "next";
  const b: Bucket = r.due.bucket;
  return b === "due" ? "upcoming" : b;
}

/** Owed, not optional (Albert: "Score, owed pinned"): they replied and we haven't, or the visit happened and the measured quote is owed. */
export function pinOf(r: MorningRow): "Replied" | "Owed" | null {
  if (r.due.reason.kind === "replied") return "Replied";
  if (r.due.reason.kind === "measure") return "Owed";
  return null;
}

/** Within a group: pinned first, then score high to low; rows done today sink to the bottom, in the order they were done. */
export function byMorning<T extends { row: MorningRow; done: Done | null }>(a: T, b: T): number {
  if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1;
  if (a.done && b.done) return a.done.at.localeCompare(b.done.at);
  const pa = pinOf(a.row) ? 0 : 1;
  const pb = pinOf(b.row) ? 0 : 1;
  return pa - pb || b.row.score.score - a.row.score.score;
}

export type Act = "expand" | "copyGhl" | "ghl" | "link" | "lost" | "snooze";
export type Primary = { label: string; act: Act };

/** A measured quote's draft goes from the app (2026-11-09); a preliminary's is copied into GHL. */
export const sendableOf = (r: Pick<MorningRow, "basis" | "channel">, b: Brief | null) => r.basis !== "Preliminary" && Boolean(r.channel) && Boolean(b?.draft);

/**
 * The one button that does the brief's step (Albert, 2026-11-22). A text or email opens the draft, where Send is;
 * nothing goes to a customer from the collapsed row.
 */
export function primaryOf(r: MorningRow, b: Brief | null): Primary {
  if (!b) return { label: "Open", act: "expand" };
  const sendable = sendableOf(r, b);
  const draftAct = (label: string): Primary => (sendable ? { label, act: "expand" } : b.draft && r.ghlUrl ? { label: "Copy and open GHL", act: "copyGhl" } : { label: "Open", act: "expand" });
  switch (b.step.kind) {
    case "text":
      return draftAct("Review text");
    case "email":
      return draftAct("Review email");
    case "call":
      return r.ghlUrl ? { label: "Open in GHL", act: "ghl" } : { label: "Open", act: "expand" };
    case "visit":
      return r.basis === "Preliminary" ? { label: "Copy booking link", act: "link" } : draftAct("Review text");
    case "close":
      return { label: "Close it out", act: "lost" };
    case "wait":
      return { label: "Snooze 7 days", act: "snooze" };
  }
}

/** The step in one line: "Send a text" and what it's about (the first unanswered question, else where it stands). */
export function stepLine(b: Brief | null, fallback: string): { lead: string | null; text: string } {
  if (!b) return { lead: null, text: fallback };
  const open = b.asked.find((a) => !a.answered);
  const first = b.standing.split(/(?<=[.!?])\s+/)[0] ?? b.standing;
  return { lead: STEP_WORDS[b.step.kind], text: open ? `asked "${open.text.replace(/[?.]+$/, "")}", not answered yet` : first };
}

/** "today", "1 day late", "3 days late", "tomorrow", "in 4 days". */
export function dueShort(dueDay: string, today: string): string {
  const n = Math.round((Date.parse(dueDay) - Date.parse(today)) / 86_400_000);
  if (n === 0) return "today";
  if (n < 0) return `${-n} day${n === -1 ? "" : "s"} late`;
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

/** "$14.2k", "$850". */
export const shortMoney = (n: number | null) => (n === null ? null : n >= 1000 ? `$${(Math.round(n / 100) / 10).toLocaleString("en-CA")}k` : `$${Math.round(n)}`);

export type SummaryItem = { kind: StepKind | "quote" | null; done: boolean };
const KIND_WORDS: Record<StepKind | "quote", [string, string]> = {
  text: ["1 text", "texts"],
  email: ["1 email", "emails"],
  call: ["1 call", "calls"],
  visit: ["1 visit to book", "visits to book"],
  quote: ["1 quote to write", "quotes to write"],
  close: ["1 to close out", "to close out"],
  wait: ["1 to wait on", "to wait on"],
};
const ORDER: (StepKind | "quote")[] = ["text", "email", "call", "visit", "quote", "close", "wait"];

/**
 * The sentence at the top (Albert: "Follows the filter"): "Joey, 6 people today: 2 texts, 1 call, 1 visit to book.
 * 2 done." Everyone reads "The team". Counts Reach today only.
 */
export function summaryLine(who: string, items: SummaryItem[]): { text: string; done: string | null } {
  const name = who === "Everyone" ? "The team" : who;
  if (!items.length) return { text: `${name}, nobody needs you today.`, done: null };
  const counts = new Map<StepKind | "quote", number>();
  let other = 0;
  for (const i of items) {
    if (i.kind) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
    else other++;
  }
  const parts = ORDER.filter((k) => counts.get(k)).map((k) => (counts.get(k) === 1 ? KIND_WORDS[k][0] : `${counts.get(k)} ${KIND_WORDS[k][1]}`));
  if (other) parts.push(`${other} to look at`);
  const done = items.filter((i) => i.done).length;
  return { text: `${name}, ${items.length} ${items.length === 1 ? "person" : "people"} today: ${parts.join(", ")}.`, done: done ? `${done} done.` : null };
}
