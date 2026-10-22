import "server-only";
import { createRecord, listRecords } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { versionLabel } from "@/lib/link/identity";
import type { SiteQuote } from "@/lib/link/booking";
import type { QuoteKeys } from "@/lib/link/match";
import { authorFields, type Person } from "./history";
import { ids, str } from "./values";

/**
 * Shared steps for starting a quote, used by the New quote screen (start.ts) and the booking
 * step (booking.ts). No auth check here: each caller checks first (requireQuoter, or the
 * booking key). tests/boundary.test.ts keeps every other file from importing this one.
 */

export type ExistingQuote = { quoteId: string; quoteNumber: string | null; versionId: string | null };

/** Quotes that already have an opportunity, keyed by it. The newest version id is the last link. */
export async function quotesByOpportunity(): Promise<Map<string, ExistingQuote>> {
  const rows = await listRecords(T.quotes, {
    fields: [QUOTE.ghlOpportunityId, QUOTE.quoteNumber, QUOTE.versions],
    filterByFormula: `{${QUOTE.ghlOpportunityId}}!=''`,
  });
  const out = new Map<string, ExistingQuote>();
  for (const r of rows) {
    const opp = str(r.fields[QUOTE.ghlOpportunityId]);
    if (opp) out.set(opp, { quoteId: r.id, quoteNumber: str(r.fields[QUOTE.quoteNumber]), versionId: ids(r.fields[QUOTE.versions]).at(-1) ?? null });
  }
  return out;
}

/** Every quote with its matching keys and its site, for the booking step. */
export async function bookingQuotes(): Promise<(QuoteKeys & SiteQuote & { folderUrl: string | null; companyCamUrl: string | null })[]> {
  const rows = await listRecords(T.quotes, {
    fields: [QUOTE.ghlOpportunityId, QUOTE.ghlContactId, QUOTE.phone, QUOTE.email, QUOTE.quoteNumber, QUOTE.siteAddress, QUOTE.addressStatus, QUOTE.projectNumber, QUOTE.folderUrl, QUOTE.companyCamUrl],
  });
  return rows.map((r) => ({
    id: r.id,
    opportunityId: str(r.fields[QUOTE.ghlOpportunityId]),
    contactId: str(r.fields[QUOTE.ghlContactId]),
    phone: str(r.fields[QUOTE.phone]),
    email: str(r.fields[QUOTE.email]),
    quoteNumber: str(r.fields[QUOTE.quoteNumber]),
    siteAddress: str(r.fields[QUOTE.siteAddress]),
    addressStatus: str(r.fields[QUOTE.addressStatus]),
    won: Boolean(str(r.fields[QUOTE.projectNumber])),
    folderUrl: str(r.fields[QUOTE.folderUrl]),
    companyCamUrl: str(r.fields[QUOTE.companyCamUrl]),
  }));
}

/**
 * Version 1 of a new quote, as a Draft. `by` is the signed-in person who made it, recorded on the
 * version (2026-10-22); the booking step has no person and leaves it blank.
 */
export async function firstVersion(quoteId: string, quoteNo: string, basis: "Preliminary" | "Measured" = "Preliminary", by: Person | null = null): Promise<string> {
  const v = await createRecord(T.versions, {
    [VERSION.label]: versionLabel(quoteNo, 1),
    [VERSION.version]: 1,
    [VERSION.status]: "Draft",
    [VERSION.basis]: basis,
    [VERSION.showHst]: true,
    [VERSION.quote]: [quoteId],
    ...(by ? authorFields(by, new Date(), `created v1 (${basis.toLowerCase()})`, null, true) : {}),
  });
  return v.id;
}
