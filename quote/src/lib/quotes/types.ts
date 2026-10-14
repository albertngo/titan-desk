import type { LineInput, OptionTotals } from "@/lib/calc";
import type { GhlContact } from "@/lib/ghl/types";

export type QuoteSummary = {
  id: string;
  quoteId: string | null;
  version: number | null;
  status: string | null;
  basis: string | null;
  customerName: string | null;
  siteCity: string | null;
  quoteNumber: string | null;
  linkStatus: string | null;
  addressStatus: string | null;
  optionCount: number;
  createdTime: string;
};

export type QuoteLine = LineInput & {
  id: string;
  /** Where the price came from: a Rate Card row, a Stair Item, a catalogue product, or typed in. */
  sourceKind: "rate" | "stair" | "product" | "manual";
  sourceId: string | null;
  /** Rate Card labour type and specification, for lines priced from the card. */
  labourType: string | null;
  spec: string | null;
  description: string | null;
  area: string | null;
  uom: string | null;
  contractor: string | null;
  clientNote: string | null;
  sortOrder: number | null;
  /** Airtable's own Line Total / Line Cost, for the per-line parity check. */
  airtableTotal: number | null;
  airtableCost: number | null;
};

export type QuoteOption = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number | null;
  recommended: boolean;
  lines: QuoteLine[];
  /** Airtable's own option rollups, for the parity check. */
  airtable: Partial<OptionTotals>;
};

/** The quote a version belongs to (Quotes table): its number and its links to GHL and the job files. */
export type QuoteLink = {
  quoteRecordId: string;
  quoteNumber: string | null;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  addressStatus: string | null;
  linkStatus: string | null;
  projectTiming: string | null;
  ghlContactId: string | null;
  ghlOpportunityId: string | null;
  folderUrl: string | null;
  companyCamUrl: string | null;
  projectNumber: string | null;
  notionProjectUrl: string | null;
};

/**
 * One VERSION of a quote, as its page shows it (the id is the Quote Versions record). The quote
 * it belongs to, with its number and links, is `link`.
 */
export type Quote = {
  id: string;
  quoteId: string | null;
  version: number | null;
  status: string | null;
  basis: string | null;
  showHst: boolean;
  /** Fraction, e.g. 0.11. */
  discountRate: number;
  validUntil: string | null;
  sentAt: string | null;
  notes: string | null;
  customerName: string | null;
  siteAddress: string | null;
  siteCity: string | null;
  link: QuoteLink | null;
  options: QuoteOption[];
  /** Lines on the quote that belong to no option: the old A/B/C format. */
  legacyLineCount: number;
};

/** One Rate Card row: one contractor's price for one labour type + specification. */
export type RateRow = {
  id: string;
  labourType: string;
  spec: string;
  contractor: string;
  uom: string | null;
  rate: number;
  cost: number;
  minCharge: number | null;
  defaultWaste: number | null;
};

export type StairRow = {
  id: string;
  name: string;
  category: string | null;
  size: string | null;
  rate: number;
  cost: number | null;
};

export type RateCard = { rates: RateRow[]; stairs: StairRow[] };

/* ---------- starting a quote (src/lib/quotes/start.ts) ---------- */

export type FoundOpportunity = {
  id: string;
  name: string | null;
  status: string | null;
  pipeline: string | null;
  stage: string | null;
  updatedAt: string | null;
  /** The quote already made for this opportunity, if any: one opportunity, one quote. */
  existing: { quoteNumber: string | null; versionId: string | null } | null;
};

export type FoundCustomer = { contact: GhlContact; opportunities: FoundOpportunity[] };

export type CustomerSearch =
  | { ok: true; customers: FoundCustomer[] }
  | { ok: false; reason: "not-configured" | "error"; message: string };

export type StartResult = { ok: true; versionId: string; reused: boolean } | { ok: false; message: string };
