"use server";

import { logTouch, markLost, postponeFollowUp, snoozeFollowUp, type FollowUpResult } from "@/lib/quotes/followup";

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
