import type { LineInput, OptionTotals } from "@/lib/calc";
import type { Placement, PlacementPipeline } from "@/lib/link/linkJob";
import type { Message } from "@/lib/conversation/thread";
import type { GhlContact } from "@/lib/ghl/types";
import type { Acceptance } from "@/lib/accept/plan";
import type { PaymentSchedule } from "@/lib/pricing/schedule";
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
  /** The Rate Card row's Material Group (2026-11-06, a lookup): set and no `materialId` = the glue isn't picked. */
  materialGroup?: string | null;
  /** Quote Lines → Material Unit Price / Cost (2026-11-06): the glue as typed; null = the card's. */
  materialPrice?: number | null;
  materialCost?: number | null;
  /** The Stair Item's Category (Quote Lines → Stair Category, 2026-10-28), for grouping the Stairs section; display only. */
  stairCategory?: string | null;
  /** The Stair Item's Customer Wording (Quote Lines → Stair Customer Wording, 2026-11-02): customer copy only. */
  customerWording?: string | null;
  clientNote: string | null;
  sortOrder: number | null;
  /** Airtable's own Line Total / Line Cost, for the per-line parity check. */
  airtableTotal: number | null;
  airtableCost: number | null;
};

/** What an option quotes (Albert, 2026-10-28): stairs are quoted apart from flooring, and a customer takes one of each. */
export type Scope = "Flooring" | "Stairs";

/** The part of the home an option covers (2026-10-30). Options in one Part are alternatives. See src/lib/quotes/scope.ts. */
export type Part = "Main floor" | "Upstairs" | "Basement" | "Main stairs" | "Basement stairs";
export const SCOPES: Scope[] = ["Flooring", "Stairs"];

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
  /** Quote Options → Private Line Name (2026-10-22): the customer's one row for the Private section; null = "Additional work". */
  privateLabel?: string | null;
  /** Quote Options → Scope (2026-10-28): "Flooring" or "Stairs"; null = worked out from the lines (see optionScope). */
  scope?: Scope | null;
  /** Quote Options → Part (2026-10-30); null = the option's scope stands for it. */
  part?: Part | null;
  /** Quote Options → Not Offered (2026-10-30): kept on the quote, left off what the customer is sent. */
  notOffered?: boolean;
  /** Quote Options → Charge HST (2026-11-04): this option's own HST; absent = the version's Show HST. See optionHst(). */
  showHst?: boolean;
  /** Quote Options → Sqft Check OK (2026-11-06): the "install/material" square feet OK'd outside the 10-15% band. */
  sqftOk?: string | null;
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
  /** Quotes → Quote Description (2026-11-03): staff's short label for the quote, shown on All quotes. Absent reads as none. */
  description?: string | null;
  /** Quotes → Contract Version (2026-10-27): the version that is the contract now; null before acceptance. */
  contractVersionId?: string | null;
  /** Quotes → Rooms (2026-10-27), exactly as stored: the Rooms tab's log, read with parseRooms(). Absent reads as empty. */
  rooms?: string;
  /** Quotes → Site Sheet (2026-10-28), exactly as stored; read with parseStored(). Absent reads as empty. */
  siteSheet?: string;
  /** Quotes → Site Sheet Photos, with addresses fresh from this read. */
  siteSheetPhotos?: { url: string; name: string }[];
  /** Quotes → Flooring Sheet (2026-11-03), exactly as stored; read with parseFloorStored(). Absent reads as empty. */
  floorSheet?: string;
  /** Quotes → Flooring Sheet Photos, with addresses fresh from this read. */
  floorSheetPhotos?: { url: string; name: string }[];
  /** Quotes → Payouts (2026-11-04), exactly as stored; read with parsePayouts(). Absent reads as none. */
  payouts?: string;
};

/** A CompanyCam photo as the Site sheet tab's picker shows it (2026-11-03): no address it could be downloaded from. */
/** `web` is the plain full-size image, for a sheet's preview (2026-11-03; CompanyCam's own "web" copy is only 400 px). */
export type CamSheetPhoto = { id: string; thumb: string; web: string; pageUrl: string | null; at: string | null; by: string | null; description: string | null; tags: string[]; sheet: boolean };
export type CamSheetPhotosResult = { ok: true; photos: CamSheetPhoto[]; more: boolean } | { ok: false; message: string };

export type QuoteActivity = {
  tracked: boolean;
  openedCount: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  pdfDownloads: number;
  activityLog: string | null;
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
  /** Quote Versions → Discount Reason (2026-10-22): why, in the customer's words; prints beside the Discount row. */
  discountReason?: string | null;
  /** Quote Versions → Itemised Pricing (2026-10-22). False or absent = lump sum, the default: one price, no line prices. */
  itemised?: boolean;
  /** Quote Versions → Payment Schedule (2026-10-27); null or absent = 35 / 35 / balance. */
  schedule?: PaymentSchedule | null;
  /** Quote Versions → Acceptance (2026-10-27): the customer's yes, once there is one. */
  acceptance?: Acceptance | null;
  /** Quote Versions → Change No (2026-10-27): 1, 2, … on a change made after acceptance; null otherwise. */
  changeNo?: number | null;
  /** Quote Versions → Supersedes, resolved (2026-10-28): the version number this one was made from; null for v1. */
  fromVersion?: number | null;
  /** Quote Versions → Supersedes (2026-10-30): the id of the version this one was made from; null for v1. */
  fromVersionId?: string | null;
  validUntil: string | null;
  sentAt: string | null;
  /** Sending: Airtable's own reason this version must not be sent (a measured version exists), if any. */
  sendBlock: string | null;
  /** The customer link's secret, once the version has been sent (or a send was started). */
  customerToken: string | null;
  sentBy: string | null;
  /** Who worked on this version (2026-10-22): Quote Versions → Created By (app), Last Edited By/At, Edit Log. */
  createdBy?: string | null;
  lastEditedBy?: string | null;
  /** ISO timestamp. */
  lastEditedAt?: string | null;
  editLog?: string | null;
  /** Open tracking (2026-10-27): what the customer did with the link. `tracked` = sent since tracking began, so its GHL comments go. */
  activity?: QuoteActivity;
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
  /** The Install Material a line starts with; its price and cost are added to `rate` and `cost` (labour only). */
  defaultMaterialId?: string | null;
  /** Rate Card → Customer Wording (2026-11-06): the line's name for this work; absent = "Labor Type | Specification". */
  wording?: string | null;
};

/** An Install Material: cost and customer price per unit of the job (per sqft on a sqft row). */
export type MaterialRow = { id: string; name: string; group: string; cost: number | null; price: number | null; wording?: string | null };

export type StairRow = {
  id: string;
  name: string;
  category: string | null;
  size: string | null;
  rate: number;
  cost: number | null;
  /** Labor Cost alone (2026-11-04), for a contractor's payout card: `cost` adds the Material Cost. Absent on older fixtures. */
  labourCost?: number | null;
  /** Stair Items → Unit (2026-11-04): steps / sets / ft / pcs, or null for the number alone. */
  unit?: string | null;
};

/** Which Stair Items a profile expands into, by record id, and what each list is counted per. */
export type StairTemplate = {
  perStep: string[];
  /** 2026-11-02: each step type's own piece (Step (2 Side Close), Pie Shape Step…); optional so older fixtures read. */
  perBoxed?: string[];
  perOpenSide: string[];
  perCurved?: string[];
  perStaircase: string[];
  perHandrailFt: string[];
  /** 2026-11-02: counted per foot of nosing, per landing; optional so older fixtures read. */
  perNosingFt?: string[];
  perLanding?: string[];
  perSpindle: string[];
  perPost: string[];
};

/** What a preset staircase assumes beyond its steps (2026-11-02): blank in Airtable reads as 0, a blank boxed count as null (the rest of the steps). */
export type StairPreset = { boxedSteps: number | null; openSideSteps: number; curvedSteps: number; handrailFt: number; nosingFt: number; landings: number; spindles: number; posts: number };

/**
 * A Stair Profiles row (2026-10-20): a preset staircase for the preliminary and the builder's template.
 * Since 2026-11-02 the preliminary expands it into Stair Item lines from the template and the preset
 * counts; `price` and `cost` are the old stored GHL figures, kept only for lines made before.
 */
export type StairProfileRow = {
  id: string;
  name: string;
  type: StairType;
  method: StairMethod;
  /** The step count the preset assumes; the builder's default. */
  steps: number | null;
  price: number | null;
  cost: number | null;
  sort: number;
  template: StairTemplate;
  preset: StairPreset;
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

/**
 * For a new opportunity (2026-11-03): `placements` are the project pipelines and their stages staff
 * may pick (never Won), empty when GHL's pipeline list couldn't be read; `startAt` is where the card
 * starts, Lead Qualification at the quote's timing stage, or null to make staff pick.
 */
export type JobChoices =
  | { ok: true; canLink: boolean; placements: PlacementPipeline[]; startAt: Placement | null; choices: JobChoice[] }
  | { ok: false; message: string };

export type LinkJobResult = { ok: true } | { ok: false; message: string };

export type ConfirmAddressResult = { ok: true } | { ok: false; message: string };

/* ---------- the Rooms tab (src/lib/quotes/rooms.ts) ---------- */

/** `saved` is the field's new text, so the page carries on from it without reloading. */
export type SaveRoomsResult = { ok: true; saved: string } | { ok: false; message: string };

/** The quote's description (src/lib/quotes/describe.ts): what is stored now, null when cleared. */
export type SaveDescriptionResult = { ok: true; saved: string | null } | { ok: false; message: string };

/* ---------- the Site sheet tab (src/lib/quotes/sitesheet.ts) ---------- */

/** `saved` is the field's new text; `photos` the attachments as they now are. */
export type SiteSheetResult = { ok: true; saved: string; photos?: { url: string; name: string }[]; note?: string } | { ok: false; message: string };

/* ---------- Address arrived (src/lib/quotes/address.ts) ---------- */

/**
 * Why an address in their messages was not filled: two different ones ("several"), no opportunity to
 * send it through yet ("unlinked"), or the customer has more than one quote waiting for one ("jobs").
 */
export type AddressHeldReason = "several" | "unlinked" | "jobs";

export type AddressScanQuote = { quoteNumber: string | null; customer: string | null; /** The newest version, for a link to the quote page. */ versionId: string | null };

export type AddressScanResult =
  | {
      ok: true;
      /** Read from the customer's messages and put on their blank GHL contact; the quote now says Unconfirmed. */
      filled: (AddressScanQuote & { address: string })[];
      /** Brought up to date from an address already on the contact. */
      synced: number;
      /** An address is in their messages but was not filled, and why. */
      held: (AddressScanQuote & { reason: AddressHeldReason })[];
      checked: number;
    }
  | { ok: false; message: string };

/* ---------- sending a quote (src/lib/quotes/send.ts) ---------- */

/** Sending a sent quote's link again (2026-10-30). */
export type ResendResult = { ok: true; sentTo: string[]; pdf: boolean; warning: string | null } | { ok: false; message: string; problems?: string[] };

export type SendResult =
  | { ok: true; link: string; sentTo: string[]; warning: string | null }
  | { ok: false; message: string; problems?: string[] };
