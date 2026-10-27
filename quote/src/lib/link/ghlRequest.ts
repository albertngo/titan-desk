import { CONTACT_ORIGIN_FIELD, CONTACT_TIMING_FIELD, GHL_LOCATION_ID, LEAD_STAGE_IDS, LEADS_PIPELINE_ID, MEETING_SCHEDULED_STAGE_ID, OPP_FIELDS, SALES_PIPELINE_ID } from "@/lib/ghl/ids";
import { normalizeEmail, normalizePhone } from "./identity";
import { stageToSet, TIMING_IN_GHL, type Timing } from "./lead";

/**
 * The one request the quote app sends to Make when a quote is created, so GHL gets the contact,
 * the opportunity, the quote number and the timing answer. Pure, no I/O: the app builds the
 * exact GHL request bodies here (tested), and Make only forwards them with its GHL connection.
 *
 * Three cases:
 * - "new-contact":     create the contact (never upsert: an upsert would silently merge into
 *                      and overwrite an existing contact), then the opportunity for it. The app
 *                      checks GHL for the same phone or email first.
 * - "new-opportunity": the contact exists; record the timing on it and create the opportunity.
 * - "link":            both exist; record the timing on the contact, put the quote number on
 *                      the opportunity, and move its stage only if it is still in the lead pipeline.
 *
 * In oppBody, the contact id of a contact Make has just created is written as CONTACT_ID_SLOT;
 * Make replaces it with the id GHL returned.
 */

export const CONTACT_ID_SLOT = "__CONTACT_ID__";

export type GhlMode = "new-contact" | "new-opportunity" | "link";

export type GhlRequest = {
  mode: GhlMode;
  contactId: string | null;
  opportunityId: string | null;
  /** JSON for POST /contacts/ (new-contact) or PUT /contacts/{id} (otherwise). */
  contactBody: string;
  /** JSON for POST /opportunities/ (new) or PUT /opportunities/{id} (link). */
  oppBody: string;
};

export type GhlRequestInput = {
  quoteNumber: string;
  /** The shared name, "Jane Doe - 1026 - Q-1234": becomes the opportunity's name. */
  opportunityName: string;
  timing: Timing;
  contactId: string | null;
  /** An existing opportunity to link, with the pipeline it is in now. */
  opportunity: { id: string; pipelineId: string | null } | null;
  /** Only for a brand-new customer. */
  newContact: { firstName: string | null; lastName: string | null; phone: string | null; email: string | null; address: string | null; city: string | null } | null;
  /** Site address, if known, for the opportunity's Project Address / City. */
  site: { address: string | null; city: string | null };
  /**
   * Where they found us, when picked (2026-10-27), and what an existing contact already has. It goes
   * into Quote Origin and Source only where those are blank; a new contact gets both.
   */
  origin?: string | null;
  existing?: { origin: string | null; source: string | null } | null;
};

/** Drops empty values so GHL never receives a blank that overwrites something. */
function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "")) as Partial<T>;
}

const oppFields = (quoteNumber: string, site: GhlRequestInput["site"]) =>
  [
    { id: OPP_FIELDS.quoteNumber, field_value: quoteNumber },
    site.address ? { id: OPP_FIELDS.projectAddress, field_value: site.address } : null,
    site.city ? { id: OPP_FIELDS.projectCity, field_value: site.city } : null,
  ].filter((x) => x !== null);

export function buildGhlRequest(i: GhlRequestInput): GhlRequest {
  // The origin fills blanks only: an existing contact's Quote Origin or Source is never overwritten (2026-10-27).
  const fillOrigin = Boolean(i.origin) && !i.existing?.origin;
  const fillSource = Boolean(i.origin) && !i.existing?.source;
  const timingField = [
    { id: CONTACT_TIMING_FIELD, value: TIMING_IN_GHL[i.timing] },
    ...(fillOrigin ? [{ id: CONTACT_ORIGIN_FIELD, value: i.origin! }] : []),
  ];
  const sourceField = fillSource ? { source: i.origin! } : {};

  if (i.opportunity) {
    if (!i.contactId) throw new Error("An opportunity is always linked through its contact.");
    const stage = stageToSet(i.timing, { isNew: false, pipelineId: i.opportunity.pipelineId }, LEADS_PIPELINE_ID);
    return {
      mode: "link",
      contactId: i.contactId,
      opportunityId: i.opportunity.id,
      contactBody: JSON.stringify({ ...sourceField, customFields: timingField }),
      oppBody: JSON.stringify(compact({ pipelineStageId: stage ? LEAD_STAGE_IDS[stage] : null, customFields: oppFields(i.quoteNumber, i.site) })),
    };
  }

  const stage = stageToSet(i.timing, { isNew: true, pipelineId: null }, LEADS_PIPELINE_ID)!;
  const oppBody = JSON.stringify({
    locationId: GHL_LOCATION_ID,
    pipelineId: LEADS_PIPELINE_ID,
    pipelineStageId: LEAD_STAGE_IDS[stage],
    name: i.opportunityName,
    status: "open",
    contactId: i.contactId ?? CONTACT_ID_SLOT,
    customFields: oppFields(i.quoteNumber, i.site),
  });

  if (i.contactId) {
    return { mode: "new-opportunity", contactId: i.contactId, opportunityId: null, contactBody: JSON.stringify({ ...sourceField, customFields: timingField }), oppBody };
  }

  const c = i.newContact;
  if (!c) throw new Error("A new customer needs their details.");
  return {
    mode: "new-contact",
    contactId: null,
    opportunityId: null,
    contactBody: JSON.stringify(
      // GHL matches and stores phones in E.164 (+14165550199), so that's how they're sent.
      compact({ locationId: GHL_LOCATION_ID, firstName: c.firstName, lastName: c.lastName, phone: normalizePhone(c.phone), email: normalizeEmail(c.email), address1: c.address, city: c.city, ...sourceField, customFields: timingField }),
    ),
    oppBody,
  };
}

/**
 * Linking a quote that says Needs linking to the job staff picked (2026-10-15). Same "link" route
 * through Make as starting a quote on an existing opportunity, with the contact left as it is (an
 * empty update). The job gets the quote number, the site if the quote's is confirmed, and the
 * CompanyCam link if the job has none; a job that was lost or abandoned is set back to open.
 */
export function buildLinkJob(i: {
  contactId: string;
  opportunityId: string;
  reopen: boolean;
  quoteNumber: string;
  site: { address: string | null; city: string | null } | null;
  companyCamUrl: string | null;
}): GhlRequest {
  const fields = [
    ...oppFields(i.quoteNumber, i.site ?? { address: null, city: null }),
    ...(i.companyCamUrl ? [{ id: OPP_FIELDS.companyCamUrl, field_value: i.companyCamUrl }] : []),
  ];
  return {
    mode: "link",
    contactId: i.contactId,
    opportunityId: i.opportunityId,
    contactBody: JSON.stringify({}),
    oppBody: JSON.stringify({ ...(i.reopen ? { status: "open" } : {}), customFields: fields }),
  };
}

/**
 * The booking step's one GHL write of its own: a job whose appointment was confirmed with no
 * opportunity gets one, in the Sales pipeline's Meeting (Scheduled) stage, already carrying the
 * quote number and the site. Same "new-opportunity" route through Make as a new quote; the
 * contact is left as it is (an empty update).
 */
export function buildBookingOpportunity(i: { contactId: string; quoteNumber: string; name: string; site: { address: string | null; city: string | null } }): GhlRequest {
  return {
    mode: "new-opportunity",
    contactId: i.contactId,
    opportunityId: null,
    contactBody: JSON.stringify({}),
    oppBody: JSON.stringify({
      locationId: GHL_LOCATION_ID,
      pipelineId: SALES_PIPELINE_ID,
      pipelineStageId: MEETING_SCHEDULED_STAGE_ID,
      name: i.name,
      status: "open",
      contactId: i.contactId,
      customFields: oppFields(i.quoteNumber, i.site),
    }),
  };
}
