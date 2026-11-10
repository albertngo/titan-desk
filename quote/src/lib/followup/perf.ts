/**
 * Follow-up performance (Albert, 2026-11-10: "do you log how long a lead is in a certain state; and when we reply…
 * so that I can ask performance reviews"; "for me first. can you build me a dashboard?"). Pure, no I/O: the state
 * log kept on Quotes → Follow Up, reply gaps read from the GHL thread, and the per-person summary the Performance page
 * shows. Admin only (QUOTE_ADMIN_EMAILS). Tested in tests/followup.perf.test.ts.
 */

import type { Tier } from "./score";

/** One entry of a quote's state log. `tier`: the tier it moved into. `due`: the day it first fell due in a cycle. */
export type StateEvent = { at: string; kind: "tier"; tier: Tier; score: number } | { at: string; kind: "due"; day: string };

export const EVENTS_KEPT = 120;

export function parseEvents(v: unknown): StateEvent[] {
  if (!Array.isArray(v)) return [];
  const out: StateEvent[] = [];
  for (const e of v as Record<string, unknown>[]) {
    if (!e || typeof e.at !== "string" || Number.isNaN(Date.parse(e.at))) continue;
    if (e.kind === "tier" && (e.tier === "needs" || e.tier === "watch" || e.tier === "auto") && typeof e.score === "number") out.push({ at: e.at, kind: "tier", tier: e.tier, score: e.score });
    else if (e.kind === "due" && typeof e.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.day)) out.push({ at: e.at, kind: "due", day: e.day });
  }
  return out.slice(-EVENTS_KEPT);
}

/**
 * What to add to the log for a quote as it reads now: a tier event when the tier differs from the last one logged, and
 * a due event the first day it is due since its last follow-up. Empty = nothing changed.
 */
export function newEvents(log: StateEvent[], now: { at: string; tier: Tier; score: number; dueToday: string | null; lastTouch: string | null }): StateEvent[] {
  const add: StateEvent[] = [];
  const lastTier = [...log].reverse().find((e) => e.kind === "tier") as Extract<StateEvent, { kind: "tier" }> | undefined;
  if (!lastTier || lastTier.tier !== now.tier) add.push({ at: now.at, kind: "tier", tier: now.tier, score: now.score });
  if (now.dueToday) {
    const lastDue = [...log].reverse().find((e) => e.kind === "due") as Extract<StateEvent, { kind: "due" }> | undefined;
    const handledSince = !lastDue || (now.lastTouch !== null && now.lastTouch >= lastDue.day);
    if (handledSince && (!lastDue || lastDue.day !== now.dueToday)) add.push({ at: now.at, kind: "due", day: now.dueToday });
  }
  return add;
}

export type PerfMessage = { direction: "in" | "out"; channel: string; automated: boolean; at: string | null; callSeconds: number | null };

/**
 * Every customer message since `from`, with how long until a person on our side answered (a text, email or chat a
 * person sent, or a call that connected). A run of customer messages counts once, from the first. Null hours = not
 * answered yet.
 */
export function replyGaps(messages: PerfMessage[], from: string): { at: string; hours: number | null }[] {
  const real = messages.filter((m) => m.at && m.at >= from && !m.automated && m.channel !== "note" && m.channel !== "activity").sort((a, b) => (a.at as string).localeCompare(b.at as string));
  const out: { at: string; hours: number | null }[] = [];
  let waiting: string | null = null;
  for (const m of real) {
    const ours = m.direction === "out" && (m.channel !== "call" || (m.callSeconds ?? 0) > 0);
    if (m.direction === "in") {
      if (!waiting) waiting = m.at as string;
    } else if (ours && waiting) {
      out.push({ at: waiting, hours: Math.round(((Date.parse(m.at as string) - Date.parse(waiting)) / 3_600_000) * 10) / 10 });
      waiting = null;
    }
  }
  if (waiting) out.push({ at: waiting, hours: null });
  return out;
}

/** How a tier log reads in hours spent in each tier (the last one up to now). */
export function hoursInTiers(log: StateEvent[], now: Date): Record<Tier, number> {
  const tiers = log.filter((e): e is Extract<StateEvent, { kind: "tier" }> => e.kind === "tier");
  const out: Record<Tier, number> = { needs: 0, watch: 0, auto: 0 };
  tiers.forEach((e, i) => {
    const end = i + 1 < tiers.length ? Date.parse(tiers[i + 1].at) : now.getTime();
    out[e.tier] += Math.max(0, (end - Date.parse(e.at)) / 3_600_000);
  });
  return out;
}

/** Hours from first becoming Needs you to the next follow-up after it, per Needs you stint; null = not acted on yet. */
export function needsYouResponse(log: StateEvent[], touches: string[]): (number | null)[] {
  const sorted = [...touches].sort();
  return log
    .filter((e): e is Extract<StateEvent, { kind: "tier" }> => e.kind === "tier" && e.tier === "needs")
    .map((e) => {
      const t = sorted.find((x) => x >= e.at);
      return t ? Math.round(((Date.parse(t) - Date.parse(e.at)) / 3_600_000) * 10) / 10 : null;
    });
}

/** For each logged due day, how many days late the next follow-up was (0 = on the day); null = still not done. */
export function lateness(log: StateEvent[], touchDays: string[]): (number | null)[] {
  const sorted = [...touchDays].sort();
  return log
    .filter((e): e is Extract<StateEvent, { kind: "due" }> => e.kind === "due")
    .map((e) => {
      const t = sorted.find((d) => d >= e.day);
      return t ? Math.round((Date.parse(t) - Date.parse(e.day)) / 86_400_000) : null;
    });
}

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
};

export type PersonPerf = {
  person: string;
  replies: { count: number; medianHours: number | null; over24: number; waiting: number };
  onTime: { due: number; onDay: number; late: number; open: number; avgDaysLate: number | null };
  needsYou: { stints: number; medianHours: number | null; open: number; hours: Record<Tier, number> };
  outcomes: { sent: number; accepted: number; lost: number; postponed: number; winRate: number | null; wonValue: number; lostReasons: Record<string, number> };
};

export const emptyPerson = (person: string): PersonPerf => ({
  person,
  replies: { count: 0, medianHours: null, over24: 0, waiting: 0 },
  onTime: { due: 0, onDay: 0, late: 0, open: 0, avgDaysLate: null },
  needsYou: { stints: 0, medianHours: null, open: 0, hours: { needs: 0, watch: 0, auto: 0 } },
  outcomes: { sent: 0, accepted: 0, lost: 0, postponed: 0, winRate: null, wonValue: 0, lostReasons: {} },
});
