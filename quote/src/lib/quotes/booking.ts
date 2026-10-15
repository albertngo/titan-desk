import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createRecord, getRecord, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { getContact, ghlConfigured, opportunitiesForContact } from "@/lib/ghl/client";
import { bookingDecision, opportunityUpdateBody, parseBooking, parseBookingLinks, pickOpportunity, sameSiteAs } from "@/lib/link/booking";
import { buildBookingOpportunity } from "@/lib/link/ghlRequest";
import { displayPhone, normalizeEmail, quoteNumber } from "@/lib/link/identity";
import { addressStatus } from "@/lib/link/lead";
import { makeConfigured, sendToGhl } from "@/lib/make/client";
import { bookingQuotes, firstVersion } from "./records";
import { ids, num, str } from "./values";

/**
 * The booking step, called by Make 3453735 through /api/booking when an appointment is confirmed,
 * not by a person: there is no sign-in, so every export checks the shared QUOTE_BOOKING_KEY first.
 * Make sends the contact id and, when GHL has one, the opportunity id; everything else is read
 * from GHL with the app's own read token, never taken from the request. Rules: link/booking.ts.
 */

export type BookingResult =
  | {
      ok: true;
      created: boolean;
      quoteRecordId: string;
      quoteNumber: string;
      /** The shared name: the folder and the CompanyCam project take it. */
      name: string;
      versionId: string | null;
      /** The job's opportunity, or null when staff must pick one (several were open). */
      opportunityId: string | null;
      /** JSON for Make's PUT /opportunities/{opportunityId}: quote number and confirmed site. Null when there is nothing to send. */
      opportunityBody: string | null;
      /** Already made on an earlier booking of this job: Make skips making them again. */
      folderUrl: string | null;
      companyCamUrl: string | null;
      needsLinking: boolean;
      /** The same address is confirmed on the customer's other open job. */
      warning: string | null;
      note: string | null;
    }
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

/** Find the job an appointment is for, find or start its quote, confirm the site, and return the name its folder and CompanyCam project take. */
export async function bookQuote(key: string | null, raw: unknown): Promise<BookingResult> {
  if (!bookingKeyOk(key)) return { ok: false, status: 401, message: "Wrong or missing key." };
  const parsed = parseBooking(raw);
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message };
  const { contactId } = parsed.value;
  if (!ghlConfigured()) return { ok: false, status: 503, message: "GHL reading isn't set up on this deployment, so the customer can't be read." };

  const [contact, opps, quotes] = await Promise.all([getContact(contactId), opportunitiesForContact(contactId), bookingQuotes()]);
  if (!contact) return { ok: false, status: 404, message: "That contact isn't in GHL." };
  if (parsed.value.opportunityId && !opps.some((o) => o.id === parsed.value.opportunityId)) {
    return { ok: false, status: 409, message: "That opportunity doesn't belong to this contact." };
  }
  const job = pickOpportunity(parsed.value.opportunityId, opps.filter((o) => o.status === "open"));
  const opportunityId = job.kind === "use" ? job.id : null;

  // The contact's address now is where this appointment is: the confirmed site (2026-10-15).
  const site = { address: contact.address, city: contact.city };
  const siteFields = site.address ? { [QUOTE.siteAddress]: site.address, [QUOTE.siteCity]: site.city, [QUOTE.addressStatus]: "Confirmed" } : {};
  const decision = bookingDecision(quotes, { opportunityId, contactId, phone: contact.phone, email: contact.email });
  const notes: string[] = [];
  if (decision.kind === "create" && decision.note) notes.push(decision.note);
  if (job.kind === "several") notes.push(`booked while the contact had ${job.ids.length} open opportunities; link this quote to the right one.`);

  let record;
  if (decision.kind === "create") {
    record = await createRecord(T.quotes, {
      [QUOTE.firstName]: contact.firstName,
      [QUOTE.lastName]: contact.lastName,
      [QUOTE.customerName]: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.name,
      [QUOTE.phone]: contact.phone ? displayPhone(contact.phone) : null,
      [QUOTE.email]: normalizeEmail(contact.email),
      [QUOTE.addressStatus]: addressStatus(null, false),
      ...siteFields,
      [QUOTE.linkStatus]: opportunityId ? "Linked" : "Needs linking",
      [QUOTE.ghlContactId]: contactId,
      [QUOTE.ghlOpportunityId]: opportunityId,
      [QUOTE.pipeline]: "Project",
      [QUOTE.notes]: appendNote(null, ["started at booking.", ...notes].join(" ")),
    });
  } else {
    const current = await getRecord(T.quotes, decision.id);
    const fields = {
      ...siteFields,
      ...(decision.kind === "link" && opportunityId ? { [QUOTE.ghlOpportunityId]: opportunityId, [QUOTE.ghlContactId]: contactId, [QUOTE.linkStatus]: "Linked" } : {}),
      ...(decision.kind === "link" || notes.length ? { [QUOTE.notes]: appendNote(current.fields[QUOTE.notes], [decision.kind === "link" ? "linked at booking." : "booked.", ...notes].join(" ")) } : {}),
    };
    record = Object.keys(fields).length > 0 ? await updateRecord(T.quotes, decision.id, fields) : current;
  }

  const quoteNo = str(record.fields[QUOTE.quoteNumber]) ?? quoteNumber(num(record.fields[QUOTE.seq]) ?? 0);
  const name = str(record.fields[QUOTE.displayName]) ?? quoteNo;
  let versionId = ids(record.fields[QUOTE.versions]).at(-1) ?? null;
  // A quote started here gets its version 1 now, so it shows in the app's list; it is for the site visit.
  if (!versionId) versionId = await firstVersion(record.id, quoteNo, "Measured");

  // No opportunity at all: make one now, carrying the quote number and the site.
  let finalOpp = opportunityId;
  let opportunityBody: string | null = opportunityId ? opportunityUpdateBody(quoteNo, site) : null;
  if (job.kind === "none" && makeConfigured()) {
    try {
      const sent = await sendToGhl(buildBookingOpportunity({ contactId, quoteNumber: quoteNo, name, site }));
      finalOpp = sent.opportunityId;
      opportunityBody = null; // created with everything on it already
      record = await updateRecord(T.quotes, record.id, {
        [QUOTE.ghlOpportunityId]: sent.opportunityId,
        [QUOTE.linkStatus]: "Linked",
        [QUOTE.notes]: appendNote(record.fields[QUOTE.notes], "GHL opportunity created at booking (Sales pipeline, Meeting Scheduled)."),
      });
    } catch (e) {
      const failed = record;
      record = await updateRecord(T.quotes, failed.id, {
        [QUOTE.notes]: appendNote(failed.fields[QUOTE.notes], `couldn't create the GHL opportunity at booking (${e instanceof Error ? e.message.slice(0, 120) : "error"}); create it and link it.`),
      }).catch(() => failed);
    }
  }

  const twins = sameSiteAs(quotes, { quoteId: record.id, contactId }, site.address);
  const warning = twins.length ? `Same address as ${twins.join(", ")}: check this booking's address is right.` : null;
  if (warning) await updateRecord(T.quotes, record.id, { [QUOTE.notes]: appendNote(record.fields[QUOTE.notes], warning) }).catch(() => undefined);

  const mine = quotes.find((q) => q.id === record.id);
  return {
    ok: true,
    created: decision.kind === "create",
    quoteRecordId: record.id,
    quoteNumber: quoteNo,
    name,
    versionId,
    opportunityId: finalOpp,
    opportunityBody,
    folderUrl: mine?.folderUrl ?? null,
    companyCamUrl: mine?.companyCamUrl ?? null,
    needsLinking: !finalOpp,
    warning,
    note: notes.join(" ") || null,
  };
}

/** Record the folder and CompanyCam links Make made, on the quote it asked about. */
export async function recordBookingLinks(key: string | null, raw: unknown): Promise<LinksResult> {
  if (!bookingKeyOk(key)) return { ok: false, status: 401, message: "Wrong or missing key." };
  const parsed = parseBookingLinks(raw);
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message };
  const { quoteRecordId, contactId, folderUrl, companyCamUrl } = parsed.value;
  const current = await getRecord(T.quotes, quoteRecordId);
  // Only a quote that belongs to this contact can be changed this way.
  if (str(current.fields[QUOTE.ghlContactId]) !== contactId) return { ok: false, status: 409, message: "That quote belongs to a different contact." };
  await updateRecord(T.quotes, quoteRecordId, {
    ...(folderUrl ? { [QUOTE.folderUrl]: folderUrl } : {}),
    ...(companyCamUrl ? { [QUOTE.companyCamUrl]: companyCamUrl } : {}),
  });
  return { ok: true };
}
