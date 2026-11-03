import { describe, expect, it } from "vitest";
import { LEAD_STAGE_IDS, OPP_FIELDS } from "../src/lib/ghl/ids";
import { buildLinkJob } from "../src/lib/link/ghlRequest";
import { checkPlacement, confirmAddressCheck, defaultPlacement, fixAddressLink, linkChoices, placements, type JobCandidate } from "../src/lib/link/linkJob";

// INVENTED ids, names and addresses only: this repo is public.
const LEADS = "z7ZevSnG9HnGMzC9nSHp";
const SALES = "ZxYBFNifUNNxU7xgQclg";
const STORE = "ySvXh8g1u1TSjUB5A1Zg";
const now = new Date("2026-10-15T12:00:00Z");
const J = (o: Partial<JobCandidate> & { id: string }): JobCandidate => ({
  name: null,
  status: "open",
  pipelineId: SALES,
  stageId: null,
  statusChangedAt: "2026-10-01T00:00:00Z",
  siteAddress: null,
  companyCamUrl: null,
  ...o,
});

describe("linking a quote: which jobs can be picked", () => {
  const opps = [
    J({ id: "oppOLDOPEN01", statusChangedAt: "2026-09-01T00:00:00Z" }),
    J({ id: "oppNEWOPEN01", pipelineId: LEADS, statusChangedAt: "2026-10-10T00:00:00Z" }),
    J({ id: "oppSTALE0001", status: "abandoned", statusChangedAt: "2026-10-12T00:00:00Z" }),
    J({ id: "oppLOSTOLD01", status: "lost", statusChangedAt: "2026-05-01T00:00:00Z" }),
    J({ id: "oppWON000001", status: "won", statusChangedAt: "2026-10-14T00:00:00Z" }),
    J({ id: "oppSTORE0001", pipelineId: STORE }),
  ];

  it("offers open project jobs first, then ones lost or abandoned in the last 90 days; never won, never STORE", () => {
    expect(linkChoices(opps, new Map(), now).map((o) => o.id)).toEqual(["oppNEWOPEN01", "oppOLDOPEN01", "oppSTALE0001"]);
  });

  it("marks a closed job to be reopened, and a job another quote is on as taken", () => {
    const c = linkChoices(opps, new Map([["oppOLDOPEN01", "Q-1001"]]), now);
    expect(c.find((o) => o.id === "oppSTALE0001")).toMatchObject({ reopen: true, takenBy: null });
    expect(c.find((o) => o.id === "oppOLDOPEN01")).toMatchObject({ reopen: false, takenBy: "Q-1001" });
  });
});

describe("linking a quote: what GHL is sent", () => {
  const base = { contactId: "conJANE00001", opportunityId: "oppSTALE0001", quoteNumber: "Q-1234" };

  it("reopens a closed job and carries the quote number, the confirmed site and the CompanyCam link", () => {
    const r = buildLinkJob({ ...base, reopen: true, site: { address: "1 Example St", city: "Toronto" }, companyCamUrl: "https://example.com/p/1" });
    expect(r).toMatchObject({ mode: "link", contactId: "conJANE00001", opportunityId: "oppSTALE0001", contactBody: "{}" });
    expect(JSON.parse(r.oppBody)).toEqual({
      status: "open",
      customFields: [
        { id: OPP_FIELDS.quoteNumber, field_value: "Q-1234" },
        { id: OPP_FIELDS.projectAddress, field_value: "1 Example St" },
        { id: OPP_FIELDS.projectCity, field_value: "Toronto" },
        { id: OPP_FIELDS.companyCamUrl, field_value: "https://example.com/p/1" },
      ],
    });
  });

  it("leaves an open job's status, and a site that isn't confirmed, alone", () => {
    const body = JSON.parse(buildLinkJob({ ...base, reopen: false, site: null, companyCamUrl: null }).oppBody);
    expect(body).toEqual({ customFields: [{ id: OPP_FIELDS.quoteNumber, field_value: "Q-1234" }] });
  });
});

describe("confirming an address by hand", () => {
  const q = { siteAddress: "1 Example St", addressStatus: "Unconfirmed", projectNumber: null };

  it("confirms the address the person saw, and only while it is unconfirmed and the job isn't won", () => {
    expect(confirmAddressCheck(q, "1 example st ")).toEqual({ ok: true });
    expect(confirmAddressCheck({ ...q, addressStatus: "Confirmed" }, "1 Example St").ok).toBe(false);
    expect(confirmAddressCheck({ ...q, projectNumber: "PP-400" }, "1 Example St").ok).toBe(false);
    expect(confirmAddressCheck({ ...q, siteAddress: null }, "").ok).toBe(false);
  });

  it("refuses when the address changed after the page opened", () => {
    expect(confirmAddressCheck({ ...q, siteAddress: "2 Other Ave" }, "1 Example St")).toMatchObject({ ok: false, message: expect.stringContaining("changed") });
  });

  it("sends the opportunity only the quote number and the site, never a status or a CompanyCam link", () => {
    const r = buildLinkJob({ contactId: "conJANE00001", opportunityId: "oppOPEN00001", reopen: false, quoteNumber: "Q-1234", site: { address: "1 Example St", city: "Toronto" }, companyCamUrl: null });
    expect(JSON.parse(r.oppBody)).toEqual({
      customFields: [
        { id: OPP_FIELDS.quoteNumber, field_value: "Q-1234" },
        { id: OPP_FIELDS.projectAddress, field_value: "1 Example St" },
        { id: OPP_FIELDS.projectCity, field_value: "Toronto" },
      ],
    });
  });
});

describe("where a wrong address is fixed (2026-10-21)", () => {
  const base = { addressStatus: null, projectNumber: null, ghlContactId: "conAAA111111", ghlOpportunityId: "oppBBB222222", notionProjectUrl: null };

  it("an unconfirmed address, or none yet, is fixed on the GHL contact", () => {
    expect(fixAddressLink({ ...base, addressStatus: "Unconfirmed" })?.href).toContain("/contacts/detail/conAAA111111");
    expect(fixAddressLink({ ...base, addressStatus: "No address" })?.href).toContain("/contacts/detail/conAAA111111");
    expect(fixAddressLink({ ...base })?.href).toContain("/contacts/detail/conAAA111111");
  });

  it("a confirmed site is fixed on the opportunity's details, never the contact", () => {
    const fix = fixAddressLink({ ...base, addressStatus: "Confirmed" });
    expect(fix?.href).toContain("/opportunities/list/oppBBB222222?tab=OpportunityDetails");
    expect(fix?.hint).toMatch(/Project Address/);
  });

  it("a confirmed site on a quote with no opportunity sends the person to link it first", () => {
    const fix = fixAddressLink({ ...base, addressStatus: "Confirmed", ghlOpportunityId: null });
    expect(fix?.href).toContain("/contacts/detail/");
    expect(fix?.hint).toMatch(/Link it/);
  });

  it("a won job's address lives on the Notion project", () => {
    expect(fixAddressLink({ ...base, addressStatus: "Confirmed", projectNumber: "PP-412", notionProjectUrl: "https://www.notion.so/example" })).toEqual({
      href: "https://www.notion.so/example",
      hint: expect.stringMatching(/Notion project/),
    });
    expect(fixAddressLink({ ...base, projectNumber: "PP-412" })).toBeNull();
  });

  it("gives nothing when there is no contact to go to", () => {
    expect(fixAddressLink({ ...base, ghlContactId: null, ghlOpportunityId: null })).toBeNull();
  });
});

describe("where a new opportunity goes (Albert, 2026-11-03): staff pick the pipeline and stage, never Won", () => {
  const ghl = [
    { id: STORE, name: "STORE: Material Pipeline", stages: [{ id: "st-store", name: "New order" }] },
    { id: SALES, name: "(2) PROJECT: Sales Pipeline", stages: [{ id: "st-meet", name: "*Meeting (Scheduled)* CCAM|GHL" }, { id: "st-won", name: "2. *Project Won* " }] },
    {
      id: LEADS,
      name: "(1) PROJECT: Lead Qualification",
      stages: [
        { id: LEAD_STAGE_IDS.Hot, name: "0c. ASAP (Hot)" },
        { id: LEAD_STAGE_IDS.Warm, name: "0b. Later Date (Warm)" },
        { id: LEAD_STAGE_IDS.Cold, name: "0b. Far Out (Cold)" },
      ],
    },
  ];
  const offered = placements(ghl);

  it("offers the project pipelines in their usual order, never STORE, and never the Won stage", () => {
    expect(offered.map((p) => p.id)).toEqual([LEADS, SALES]);
    expect(offered[1].stages.map((st) => st.id)).toEqual(["st-meet"]);
  });

  it("drops a pipeline GHL didn't list or that has no stage left", () => {
    expect(placements([{ id: SALES, name: "Sales", stages: [{ id: "st-won", name: "2. *Project Won* " }] }])).toEqual([]);
    expect(placements([])).toEqual([]);
  });

  it("starts where a preliminary would put it, from the quote's timing; with no timing staff pick", () => {
    expect(defaultPlacement(offered, "Within 1 month")).toEqual({ pipelineId: LEADS, stageId: LEAD_STAGE_IDS.Hot });
    expect(defaultPlacement(offered, "3+ months")).toEqual({ pipelineId: LEADS, stageId: LEAD_STAGE_IDS.Cold });
    expect(defaultPlacement(offered, null)).toBeNull();
    expect(defaultPlacement(offered, "someday")).toBeNull();
  });

  it("accepts a stage of the picked pipeline, with its names", () => {
    expect(checkPlacement(offered, { pipelineId: SALES, stageId: "st-meet" })).toEqual({
      ok: true,
      pipelineId: SALES,
      stageId: "st-meet",
      pipeline: "(2) PROJECT: Sales Pipeline",
      stage: "*Meeting (Scheduled)* CCAM|GHL",
    });
  });

  it("refuses Won, a STORE pipeline, a stage from another pipeline, or nothing picked", () => {
    expect(checkPlacement(offered, { pipelineId: SALES, stageId: "st-won" }).ok).toBe(false);
    expect(checkPlacement(offered, { pipelineId: STORE, stageId: "st-store" }).ok).toBe(false);
    expect(checkPlacement(offered, { pipelineId: SALES, stageId: LEAD_STAGE_IDS.Hot }).ok).toBe(false);
    expect(checkPlacement(offered, null).ok).toBe(false);
    expect(checkPlacement(offered, { pipelineId: 7, stageId: [] }).ok).toBe(false);
  });
});
