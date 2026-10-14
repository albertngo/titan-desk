import { matchQuote, type QuoteKeys } from "./match";
import type { Parsed } from "./newQuote";

/**
 * The booking step (Make 3453735, "Estimate Scheduled"): when an appointment is booked, find the
 * quote for that opportunity or start one, so the OneDrive folder and the CompanyCam project are
 * named after it. Pure, no I/O; src/lib/quotes/booking.ts carries it out.
 *
 * - The opportunity's quote is used as it is.
 * - A quote for the same customer that has no opportunity yet (started before GHL had one) is
 *   linked to this opportunity. One on a different opportunity never is (match.ts).
 * - Two such quotes and nobody can tell which: a new quote is started and the note says so,
 *   rather than guessing.
 * - Otherwise a new quote is started.
 */

const GHL_ID = /^[A-Za-z0-9]{6,40}$/;
const isGhlId = (v: unknown): v is string => typeof v === "string" && GHL_ID.test(v);

export type BookingRequest = { opportunityId: string; contactId: string };

export function parseBooking(raw: unknown): Parsed<BookingRequest> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!isGhlId(r.opportunityId)) return { ok: false, message: "opportunityId is missing or isn't a GHL id." };
  if (!isGhlId(r.contactId)) return { ok: false, message: "contactId is missing or isn't a GHL id." };
  return { ok: true, value: { opportunityId: r.opportunityId, contactId: r.contactId } };
}

export type BookingDecision =
  | { kind: "existing"; id: string }
  | { kind: "link"; id: string }
  | { kind: "create"; note: string | null };

export function bookingDecision(
  quotes: QuoteKeys[],
  probe: { opportunityId: string; contactId: string; phone: string | null; email: string | null },
): BookingDecision {
  const m = matchQuote(quotes, probe);
  if (m.kind === "none") return { kind: "create", note: null };
  if (m.kind === "one") return m.by === "opportunity" ? { kind: "existing", id: m.id } : { kind: "link", id: m.id };
  // Two quotes on one opportunity shouldn't happen; use the first rather than make a third.
  if (m.by === "opportunity") return { kind: "existing", id: m.ids[0] };
  return { kind: "create", note: `${m.ids.length} earlier quotes match this customer by ${m.by}; check whether one of them is this job.` };
}

export type BookingLinks = { quoteRecordId: string; opportunityId: string; folderUrl: string | null; companyCamUrl: string | null };

const url = (v: unknown): string | null => {
  if (typeof v !== "string" || v.length > 600) return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
};

/** After Make has made the folder and the CompanyCam project, their links go on the quote. */
export function parseBookingLinks(raw: unknown): Parsed<BookingLinks> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (typeof r.quoteRecordId !== "string" || !/^rec[A-Za-z0-9]{14}$/.test(r.quoteRecordId)) return { ok: false, message: "quoteRecordId isn't a record id." };
  if (!isGhlId(r.opportunityId)) return { ok: false, message: "opportunityId is missing or isn't a GHL id." };
  const folderUrl = url(r.folderUrl);
  const companyCamUrl = url(r.companyCamUrl);
  if (!folderUrl && !companyCamUrl) return { ok: false, message: "Send folderUrl or companyCamUrl (https)." };
  return { ok: true, value: { quoteRecordId: r.quoteRecordId, opportunityId: r.opportunityId, folderUrl, companyCamUrl } };
}
