import type { LineInput, OptionTotals } from "@/lib/calc";
import type { Message } from "@/lib/conversation/thread";
import type { GhlContact } from "@/lib/ghl/types";
import type { StairMethod, StairType } from "@/lib/quick/stairs";

export type QuoteLine = LineInput & {
  id: string;
  /** Where the price came from: a Rate Card row, a Stair Item, a catalogue product, a Stair Profile's preset (2026-10-20), or typed in. */
  sourceKind: "rate" | "stair" | "product" | "profile" | "manual";
  sourceId: string | null;
  /** Rate Card labour type and specification, for lines priced from the card. */
  labourType: string | null;
  spec: string | null;
  description: string | null;
  area: string | null;
  uom: string | null;
  contractor: string | null;
  /** The Install Material picked for a Rate Card line (2026-10-16); null/absent = none. */
  materialId?: string | null;
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
  /** "Standard" or "Premium" (Quote Options → Service Level); null when never set, which reads as Standard. */
  serviceLevel: string | null;
  /** The contractor picked for the whole option (Quote Options → Crew); null when none. */
  crew: string | null;
  lines: QuoteLine[];
  /** Airtable's own option rollups, for the parity check. */
  airtable: Partial<OptionTotals>;
};

/** The quote a version belongs to (Quotes table): its number and its links to GHL and the job files. */
export type QuoteLink = {
  quoteRecordId: string;
  quoteNumber: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
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
  /** Sending: Airtable's own reason this version must not be sent (a measured version exists), if any. */
  sendBlock: string | null;
  /** The customer link's secret, once the version has been sent (or a send was started). */
  customerToken: string | null;
  sentBy: string | null;
  sentTo: string | null;
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
  /** Install Materials group the job's material can be swapped within (2026-10-16); absent = no swap. */
  materialGroup?: string | null;
  /** The Install Material `rate` and `cost` already include. */
  defaultMaterialId?: string | null;
};

/** An Install Material: cost and customer price per unit of the job (per sqft on a sqft row). */
export type MaterialRow = { id: string; name: string; group: string; cost: number | null; price: number | null };

export type StairRow = {
  id: string;
  name: string;
  category: string | null;
  size: string | null;
  rate: number;
  cost: number | null;
};

/** Which Stair Items a profile expands into, by record id, and what each list is counted per. */
export type StairTemplate = { perStep: string[]; perStaircase: string[]; perOpenSide: string[]; perHandrailFt: string[]; perSpindle: string[]; perPost: string[] };

/** A Stair Profiles row (2026-10-20): a preset-priced staircase for the preliminary, and the builder's template. */
export type StairProfileRow = {
  id: string;
  name: string;
  type: StairType;
  method: StairMethod;
  /** The step count the preset assumes; the builder's default. */
  steps: number | null;
  price: number;
  cost: number | null;
  sort: number;
  template: StairTemplate;
};

export type RateCard = { rates: RateRow[]; stairs: StairRow[]; materials?: MaterialRow[]; profiles?: StairProfileRow[] };

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

export type StartResult =
  | { ok: true; versionId: string; reused: boolean; /** The quick form's lines went in, so the quote opens for review, not in the editor. */ filled: boolean }
  /** `duplicates`: GHL already has someone with the phone or email typed for a "new" customer. */
  | { ok: false; message: string; duplicates?: FoundCustomer[] };

/* ---------- the customer's conversation (src/lib/quotes/conversation.ts) ---------- */

export type ConversationResult =
  | {
      ok: true;
      /** Oldest first, people's and automated messages together; the screen decides what to show. */
      messages: Message[];
      /** Older messages exist in GHL past what was read. */
      more: boolean;
      /** The conversation in GHL's inbox, where staff reply; null when the contact has none yet. */
      ghlUrl: string | null;
    }
  | { ok: false; reason: "not-configured" | "error"; message: string };

/* ---------- linking a quote to a job (src/lib/quotes/link.ts) ---------- */

export type JobChoice = {
  id: string;
  name: string | null;
  status: string | null;
  pipeline: string | null;
  stage: string | null;
  statusChangedAt: string | null;
  siteAddress: string | null;
  hasCompanyCam: boolean;
  /** Lost or abandoned lately: linking sets it back to open. */
  reopen: boolean;
  /** Another quote is already on this job. */
  takenBy: string | null;
};

export type JobChoices = { ok: true; canLink: boolean; choices: JobChoice[] } | { ok: false; message: string };

export type LinkJobResult = { ok: true } | { ok: false; message: string };

export type ConfirmAddressResult = { ok: true } | { ok: false; message: string };

/* ---------- sending a quote (src/lib/quotes/send.ts) ---------- */

export type SendResult =
  | { ok: true; link: string; sentTo: string[]; warning: string | null }
  | { ok: false; message: string; problems?: string[] };
