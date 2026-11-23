"use server";

import { changeStep, dueCountNow, logChoice, logTouch, markLost, postponeFollowUp, sendFollowUp, setAutoFollowUps, setCustomerNote, setReason, snoozeFollowUp, writeBrief, type BriefResult, type FollowUpResult, type StepResult } from "@/lib/quotes/followup";

/**
 * The Follow up page's buttons (2026-11-07). Each checks the quoter allowlist inside and re-reads the quote first.
 * `ctx` (2026-11-22) is the row's score and group for the choice log; the server takes nothing else from it.
 */
type Ctx = { score: number | null; group: string | null } | null;

export async function followedUpAction(quoteRecordId: string, seen: string, note: string, ctx: Ctx = null): Promise<FollowUpResult> {
  return logTouch(String(quoteRecordId ?? ""), String(seen ?? ""), note, ctx);
}

export async function snoozeAction(quoteRecordId: string, seen: string, days: number, ctx: Ctx = null): Promise<FollowUpResult> {
  return snoozeFollowUp(String(quoteRecordId ?? ""), String(seen ?? ""), days, ctx);
}

export async function postponeAction(quoteRecordId: string, seen: string, until: string, note: string, ctx: Ctx = null): Promise<FollowUpResult> {
  return postponeFollowUp(String(quoteRecordId ?? ""), String(seen ?? ""), until, note, ctx);
}

export async function lostAction(quoteRecordId: string, seen: string, reasonId: string, note: string, ctx: Ctx = null): Promise<FollowUpResult> {
  return markLost(String(quoteRecordId ?? ""), String(seen ?? ""), reasonId, note, ctx);
}

/** The row's brief: the kept one when nothing has happened since, else a new one (step 2, 2026-11-07). */
export async function briefAction(quoteRecordId: string, force: boolean): Promise<BriefResult> {
  return writeBrief(String(quoteRecordId ?? ""), force === true);
}

/** The top bar's red count of quotes due now (2026-11-07). */
export async function dueCountAction(): Promise<number> {
  return dueCountNow();
}

/** Stage 1 (2026-11-09): send a measured quote's follow-up from the app, as written or edited. */
export async function sendFollowUpAction(quoteRecordId: string, seen: string, text: string, subject: string | null, ctx: Ctx = null): Promise<FollowUpResult> {
  return sendFollowUp(String(quoteRecordId ?? ""), String(seen ?? ""), text, subject, ctx);
}

/** This quote's own Auto follow-ups switch. */
export async function autoFollowUpsAction(quoteRecordId: string, seen: string, on: boolean): Promise<FollowUpResult> {
  return setAutoFollowUps(String(quoteRecordId ?? ""), String(seen ?? ""), on === true);
}

/** Staff pick the step (2026-11-22); the brief is rewritten for it. */
export async function changeStepAction(quoteRecordId: string, seen: string, kind: string, ctx: Ctx = null): Promise<StepResult> {
  return changeStep(String(quoteRecordId ?? ""), String(seen ?? ""), kind, ctx);
}

/** Open in GHL or Copy booking link pressed on the row, for the choice log (2026-11-22). */
export async function logChoiceAction(quoteRecordId: string, did: "ghl" | "link", ctx: Ctx = null): Promise<FollowUpResult> {
  return logChoice(String(quoteRecordId ?? ""), did, ctx);
}

/** The one-tap reason for going against the suggestion (2026-11-22). */
export async function reasonAction(quoteRecordId: string, reason: string): Promise<FollowUpResult> {
  return setReason(String(quoteRecordId ?? ""), reason);
}

/** The customer's standing note for the brief (2026-11-22). */
export async function noteAction(quoteRecordId: string, seen: string, text: string): Promise<FollowUpResult> {
  return setCustomerNote(String(quoteRecordId ?? ""), String(seen ?? ""), text);
}
