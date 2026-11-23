import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Create CompanyCam + folder (Albert, 2026-11-16): the signature the quote app puts on a booked run it starts, so the
 * booking step knows the quote it names came from the app. Keyed with QUOTE_BOOKING_KEY, which only the app and Make
 * hold; with no key there is no signature and the button is off.
 */

const sign = (key: string, quoteRecordId: string, contactId: string) => createHmac("sha256", key).update(`job-files:${quoteRecordId}:${contactId}`).digest("hex");

export function jobToken(quoteRecordId: string, contactId: string): string | null {
  const key = process.env.QUOTE_BOOKING_KEY;
  return key ? sign(key, quoteRecordId, contactId) : null;
}

export function jobTokenOk(token: string, quoteRecordId: string, contactId: string): boolean {
  const want = jobToken(quoteRecordId, contactId);
  if (!want) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
