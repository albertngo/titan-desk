import "server-only";
import { createRecord, listRecords } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { versionLabel } from "@/lib/link/identity";
import type { QuoteKeys } from "@/lib/link/match";
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

/** Every quote's matching keys (match.ts), for finding a customer's earlier quote. */
export async function allQuoteKeys(): Promise<QuoteKeys[]> {
  const rows = await listRecords(T.quotes, { fields: [QUOTE.ghlOpportunityId, QUOTE.ghlContactId, QUOTE.phone, QUOTE.email] });
  return rows.map((r) => ({
    id: r.id,
    opportunityId: str(r.fields[QUOTE.ghlOpportunityId]),
    contactId: str(r.fields[QUOTE.ghlContactId]),
    phone: str(r.fields[QUOTE.phone]),
    email: str(r.fields[QUOTE.email]),
  }));
}

/** Version 1 of a new quote, as a Draft. */
export async function firstVersion(quoteId: string, quoteNo: string, basis: "Preliminary" | "Measured" = "Preliminary"): Promise<string> {
  const v = await createRecord(T.versions, {
    [VERSION.label]: versionLabel(quoteNo, 1),
    [VERSION.version]: 1,
    [VERSION.status]: "Draft",
    [VERSION.basis]: basis,
    [VERSION.showHst]: true,
    [VERSION.quote]: [quoteId],
  });
  return v.id;
}
