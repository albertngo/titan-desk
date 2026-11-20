"use server";

import { loadSendHistory } from "@/lib/quotes/sendHistoryLoad";

/** The send history on All quotes (2026-11-20), read when a quote row is opened. Read only; the loader checks the quoter allowlist. */
export async function sendHistoryAction(quoteRecordId: string) {
  return loadSendHistory(String(quoteRecordId ?? ""));
}
