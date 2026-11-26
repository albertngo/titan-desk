import "server-only";
import { listRecords } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { requireQuoter } from "@/lib/auth";
import { calendarEvents, ghlConfigured } from "@/lib/ghl/client";
import { BOOKING_CALENDAR_IDS } from "@/lib/ghl/ids";
import { apptsByContact, type ApptEvent, type QuoteAppts } from "./appts";
import { torontoDay } from "./group";
import { str } from "./values";

/**
 * Appointments on All quotes (Albert, 2026-11-26). Read only: the in-home and in-store booking calendars from a year
 * back to four months ahead, matched to each quote by its GHL contact. Asked by the list after it has drawn, so a slow
 * GHL never holds the page; kept five minutes so moving about the app doesn't ask again.
 */

const BACK_DAYS = 365;
const AHEAD_DAYS = 120;
/** GHL is asked in windows this long, both calendars side by side. */
const WINDOW_DAYS = 60;
const KEEP_MS = 5 * 60_000;

export type QuoteApptsResult = { ok: true; byQuote: Record<string, QuoteAppts>; today: string } | { ok: false; message: string };

let kept: { at: number; events: ApptEvent[] } | null = null;

async function readEvents(now: Date): Promise<ApptEvent[]> {
  if (kept && Date.now() - kept.at < KEEP_MS) return kept.events;
  const day = 86_400_000;
  const from = now.getTime() - BACK_DAYS * day;
  const to = now.getTime() + AHEAD_DAYS * day;
  const asks: Promise<ApptEvent[]>[] = [];
  for (let a = from; a < to; a += WINDOW_DAYS * day) {
    const b = Math.min(a + WINDOW_DAYS * day, to);
    for (const cal of [BOOKING_CALENDAR_IDS.inHome, BOOKING_CALENDAR_IDS.inStore]) asks.push(calendarEvents(cal, new Date(a), new Date(b)));
  }
  // A visit on a window's edge can come back twice; the same visit counts once either way.
  const events = (await Promise.all(asks)).flat();
  kept = { at: Date.now(), events };
  return events;
}

export async function quoteAppointments(): Promise<QuoteApptsResult> {
  await requireQuoter();
  if (!ghlConfigured()) return { ok: false, message: "GHL isn't set up here, so appointments can't be shown." };
  const now = new Date();
  let events: ApptEvent[];
  try {
    events = await readEvents(now);
  } catch (e) {
    console.error("quoteAppointments calendars", e);
    return { ok: false, message: "Appointments couldn't be read from GHL. Try again in a moment." };
  }
  const byContact = apptsByContact(events, now, torontoDay, BOOKING_CALENDAR_IDS);
  const quotes = await listRecords(T.quotes, { fields: [QUOTE.ghlContactId] });
  const byQuote: Record<string, QuoteAppts> = {};
  for (const q of quotes) {
    const a = byContact.get(str(q.fields[QUOTE.ghlContactId]) ?? "");
    if (a) byQuote[q.id] = a;
  }
  return { ok: true, byQuote, today: torontoDay(now) };
}
