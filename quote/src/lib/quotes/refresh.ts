import "server-only";
import { requireQuoter } from "@/lib/auth";
import { updateRecord } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { getContact, ghlConfigured, opportunityProject, opportunitySite } from "@/lib/ghl/client";
import { customerRefresh, projectPickup, type CustomerPatch } from "@/lib/link/refresh";
import { getQuote } from "./load";
import type { Quote } from "./types";

/**
 * GHL owns the customer, so a quote's name, phone, email and address are copies. Each time a
 * quote is opened this reads GHL and brings the copy up to date (rules: src/lib/link/refresh.ts).
 * GHL being slow or down never stops the quote opening: the copy is shown as it was.
 */

const FIELD: Record<keyof CustomerPatch, string> = {
  firstName: QUOTE.firstName,
  lastName: QUOTE.lastName,
  phone: QUOTE.phone,
  email: QUOTE.email,
  siteAddress: QUOTE.siteAddress,
  siteCity: QUOTE.siteCity,
  addressStatus: QUOTE.addressStatus,
};

/** GHL gets three seconds; past that the quote opens with the copy it has. */
const WAIT_MS = 3000;
const slow = () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("GHL too slow")), WAIT_MS));

export async function refreshFromGhl(quote: Quote): Promise<Quote> {
  await requireQuoter();
  const link = quote.link;
  if (!link?.ghlContactId || !ghlConfigured()) return quote;

  const confirmed = link.addressStatus === "Confirmed";
  // An accepted quote waits for its Notion project (2026-10-27): the PP number Make writes back onto the opportunity.
  const accepted = Boolean(link.contractVersionId || (quote.acceptance && !quote.acceptance.cancelled));
  const awaitingProject = accepted && Boolean(link.ghlOpportunityId) && !link.projectNumber;
  let patch: CustomerPatch;
  let project: Record<string, string> = {};
  try {
    const [contact, site, live] = await Promise.race([
      Promise.all([
        getContact(link.ghlContactId),
        confirmed && link.ghlOpportunityId ? opportunitySite(link.ghlOpportunityId) : Promise.resolve(null),
        awaitingProject ? opportunityProject(link.ghlOpportunityId!) : Promise.resolve(null),
      ]),
      slow(),
    ]);
    patch = customerRefresh(
      { ...link, siteAddress: quote.siteAddress, siteCity: quote.siteCity },
      contact,
      site,
    );
    const pp = projectPickup(link, live);
    project = {
      ...(pp.projectNumber ? { [QUOTE.projectNumber]: pp.projectNumber } : {}),
      ...(pp.notionProjectUrl ? { [QUOTE.notionProjectUrl]: pp.notionProjectUrl } : {}),
    };
  } catch {
    return quote;
  }
  const keys = Object.keys(patch) as (keyof CustomerPatch)[];
  if (keys.length === 0 && Object.keys(project).length === 0) return quote;

  try {
    await updateRecord(T.quotes, link.quoteRecordId, { ...Object.fromEntries(keys.map((k) => [FIELD[k], patch[k]])), ...project });
    // With its PP number the accepted version is won: the project exists (2026-10-27).
    if (project[QUOTE.projectNumber] && quote.status === "Accepted") await updateRecord(T.versions, quote.id, { [VERSION.status]: "Won" });
  } catch {
    return quote;
  }
  return (await getQuote(quote.id)) ?? quote;
}
