/**
 * Lead temperature and address status. Pure, no I/O. Decided by Albert on 2026-10-14.
 */

/** "When are you planning to do the project?", asked on every preliminary. Same names as the Airtable choices. */
export const TIMINGS = ["Within 1 month", "1 to 3 months", "3+ months", "Not sure"] as const;
export type Timing = (typeof TIMINGS)[number];

export const isTiming = (v: unknown): v is Timing => typeof v === "string" && (TIMINGS as readonly string[]).includes(v);

/** Stages in the GHL Leads pipeline. */
export type LeadStage = "Hot" | "Warm" | "Cold";

export function stageFor(timing: Timing): LeadStage {
  if (timing === "Within 1 month") return "Hot";
  if (timing === "1 to 3 months") return "Warm";
  return "Cold";
}

export const LEADS_PIPELINE = "Leads";

/**
 * The stage to put an opportunity in, or null to leave it alone. Only a new opportunity, or
 * one still in the Leads pipeline, is moved: an opportunity that has been booked or sent a
 * quote is never pulled back into Leads by a timing answer.
 */
export function stageToSet(timing: Timing, opp: { isNew: boolean; pipeline: string | null }): LeadStage | null {
  if (opp.isNew || opp.pipeline === LEADS_PIPELINE) return stageFor(timing);
  return null;
}

export const ADDRESS_STATUSES = ["No address", "Unconfirmed", "Confirmed"] as const;
export type AddressStatus = (typeof ADDRESS_STATUSES)[number];

/**
 * Confirmed: someone typed or confirmed this address for this quote (or it came from Notion
 * after Won). Unconfirmed: it was copied from the contact automatically and may be the site of
 * an earlier job. The app never treats an unconfirmed address as good enough to send a formal quote.
 */
export function addressStatus(address: string | null | undefined, confirmedForThisQuote: boolean): AddressStatus {
  if (!address?.trim()) return "No address";
  return confirmedForThisQuote ? "Confirmed" : "Unconfirmed";
}
