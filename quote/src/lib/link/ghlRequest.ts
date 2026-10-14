import { CONTACT_TIMING_FIELD, GHL_LOCATION_ID, LEAD_STAGE_IDS, LEADS_PIPELINE_ID, OPP_FIELDS } from "@/lib/ghl/ids";
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
  /** The shared name, "Doe, Jane - Oakville - Q-1234": becomes the opportunity's name. */
  opportunityName: string;
  timing: Timing;
  contactId: string | null;
  /** An existing opportunity to link, with the pipeline it is in now. */
  opportunity: { id: string; pipelineId: string | null } | null;
  /** Only for a brand-new customer. */
  newContact: { firstName: string | null; lastName: string | null; phone: string | null; email: string | null; address: string | null; city: string | null } | null;
  /** Site address, if known, for the opportunity's Project Address / City. */
  site: { address: string | null; city: string | null };
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
  const timingField = [{ id: CONTACT_TIMING_FIELD, value: TIMING_IN_GHL[i.timing] }];

  if (i.opportunity) {
    if (!i.contactId) throw new Error("An opportunity is always linked through its contact.");
    const stage = stageToSet(i.timing, { isNew: false, pipelineId: i.opportunity.pipelineId }, LEADS_PIPELINE_ID);
    return {
      mode: "link",
      contactId: i.contactId,
      opportunityId: i.opportunity.id,
      contactBody: JSON.stringify({ customFields: timingField }),
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
    return { mode: "new-opportunity", contactId: i.contactId, opportunityId: null, contactBody: JSON.stringify({ customFields: timingField }), oppBody };
  }

  const c = i.newContact;
  if (!c) throw new Error("A new customer needs their details.");
  return {
    mode: "new-contact",
    contactId: null,
    opportunityId: null,
    contactBody: JSON.stringify(
      // GHL matches and stores phones in E.164 (+14165550199), so that's how they're sent.
      compact({ locationId: GHL_LOCATION_ID, firstName: c.firstName, lastName: c.lastName, phone: normalizePhone(c.phone), email: normalizeEmail(c.email), address1: c.address, city: c.city, customFields: timingField }),
    ),
    oppBody,
  };
}
