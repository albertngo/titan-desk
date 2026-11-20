"use server";

import { loadSendHistory } from "@/lib/quotes/sendHistoryLoad";

/** Show history on All quotes (2026-11-20). Read only; the loader checks the quoter allowlist. */
export async function sendHistoryAction(quoteRecordId: string) {
  return loadSendHistory(String(quoteRecordId ?? ""));
}
