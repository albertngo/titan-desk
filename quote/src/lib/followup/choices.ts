/**
 * The choice log, the step override and the note for the brief (Albert, 2026-11-22; vault
 * 05_decisions/2026-11-22-follow-up-morning-brief: "if we want to suggest something or simply click snooze or something
 * else from the suggested, do you learn from this? how do you note the decisions we make daily for learning?").
 *
 * Pure, no I/O. Kept on Quotes → Follow Up beside the rest of the state (src/lib/followup/plan.ts). Every button on
 * Follow up records what the brief suggested, the score, which group the row sat in, and what was actually done. Going
 * against the suggestion may carry one tapped reason. The next brief is told the customer's note and their last
 * overrides; a change to the rules or the score is only ever proposed, as a vault decision Albert approves.
 * Tested in tests/followup.choices.test.ts.
 */

import { STEP_KINDS, type StepKind } from "./brief";

/** What staff did. `ghl` = opened the customer in GHL from the row; `link` = copied the booking link. */
export const DIDS = ["send", "touch", "snooze", "postpone", "lost", "step", "ghl", "link"] as const;
export type Did = (typeof DIDS)[number];

/** The one-tap reasons for going against a suggestion (Albert, 2026-11-22). */
export const REASONS = ["Not ready", "Prefer to call", "Wrong read", "Already handled"] as const;
export type Reason = (typeof REASONS)[number];

/** Where the row sat on the morning brief when it was acted on. */
export const GROUPS = ["reach", "time", "later"] as const;
export type Group = (typeof GROUPS)[number];

export type Choice = {
  at: string;
  by: string;
  /** The brief's step when the button was pressed; null when there was no brief. */
  suggested: StepKind | null;
  score: number | null;
  group: Group | null;
  did: Did;
  /** For did = "step": the step staff picked instead. */
  step?: StepKind;
  reason?: Reason;
  /** For did = "send": how much of the draft was changed, 0 (as written) to 1. */
  edited?: number;
};

/** Staff picked the step themselves; it holds while the brief is written from the same conversation (`basedOn`). */
export type StepOverride = { kind: StepKind; at: string; by: string; basedOn: string };

/** The standing note every brief for this customer must follow ("wife decides, evenings only"). */
export type CustomerNote = { text: string; at: string; by: string; cleared?: true };

export const CHOICES_KEPT = 60;
export const NOTE_MAX = 300;
/** Overrides on this customer the next brief is told about (Albert: "Note + last 3 overrides"). */
export const OVERRIDES_IN_BRIEF = 3;
/** A reason lands on the newest choice by the same person, if it is this recent. */
export const REASON_WINDOW_MS = 15 * 60_000;

const isTime = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const isStep = (v: unknown): v is StepKind => (STEP_KINDS as readonly string[]).includes(String(v));
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => ((list as readonly string[]).includes(String(v)) ? (v as T) : undefined);
const words = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : undefined);

export function parseChoices(v: unknown): Choice[] {
  if (!Array.isArray(v)) return [];
  const out: Choice[] = [];
  for (const c of v as Record<string, unknown>[]) {
    if (!c || !isTime(c.at)) continue;
    const did = oneOf(DIDS, c.did);
    if (!did) continue;
    const step = isStep(c.step) ? c.step : undefined;
    const reason = oneOf(REASONS, c.reason);
    out.push({
      at: c.at,
      by: words(c.by, 200) ?? "unknown",
      suggested: isStep(c.suggested) ? c.suggested : null,
      score: typeof c.score === "number" && Number.isFinite(c.score) ? Math.round(c.score) : null,
      group: oneOf(GROUPS, c.group) ?? null,
      did,
      ...(step ? { step } : {}),
      ...(reason ? { reason } : {}),
      ...(typeof c.edited === "number" ? { edited: Math.max(0, Math.min(1, c.edited)) } : {}),
    });
  }
  return out.slice(-CHOICES_KEPT);
}

export function parseStepOverride(v: unknown): StepOverride | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  return isStep(d.kind) && isTime(d.at) && typeof d.basedOn === "string" ? { kind: d.kind, at: d.at, by: words(d.by, 200) ?? "unknown", basedOn: d.basedOn } : null;
}

export function parseNote(v: unknown): CustomerNote | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (!isTime(d.at)) return null;
  // A cleared note is kept as one, so an older note on another of the customer's quotes doesn't come back.
  if (d.cleared === true) return { text: "", at: d.at, by: words(d.by, 200) ?? "unknown", cleared: true };
  const text = words(d.text, NOTE_MAX);
  return text ? { text, at: d.at, by: words(d.by, 200) ?? "unknown" } : null;
}

/** The note as typed, cleaned; null clears it. */
export const cleanCustomerNote = (v: unknown): string | null => words(v, NOTE_MAX) ?? null;

/** What the page tells the server about the row when a button is pressed. Only a log, so anything odd is dropped. */
export function cleanContext(v: unknown): { score: number | null; group: Group | null } {
  const d = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { score: typeof d.score === "number" && Number.isFinite(d.score) ? Math.max(0, Math.min(100, Math.round(d.score))) : null, group: oneOf(GROUPS, d.group) ?? null };
}

/**
 * What following the suggestion looks like. A text or email step is followed by sending, logging a follow-up or
 * opening GHL to do it there; a call by logging it or opening GHL; a visit by copying the link (or any contact); wait
 * by snoozing or postponing; close by Lost or Postpone. Picking another step is always going against it.
 */
const FOLLOWS: Record<StepKind, readonly Did[]> = {
  text: ["send", "touch", "ghl"],
  email: ["send", "touch", "ghl"],
  call: ["touch", "ghl"],
  visit: ["link", "touch", "ghl", "send"],
  wait: ["snooze", "postpone"],
  close: ["lost", "postpone"],
};

/** True when what was done isn't what the brief suggested. No suggestion, nothing to go against. */
export function isOverride(c: Pick<Choice, "suggested" | "did" | "step">): boolean {
  if (!c.suggested) return false;
  if (c.did === "step") return c.step !== c.suggested;
  return !FOLLOWS[c.suggested].includes(c.did);
}

export const withChoice = <S extends { choices?: Choice[] }>(s: S, c: Choice): S => ({ ...s, choices: [...(s.choices ?? []), c].slice(-CHOICES_KEPT) });

/** The tapped reason on the newest choice `by` made, if it went against the suggestion and is recent; else unchanged (null). */
export function withReason<S extends { choices?: Choice[] }>(s: S, by: string, reason: Reason, now: Date): S | null {
  const list = s.choices ?? [];
  const i = list.length - 1;
  const last = list[i];
  if (!last || last.by.toLowerCase() !== by.toLowerCase() || !isOverride(last) || now.getTime() - Date.parse(last.at) > REASON_WINDOW_MS) return null;
  const next = [...list];
  next[i] = { ...last, reason };
  return { ...s, choices: next };
}

const STEP_SAY: Record<StepKind, string> = { call: "a call", text: "a text", email: "an email", visit: "booking a visit", wait: "waiting", close: "closing it out" };
const DID_SAY: Record<Did, string> = { send: "sent the draft", touch: "logged a follow-up", snooze: "snoozed it", postpone: "postponed it", lost: "marked it lost", step: "picked another step", ghl: "opened GHL", link: "copied the booking link" };

/** One line per override for the brief's prompt: "2026-11-20: suggested a text; staff picked a call (Prefer to call)". */
export function overrideLines(choices: Choice[], n = OVERRIDES_IN_BRIEF): string[] {
  return choices
    .filter(isOverride)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-n)
    .map((c) => `${c.at.slice(0, 10)}: suggested ${STEP_SAY[c.suggested as StepKind]}; staff ${c.did === "step" && c.step ? `picked ${STEP_SAY[c.step]}` : DID_SAY[c.did]}${c.reason ? ` (${c.reason})` : ""}`);
}

/** The newest of several notes (a customer's quotes each may carry one), cleared ones included; null when none. */
export const newestNote = (notes: (CustomerNote | null | undefined)[]): CustomerNote | null =>
  notes.filter((n): n is CustomerNote => Boolean(n)).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;

/** The note to show and to give the brief: the newest, unless the newest is a clearing. */
export const liveNote = (n: CustomerNote | null): CustomerNote | null => (n && !n.cleared ? n : null);

/* ---------- Performance (admins): where staff go against the suggestions ---------- */

export type Outcome = "won" | "lost" | "open";
export type OverrideStat = { label: string; acted: number; overrides: number; reasons: Partial<Record<Reason | "No reason", number>> };
export type OverrideStats = {
  bySuggested: OverrideStat[];
  byPerson: OverrideStat[];
  byBand: OverrideStat[];
  /** Quotes closed so far: those with at least one override against those without. */
  outcomes: { overridden: { won: number; lost: number; open: number }; followed: { won: number; lost: number; open: number } };
  edited: { sends: number; asWritten: number };
};

export const SCORE_BANDS: readonly { from: number; label: string }[] = [
  { from: 0, label: "Under 8" },
  { from: 8, label: "8 to 19" },
  { from: 20, label: "20 to 32" },
  { from: 33, label: "33 or more" },
];
const bandOf = (score: number) => [...SCORE_BANDS].reverse().find((b) => score >= b.from)?.label ?? SCORE_BANDS[0].label;

/** The override report over quotes' choice logs since `since` (ISO). `name` turns an email into a first name. */
export function overrideStats(quotes: { choices: Choice[]; outcome: Outcome }[], since: string, name: (email: string) => string): OverrideStats {
  const tally = new Map<string, Map<string, OverrideStat>>([["s", new Map()], ["p", new Map()], ["b", new Map()]]);
  const add = (k: string, label: string, c: Choice) => {
    const m = tally.get(k) as Map<string, OverrideStat>;
    const row = m.get(label) ?? { label, acted: 0, overrides: 0, reasons: {} };
    row.acted++;
    if (isOverride(c)) {
      row.overrides++;
      const r = c.reason ?? "No reason";
      row.reasons[r] = (row.reasons[r] ?? 0) + 1;
    }
    m.set(label, row);
  };
  const outcomes = { overridden: { won: 0, lost: 0, open: 0 }, followed: { won: 0, lost: 0, open: 0 } };
  const edited = { sends: 0, asWritten: 0 };
  for (const q of quotes) {
    const cs = q.choices.filter((c) => c.at >= since && c.suggested);
    if (!cs.length) continue;
    for (const c of cs) {
      add("s", c.suggested as StepKind, c);
      add("p", name(c.by), c);
      if (c.score !== null) add("b", bandOf(c.score), c);
      if (c.did === "send") {
        edited.sends++;
        if ((c.edited ?? 0) <= 0.1) edited.asWritten++;
      }
    }
    outcomes[cs.some(isOverride) ? "overridden" : "followed"][q.outcome]++;
  }
  const list = (k: string, order?: readonly string[]) => [...(tally.get(k) as Map<string, OverrideStat>).values()].sort((a, b) => (order ? order.indexOf(a.label) - order.indexOf(b.label) : a.label.localeCompare(b.label)));
  return { bySuggested: list("s", STEP_KINDS), byPerson: list("p"), byBand: list("b", SCORE_BANDS.map((b) => b.label)), outcomes, edited };
}
