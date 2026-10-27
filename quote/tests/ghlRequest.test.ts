import { describe, expect, it } from "vitest";
import { CONTACT_ORIGIN_FIELD, CONTACT_TIMING_FIELD, GHL_LOCATION_ID, LEAD_STAGE_IDS, LEADS_PIPELINE_ID, MEETING_SCHEDULED_STAGE_ID, OPP_FIELDS, SALES_PIPELINE_ID } from "../src/lib/ghl/ids";
import { buildBookingOpportunity, buildGhlRequest, CONTACT_ID_SLOT, type GhlRequestInput } from "../src/lib/link/ghlRequest";

// INVENTED customer and ids only: this repo is public.
const base: GhlRequestInput = {
  quoteNumber: "Q-1234",
  opportunityName: "Jane Doe - 1026 - Q-1234",
  timing: "1 to 3 months",
  contactId: null,
  opportunity: null,
  newContact: null,
  site: { address: null, city: null },
};
const parse = (s: string) => JSON.parse(s) as Record<string, unknown>;

describe("where they found us (2026-10-27): the pick replaces anything that isn't an exact option", () => {
  const timing = { id: CONTACT_TIMING_FIELD, value: "1-3 months" };
  const origin = { id: CONTACT_ORIGIN_FIELD, value: "Referral: Trade" };
  const fresh = { firstName: "Jane", lastName: "Doe", phone: "416-555-0199", email: null, address: null, city: null };
  const linked = (source: string | null) => ({ id: "oppXYZ987654", pipelineId: LEADS_PIPELINE_ID, source });

  it("a new contact and its new opportunity get the pick everywhere", () => {
    const r = buildGhlRequest({ ...base, newContact: fresh, origin: "Referral: Trade" });
    expect(parse(r.contactBody).source).toBe("Referral: Trade");
    expect(parse(r.contactBody).customFields).toEqual([timing, origin]);
    expect(parse(r.oppBody).source).toBe("Referral: Trade");
  });

  it("replaces a blank, a GHL default or anything unfamiliar, on the contact and the opportunity", () => {
    const r = buildGhlRequest({ ...base, contactId: "abcDEF123456", opportunity: linked("facebook"), origin: "Referral: Trade", existing: { origin: "fb ad?", source: "" } });
    expect(parse(r.contactBody)).toEqual({ source: "Referral: Trade", customFields: [timing, origin] });
    expect(parse(r.oppBody).source).toBe("Referral: Trade");
    const newOpp = buildGhlRequest({ ...base, contactId: "abcDEF123456", origin: "Referral: Trade", existing: { origin: null, source: "Website Form" } });
    expect(parse(newOpp.contactBody)).toEqual({ source: "Referral: Trade", customFields: [timing, origin] });
    expect(parse(newOpp.oppBody).source).toBe("Referral: Trade");
  });

  it("keeps any field that already holds an exact option, even a different one", () => {
    const r = buildGhlRequest({ ...base, contactId: "abcDEF123456", opportunity: linked("Meta Ad"), origin: "Referral: Trade", existing: { origin: "Google Ad", source: "Web: Website Form" } });
    expect(parse(r.contactBody)).toEqual({ customFields: [timing] });
    expect(parse(r.oppBody).source).toBeUndefined();
    // Exact wording only: a near miss is replaced.
    const near = buildGhlRequest({ ...base, contactId: "abcDEF123456", opportunity: linked("meta ad"), origin: "Referral: Trade", existing: { origin: null, source: "Website Form" } });
    expect(parse(near.oppBody).source).toBe("Referral: Trade");
  });

  it("nothing picked writes nothing new", () => {
    const r = buildGhlRequest({ ...base, newContact: fresh });
    expect(parse(r.contactBody).source).toBeUndefined();
    expect(parse(r.oppBody).source).toBeUndefined();
    const l = buildGhlRequest({ ...base, contactId: "abcDEF123456", opportunity: linked("facebook"), existing: { origin: null, source: null } });
    expect(parse(l.contactBody)).toEqual({ customFields: [timing] });
    expect(parse(l.oppBody).source).toBeUndefined();
  });
});

describe("the request the app sends to Make for GHL", () => {
  it("new customer: creates the contact with only what was typed, then opens an opportunity in the lead pipeline", () => {
    const r = buildGhlRequest({
      ...base,
      newContact: { firstName: "Jane", lastName: "Doe", phone: "416-555-0199", email: null, address: "12 Example St", city: "Oakville" },
      site: { address: "12 Example St", city: "Oakville" },
    });
    expect(r.mode).toBe("new-contact");
    expect(parse(r.contactBody)).toEqual({
      locationId: GHL_LOCATION_ID,
      firstName: "Jane",
      lastName: "Doe",
      phone: "+14165550199",
      address1: "12 Example St",
      city: "Oakville",
      customFields: [{ id: CONTACT_TIMING_FIELD, value: "1-3 months" }],
    });
    expect(parse(r.oppBody)).toEqual({
      locationId: GHL_LOCATION_ID,
      pipelineId: LEADS_PIPELINE_ID,
      pipelineStageId: LEAD_STAGE_IDS.Warm,
      name: "Jane Doe - 1026 - Q-1234",
      status: "open",
      contactId: CONTACT_ID_SLOT,
      customFields: [
        { id: OPP_FIELDS.quoteNumber, field_value: "Q-1234" },
        { id: OPP_FIELDS.projectAddress, field_value: "12 Example St" },
        { id: OPP_FIELDS.projectCity, field_value: "Oakville" },
      ],
    });
  });

  it("existing customer, new work: records the timing and opens an opportunity on their contact", () => {
    const r = buildGhlRequest({ ...base, contactId: "conAAA111111", timing: "Within 1 month" });
    expect(r.mode).toBe("new-opportunity");
    expect(parse(r.contactBody)).toEqual({ customFields: [{ id: CONTACT_TIMING_FIELD, value: "< 1 month" }] });
    const opp = parse(r.oppBody);
    expect([opp.contactId, opp.pipelineStageId]).toEqual(["conAAA111111", LEAD_STAGE_IDS.Hot]);
    expect(opp.customFields).toEqual([{ id: OPP_FIELDS.quoteNumber, field_value: "Q-1234" }]);
  });

  it("existing opportunity still in the lead pipeline: adds the quote number and sets the stage", () => {
    const r = buildGhlRequest({ ...base, contactId: "conAAA111111", opportunity: { id: "oppAAA111111", pipelineId: LEADS_PIPELINE_ID }, timing: "Not sure" });
    expect([r.mode, r.opportunityId]).toEqual(["link", "oppAAA111111"]);
    expect(parse(r.oppBody)).toEqual({ pipelineStageId: LEAD_STAGE_IDS.Cold, customFields: [{ id: OPP_FIELDS.quoteNumber, field_value: "Q-1234" }] });
  });

  it("existing opportunity further along: adds the quote number and never pulls it back to a lead stage", () => {
    const r = buildGhlRequest({ ...base, contactId: "conAAA111111", opportunity: { id: "oppAAA111111", pipelineId: "pipeSALES000" }, timing: "Within 1 month" });
    expect(parse(r.oppBody)).toEqual({ customFields: [{ id: OPP_FIELDS.quoteNumber, field_value: "Q-1234" }] });
  });

  it("refuses requests that can't be right", () => {
    expect(() => buildGhlRequest({ ...base, opportunity: { id: "oppAAA111111", pipelineId: null } })).toThrow();
    expect(() => buildGhlRequest(base)).toThrow();
  });
});

describe("the opportunity the booking step makes when a booked contact has none", () => {
  it("opens it in the Sales pipeline at Meeting (Scheduled), with the quote number and site, and leaves the contact alone", () => {
    const r = buildBookingOpportunity({ contactId: "conJANE00001", quoteNumber: "Q-1234", name: "Jane Doe - 1026 - Q-1234", site: { address: "12 Example St", city: "Oakville" } });
    expect(r.mode).toBe("new-opportunity");
    expect(parse(r.contactBody)).toEqual({});
    expect(parse(r.oppBody)).toEqual({
      locationId: GHL_LOCATION_ID,
      pipelineId: SALES_PIPELINE_ID,
      pipelineStageId: MEETING_SCHEDULED_STAGE_ID,
      name: "Jane Doe - 1026 - Q-1234",
      status: "open",
      contactId: "conJANE00001",
      customFields: [
        { id: OPP_FIELDS.quoteNumber, field_value: "Q-1234" },
        { id: OPP_FIELDS.projectAddress, field_value: "12 Example St" },
        { id: OPP_FIELDS.projectCity, field_value: "Oakville" },
      ],
    });
  });
});
