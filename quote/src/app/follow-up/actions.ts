"use server";

import { dueCountNow, logTouch, markLost, postponeFollowUp, sendFollowUp, setAutoFollowUps, snoozeFollowUp, writeBrief, type BriefResult, type FollowUpResult } from "@/lib/quotes/followup";

/** The Follow up page's buttons (2026-11-07). Each checks the quoter allowlist inside and re-reads the quote first. */

export async function followedUpAction(quoteRecordId: string, seen: string, note: string): Promise<FollowUpResult> {
  return logTouch(String(quoteRecordId ?? ""), String(seen ?? ""), note);
}

export async function snoozeAction(quoteRecordId: string, seen: string, days: number): Promise<FollowUpResult> {
  return snoozeFollowUp(String(quoteRecordId ?? ""), String(seen ?? ""), days);
}

export async function postponeAction(quoteRecordId: string, seen: string, until: string, note: string): Promise<FollowUpResult> {
  return postponeFollowUp(String(quoteRecordId ?? ""), String(seen ?? ""), until, note);
}

export async function lostAction(quoteRecordId: string, seen: string, reasonId: string, note: string): Promise<FollowUpResult> {
  return markLost(String(quoteRecordId ?? ""), String(seen ?? ""), reasonId, note);
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
export async function sendFollowUpAction(quoteRecordId: string, seen: string, text: string, subject: string | null): Promise<FollowUpResult> {
  return sendFollowUp(String(quoteRecordId ?? ""), String(seen ?? ""), text, subject);
}

/** This quote's own Auto follow-ups switch. */
export async function autoFollowUpsAction(quoteRecordId: string, seen: string, on: boolean): Promise<FollowUpResult> {
  return setAutoFollowUps(String(quoteRecordId ?? ""), String(seen ?? ""), on === true);
}
