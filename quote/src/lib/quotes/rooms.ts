import "server-only";
import { AirtableError, getRecord, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { requireQuoter } from "@/lib/auth";
import { cleanRooms, roomsRaw, serializeRooms } from "@/lib/rooms/log";
import type { SaveRoomsResult } from "./types";

/**
 * Saving the Rooms tab (Albert, 2026-10-27): one field on the quote, Quotes → Rooms. The save
 * goes through only if the field still holds what the page opened with, so someone else's rooms
 * are never overwritten; the rooms are cleaned on the server (src/lib/rooms/log.ts), never taken
 * as sent. Nothing else on the quote changes.
 */

const REC_ID = /^rec[A-Za-z0-9]{14}$/;

export async function saveRooms(quoteRecordId: string, seen: string, input: unknown): Promise<SaveRoomsResult> {
  const email = await requireQuoter();
  if (!REC_ID.test(quoteRecordId)) return { ok: false, message: "This quote isn't in Airtable any more." };
  let current: string;
  try {
    const rec = await getRecord(T.quotes, quoteRecordId);
    current = roomsRaw(rec.fields[QUOTE.rooms]);
  } catch (e) {
    if (e instanceof AirtableError && (e.status === 404 || e.status === 403)) return { ok: false, message: "This quote isn't in Airtable any more." };
    return { ok: false, message: `Airtable couldn't be read (${e instanceof Error ? e.message.slice(0, 120) : "error"}), so nothing was saved. Try again.` };
  }
  if (current !== seen) {
    return { ok: false, message: "Someone else saved rooms on this quote since the page opened, so yours weren't saved. Copy what you typed, reload, and add it again." };
  }
  const saved = serializeRooms(cleanRooms(input), email, new Date().toISOString());
  try {
    await updateRecord(T.quotes, quoteRecordId, { [QUOTE.rooms]: saved });
  } catch (e) {
    return { ok: false, message: `The rooms weren't saved (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Try again.` };
  }
  return { ok: true, saved };
}
