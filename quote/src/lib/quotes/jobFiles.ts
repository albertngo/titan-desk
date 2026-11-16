import "server-only";
import { requireQuoterPerson } from "@/lib/auth";
import { getRecord, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { ASK_MARK, bookedRunPayload, lastAsk } from "@/lib/link/booking";
import { bookedRunConfigured, startBookedRun } from "@/lib/make/client";
import { jobToken } from "./jobToken";
import { getQuote } from "./load";
import { str } from "./values";

/**
 * Create CompanyCam + folder (Albert, 2026-11-16: "a button there to officially 'create' the Ccam folder and run the
 * whole 'booked' process… But the address doesn't have to be set as confirmed"). Starts Make 3453735's booked steps for
 * one quote: the CompanyCam project, the OneDrive job folder with Project Expectations, the INQ/QE sheets, and the links
 * on the quote, the contact and the opportunity. The booking step answers for exactly this quote and changes nothing
 * on it (`fromApp()` in booking.ts): the site stays as it is, confirmed or not. Writes only Quotes → Notes here.
 */

export type JobFilesResult = { ok: true; message: string } | { ok: false; message: string };

/** One ask at a time: Make takes about half a minute, and a second run before the links land would make a second folder. */
const WAIT_MS = 15 * 60 * 1000;

export async function requestJobFiles(versionId: string): Promise<JobFilesResult> {
  const who = await requireQuoterPerson();
  if (!bookedRunConfigured()) return { ok: false, message: "Create CompanyCam + folder isn't switched on yet (Vercel needs the booking webhook's address)." };
  const quote = /^rec[A-Za-z0-9]{14}$/.test(versionId) ? await getQuote(versionId) : null;
  const link = quote?.link;
  if (!quote || !link) return { ok: false, message: "That quote couldn't be found." };
  if (link.folderUrl || link.companyCamUrl) return { ok: false, message: "This quote already has its CompanyCam project or job folder." };
  if (!link.ghlContactId) return { ok: false, message: "Link this quote to its GHL contact first: the run reads the customer from GHL." };
  if (!quote.siteAddress) return { ok: false, message: "Add the site address first: the CompanyCam project is made at it. It doesn't have to be confirmed." };
  const token = jobToken(link.quoteRecordId, link.ghlContactId);
  if (!token) return { ok: false, message: "Create CompanyCam + folder isn't switched on yet." };

  const record = await getRecord(T.quotes, link.quoteRecordId);
  const notes = str(record.fields[QUOTE.notes]);
  const last = lastAsk(notes);
  if (last !== null && Date.now() - last < WAIT_MS) return { ok: false, message: "Already asked for in the last 15 minutes. The links show on the quote when Make is done; reload in a minute." };

  await startBookedRun(
    bookedRunPayload({
      contactId: link.ghlContactId,
      opportunityId: link.ghlOpportunityId,
      quoteRecordId: link.quoteRecordId,
      token,
      name: quote.customerName,
      phone: link.phone,
      email: link.email,
      address: quote.siteAddress,
      city: quote.siteCity,
    }),
  );
  const line = `${new Date().toISOString()}: ${ASK_MARK} by ${who.name ?? who.email}, from the quote app (the site address was not confirmed).`;
  await updateRecord(T.quotes, link.quoteRecordId, { [QUOTE.notes]: [notes, line].filter(Boolean).join("\n") }).catch(() => undefined);
  return { ok: true, message: "Asked for. Make is making the CompanyCam project and the job folder; their links show here in about a minute." };
}
