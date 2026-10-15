import "server-only";
import { requireQuoter } from "@/lib/auth";
import { updateRecord } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { getContact, ghlConfigured, opportunitySite } from "@/lib/ghl/client";
import { customerRefresh, type CustomerPatch } from "@/lib/link/refresh";
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
  let patch: CustomerPatch;
  try {
    const [contact, site] = await Promise.race([
      Promise.all([
        getContact(link.ghlContactId),
        confirmed && link.ghlOpportunityId ? opportunitySite(link.ghlOpportunityId) : Promise.resolve(null),
      ]),
      slow(),
    ]);
    patch = customerRefresh(
      { ...link, siteAddress: quote.siteAddress, siteCity: quote.siteCity },
      contact,
      site,
    );
  } catch {
    return quote;
  }
  const keys = Object.keys(patch) as (keyof CustomerPatch)[];
  if (keys.length === 0) return quote;

  try {
    await updateRecord(T.quotes, link.quoteRecordId, Object.fromEntries(keys.map((k) => [FIELD[k], patch[k]])));
  } catch {
    return quote;
  }
  return (await getQuote(quote.id)) ?? quote;
}
