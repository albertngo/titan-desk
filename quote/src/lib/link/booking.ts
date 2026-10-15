import { OPP_FIELDS, PROJECT_PIPELINE_IDS } from "@/lib/ghl/ids";
import { matchQuote, type QuoteKeys } from "./match";
import type { Parsed } from "./newQuote";

/**
 * The booking step (Make 3453735, fired when an appointment is confirmed): find the job the
 * appointment is for, find or start its quote, confirm the site, and return the name the OneDrive
 * folder and CompanyCam project take. Pure, no I/O; src/lib/quotes/booking.ts carries it out.
 *
 * Rules (Albert, 2026-10-15):
 * - Which job: the opportunity on the booking if GHL sent one that is still open (a returning
 *   customer's won or lost job never takes a new booking, 2026-10-15); else the contact's only open
 *   opportunity; with none, a new one is made in the Sales pipeline; with several, nobody guesses:
 *   the quote is started unlinked and flagged for staff.
 * - Only project pipelines hold jobs: a STORE order is never the job, whatever GHL sends (2026-10-15).
 * - Revived, not reopened: with no open opportunity but one lost or abandoned in the last 90 days,
 *   no new one is made: the booking may be that job coming back (stale workflows abandon a job
 *   without moving its stage). The quote is started unlinked and flagged, naming that job, and staff
 *   reopen it or confirm the work is new. A won job never counts: a new booking after a win is new work.
 * - Which quote: the opportunity's own; else the customer's quote that has no opportunity yet;
 *   one on a different opportunity never (match.ts). Two candidates: start a new one, say why.
 * - The site: the contact's address at the moment of booking is the confirmed site. Staff type
 *   the next appointment's address on the contact, which the booking texts read too.
 * - The same address already confirmed on the customer's other open job is flagged, not blocked:
 *   two jobs at one address is normal, a contact left on the last job's address is not.
 */

const GHL_ID = /^[A-Za-z0-9]{6,40}$/;
const isGhlId = (v: unknown): v is string => typeof v === "string" && GHL_ID.test(v);

export type BookingRequest = { opportunityId: string | null; contactId: string };

export function parseBooking(raw: unknown): Parsed<BookingRequest> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!isGhlId(r.contactId)) return { ok: false, message: "contactId is missing or isn't a GHL id." };
  // GHL sends an empty value when the appointment has no opportunity yet.
  const opp = typeof r.opportunityId === "string" ? r.opportunityId.trim() : "";
  if (opp && !isGhlId(opp)) return { ok: false, message: "opportunityId isn't a GHL id." };
  return { ok: true, value: { opportunityId: opp || null, contactId: r.contactId } };
}

// ---------- which job ----------

/** The opportunities that can be a job: those in the project pipelines, never a STORE order. */
export function projectJobs<T extends { pipelineId: string | null }>(opps: T[]): T[] {
  return opps.filter((o) => o.pipelineId !== null && PROJECT_PIPELINE_IDS.includes(o.pipelineId));
}

/**
 * Whether this job's folder and CompanyCam project already exist, so Make must not make them again:
 * the quote has their links, or (a job booked before the app) its opportunity has a CompanyCam URL.
 */
export function alreadyMade(quote: { folderUrl: string | null; companyCamUrl: string | null } | undefined, job: { companyCamUrl: string | null } | undefined): boolean {
  return Boolean(quote?.folderUrl || quote?.companyCamUrl || job?.companyCamUrl);
}

export type JobPick =
  | { kind: "use"; id: string; how: "booking" | "only-open" }
  | { kind: "none" }
  | { kind: "several"; ids: string[] }
  | { kind: "revived"; ids: string[] };

/**
 * `open` is the contact's opportunities with status open; `recentlyClosed` the ids of those lost or
 * abandoned lately (recentlyClosed()). One GHL sent that isn't open is ignored.
 */
export function pickOpportunity(given: string | null, open: { id: string }[], recentlyClosed: string[] = []): JobPick {
  if (given && open.some((o) => o.id === given)) return { kind: "use", id: given, how: "booking" };
  if (open.length === 1) return { kind: "use", id: open[0].id, how: "only-open" };
  if (open.length > 1) return { kind: "several", ids: open.map((o) => o.id) };
  return recentlyClosed.length ? { kind: "revived", ids: recentlyClosed } : { kind: "none" };
}

export const REVIVE_WINDOW_DAYS = 90;

/** Ids of opportunities lost or abandoned within the last 90 days, newest first. Won ones never count. */
export function recentlyClosed(opps: { id: string; status: string | null; statusChangedAt: string | null }[], now: Date): string[] {
  const since = now.getTime() - REVIVE_WINDOW_DAYS * 86_400_000;
  return opps
    .filter((o) => (o.status === "lost" || o.status === "abandoned") && Date.parse(o.statusChangedAt ?? "") >= since)
    .sort((a, b) => Date.parse(b.statusChangedAt ?? "") - Date.parse(a.statusChangedAt ?? ""))
    .map((o) => o.id);
}

// ---------- which quote ----------

export type BookingDecision =
  | { kind: "existing"; id: string }
  | { kind: "link"; id: string }
  | { kind: "create"; note: string | null };

/**
 * The quote for a known opportunity. With no opportunity (none yet, or several to choose from),
 * pass `opportunityId: null`: only quotes that have no opportunity either can then match.
 */
export function bookingDecision(
  quotes: QuoteKeys[],
  probe: { opportunityId: string | null; contactId: string; phone: string | null; email: string | null },
): BookingDecision {
  const pool = probe.opportunityId ? quotes : quotes.filter((q) => !q.opportunityId);
  const m = matchQuote(pool, probe);
  if (m.kind === "none") return { kind: "create", note: null };
  if (m.kind === "one") return m.by === "opportunity" ? { kind: "existing", id: m.id } : { kind: "link", id: m.id };
  // Two quotes on one opportunity shouldn't happen; use the first rather than make a third.
  if (m.by === "opportunity") return { kind: "existing", id: m.ids[0] };
  return { kind: "create", note: `${m.ids.length} earlier quotes match this customer by ${m.by}; check whether one of them is this job.` };
}

// ---------- the site ----------

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type SiteQuote = { id: string; quoteNumber: string | null; contactId: string | null; opportunityId: string | null; siteAddress: string | null; addressStatus: string | null; won: boolean };

/** Quote numbers of the customer's OTHER open jobs already confirmed at this address. */
export function sameSiteAs(quotes: SiteQuote[], me: { quoteId: string; contactId: string }, address: string | null): string[] {
  const a = norm(address);
  if (!a) return [];
  return quotes
    .filter((q) => q.id !== me.quoteId && q.contactId === me.contactId && !q.won && q.addressStatus === "Confirmed" && norm(q.siteAddress) === a)
    .map((q) => q.quoteNumber ?? q.id);
}

/**
 * The body Make sends to PUT /opportunities/{id} at booking: the quote number, and the confirmed
 * site when the contact has one. Never a blank: a missing address leaves the opportunity's alone.
 */
export function opportunityUpdateBody(quoteNumber: string, site: { address: string | null; city: string | null }): string {
  const fields = [
    { id: OPP_FIELDS.quoteNumber, field_value: quoteNumber },
    site.address ? { id: OPP_FIELDS.projectAddress, field_value: site.address } : null,
    site.address && site.city ? { id: OPP_FIELDS.projectCity, field_value: site.city } : null,
  ].filter((f) => f !== null);
  return JSON.stringify({ customFields: fields });
}

// ---------- the links Make sends back ----------

export type BookingLinks = { quoteRecordId: string; contactId: string; folderUrl: string | null; companyCamUrl: string | null };

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
  if (!isGhlId(r.contactId)) return { ok: false, message: "contactId is missing or isn't a GHL id." };
  const folderUrl = url(r.folderUrl);
  const companyCamUrl = url(r.companyCamUrl);
  if (!folderUrl && !companyCamUrl) return { ok: false, message: "Send folderUrl or companyCamUrl (https)." };
  return { ok: true, value: { quoteRecordId: r.quoteRecordId, contactId: r.contactId, folderUrl, companyCamUrl } };
}
