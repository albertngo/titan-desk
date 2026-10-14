import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createRecord, getRecord, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { getContact, ghlConfigured, opportunitySite } from "@/lib/ghl/client";
import { bookingDecision, parseBooking, parseBookingLinks } from "@/lib/link/booking";
import { displayPhone, normalizeEmail, quoteNumber } from "@/lib/link/identity";
import { addressStatus } from "@/lib/link/lead";
import { allQuoteKeys, firstVersion } from "./records";
import { ids, num, str } from "./values";

/**
 * The booking step, called by Make 3453735 ("Estimate Scheduled") through /api/booking, not by
 * a person: there is no sign-in, so every export checks the shared QUOTE_BOOKING_KEY first.
 * Customer details are read from GHL with the app's own read token, never taken from the
 * request: Make sends only the two ids.
 */

export type BookingResult =
  | { ok: true; created: boolean; quoteRecordId: string; quoteNumber: string; name: string; versionId: string | null; note: string | null }
  | { ok: false; status: number; message: string };

export type LinksResult = { ok: true } | { ok: false; status: number; message: string };

/** Constant-time check of the key Make sends. No key configured means the step is off. */
export function bookingKeyOk(given: string | null): boolean {
  const want = process.env.QUOTE_BOOKING_KEY;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const appendNote = (old: unknown, line: string) => [str(old), `${today()}: ${line}`].filter(Boolean).join("\n");

/** Find or start the quote for a booked opportunity, and return the name its folder and CompanyCam project take. */
export async function bookQuote(key: string | null, raw: unknown): Promise<BookingResult> {
  if (!bookingKeyOk(key)) return { ok: false, status: 401, message: "Wrong or missing key." };
  const parsed = parseBooking(raw);
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message };
  const { opportunityId, contactId } = parsed.value;
  if (!ghlConfigured()) return { ok: false, status: 503, message: "GHL reading isn't set up on this deployment, so the customer can't be read." };

  const [contact, site, quotes] = await Promise.all([getContact(contactId), opportunitySite(opportunityId), allQuoteKeys()]);
  if (!contact) return { ok: false, status: 404, message: "That contact isn't in GHL." };
  if (!site) return { ok: false, status: 404, message: "That opportunity isn't in GHL." };

  // Booking is when the site is confirmed: the opportunity's Project Address is the site.
  const siteFields = site.address
    ? { [QUOTE.siteAddress]: site.address, [QUOTE.siteCity]: site.city ?? contact.city, [QUOTE.addressStatus]: "Confirmed" }
    : {};
  const decision = bookingDecision(quotes, { opportunityId, contactId, phone: contact.phone, email: contact.email });

  let record;
  if (decision.kind === "create") {
    record = await createRecord(T.quotes, {
      [QUOTE.firstName]: contact.firstName,
      [QUOTE.lastName]: contact.lastName,
      [QUOTE.customerName]: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.name,
      [QUOTE.phone]: contact.phone ? displayPhone(contact.phone) : null,
      [QUOTE.email]: normalizeEmail(contact.email),
      [QUOTE.siteAddress]: contact.address,
      [QUOTE.siteCity]: contact.city,
      [QUOTE.addressStatus]: addressStatus(contact.address, false),
      ...siteFields,
      [QUOTE.linkStatus]: "Linked",
      [QUOTE.ghlContactId]: contactId,
      [QUOTE.ghlOpportunityId]: opportunityId,
      [QUOTE.pipeline]: "Project",
      [QUOTE.notes]: appendNote(null, `started at booking.${decision.note ? ` ${decision.note}` : ""}`),
    });
  } else {
    const current = await getRecord(T.quotes, decision.id);
    const fields = {
      ...siteFields,
      ...(decision.kind === "link"
        ? {
            [QUOTE.ghlOpportunityId]: opportunityId,
            [QUOTE.ghlContactId]: contactId,
            [QUOTE.linkStatus]: "Linked",
            [QUOTE.notes]: appendNote(current.fields[QUOTE.notes], "linked to its GHL opportunity at booking."),
          }
        : {}),
    };
    record = Object.keys(fields).length > 0 ? await updateRecord(T.quotes, decision.id, fields) : current;
  }

  const quoteNo = str(record.fields[QUOTE.quoteNumber]) ?? quoteNumber(num(record.fields[QUOTE.seq]) ?? 0);
  let versionId = ids(record.fields[QUOTE.versions]).at(-1) ?? null;
  // A quote started here gets its version 1 now, so it shows in the app's list; it is for the site visit.
  if (!versionId) versionId = await firstVersion(record.id, quoteNo, "Measured");
  return {
    ok: true,
    created: decision.kind === "create",
    quoteRecordId: record.id,
    quoteNumber: quoteNo,
    name: str(record.fields[QUOTE.displayName]) ?? quoteNo,
    versionId,
    note: decision.kind === "create" ? decision.note : null,
  };
}

/** Record the folder and CompanyCam links Make made, on the quote it asked about. */
export async function recordBookingLinks(key: string | null, raw: unknown): Promise<LinksResult> {
  if (!bookingKeyOk(key)) return { ok: false, status: 401, message: "Wrong or missing key." };
  const parsed = parseBookingLinks(raw);
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message };
  const { quoteRecordId, opportunityId, folderUrl, companyCamUrl } = parsed.value;
  const current = await getRecord(T.quotes, quoteRecordId);
  // Only the quote that belongs to this opportunity can be changed this way.
  if (str(current.fields[QUOTE.ghlOpportunityId]) !== opportunityId) return { ok: false, status: 409, message: "That quote belongs to a different opportunity." };
  await updateRecord(T.quotes, quoteRecordId, {
    ...(folderUrl ? { [QUOTE.folderUrl]: folderUrl } : {}),
    ...(companyCamUrl ? { [QUOTE.companyCamUrl]: companyCamUrl } : {}),
  });
  return { ok: true };
}
