import { describe, expect, it } from "vitest";
import { CONTACT_TIMING_FIELD, GHL_LOCATION_ID, LEAD_STAGE_IDS, LEADS_PIPELINE_ID, OPP_FIELDS } from "../src/lib/ghl/ids";
import { buildGhlRequest, CONTACT_ID_SLOT, type GhlRequestInput } from "../src/lib/link/ghlRequest";

// INVENTED customer and ids only: this repo is public.
const base: GhlRequestInput = {
  quoteNumber: "Q-1234",
  opportunityName: "Doe, Jane - Oakville - Q-1234",
  timing: "1 to 3 months",
  contactId: null,
  opportunity: null,
  newContact: null,
  site: { address: null, city: null },
};
const parse = (s: string) => JSON.parse(s) as Record<string, unknown>;

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
      name: "Doe, Jane - Oakville - Q-1234",
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
