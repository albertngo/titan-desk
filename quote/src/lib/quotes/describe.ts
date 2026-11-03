import "server-only";
import { AirtableError, getRecord, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { requireQuoter } from "@/lib/auth";
import { cleanDescription } from "./group";
import { str } from "./values";
import type { SaveDescriptionResult } from "./types";

/**
 * The quote's description (Albert, 2026-11-03: several AMICA quotes for one customer at one building, a
 * different unit or rooms each): one field, Quotes → Quote Description, a staff-only label shown under the
 * customer on All quotes. Saved only if the field still holds what the page opened with, so one person never
 * overwrites another's; cleaned on the server, never taken as sent. Nothing else on the quote changes, and the
 * customer copy never carries it.
 */

const REC_ID = /^rec[A-Za-z0-9]{14}$/;

export async function saveDescription(quoteRecordId: string, seen: string, input: unknown): Promise<SaveDescriptionResult> {
  await requireQuoter();
  if (!REC_ID.test(quoteRecordId)) return { ok: false, message: "This quote isn't in Airtable any more." };
  let current: string | null;
  try {
    const rec = await getRecord(T.quotes, quoteRecordId);
    current = cleanDescription(str(rec.fields[QUOTE.description]));
  } catch (e) {
    if (e instanceof AirtableError && (e.status === 404 || e.status === 403)) return { ok: false, message: "This quote isn't in Airtable any more." };
    return { ok: false, message: `Airtable couldn't be read (${e instanceof Error ? e.message.slice(0, 120) : "error"}), so nothing was saved. Try again.` };
  }
  if ((current ?? "") !== (cleanDescription(seen) ?? "")) {
    return { ok: false, message: `Someone changed this quote's description since the page opened (it now says "${current ?? "nothing"}"). Reload and try again.` };
  }
  const saved = cleanDescription(input);
  if (saved === current) return { ok: true, saved };
  try {
    await updateRecord(T.quotes, quoteRecordId, { [QUOTE.description]: saved });
  } catch (e) {
    return { ok: false, message: `The description wasn't saved (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Try again.` };
  }
  return { ok: true, saved };
}
