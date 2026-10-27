import { describe, expect, it } from "vitest";
import { OPP_FIELDS } from "../src/lib/ghl/ids";
import { buildLinkJob } from "../src/lib/link/ghlRequest";
import { addressEditBlock, addressEditCheck, confirmAddressCheck, fixAddressLink, linkChoices, type AddressEditQuote, type JobCandidate } from "../src/lib/link/linkJob";

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

describe("changing the address in the app (2026-10-27)", () => {
  const q: AddressEditQuote = {
    siteAddress: "1 Example St",
    siteCity: "Toronto",
    addressStatus: "Unconfirmed",
    projectNumber: null,
    ghlContactId: "conAAA111111",
    ghlOpportunityId: "oppBBB222222",
  };
  const shown = { address: "1 Example St", city: "Toronto" };
  const next = { address: "  22   Sample Ave ", city: "Oakville " };

  it("is offered on a linked quote that isn't won, and nowhere else", () => {
    expect(addressEditBlock(q)).toBeNull();
    expect(addressEditBlock({ ...q, projectNumber: "PP-412" })).toMatch(/Notion project/);
    expect(addressEditBlock({ ...q, ghlOpportunityId: null })).toMatch(/Link this quote/);
    expect(addressEditBlock({ ...q, ghlContactId: null })).toMatch(/no GHL contact/);
  });

  it("sends the tidied address to the quote's own contact and opportunity", () => {
    expect(addressEditCheck(q, shown, next)).toEqual({
      ok: true,
      contactId: "conAAA111111",
      opportunityId: "oppBBB222222",
      address: "22 Sample Ave",
      city: "Oakville",
      addressStatus: "Unconfirmed",
    });
  });

  it("never confirms an address, and a confirmed site stays confirmed", () => {
    expect(addressEditCheck({ ...q, addressStatus: "No address", siteAddress: null, siteCity: null }, { address: "", city: "" }, next)).toMatchObject({ ok: true, addressStatus: "Unconfirmed" });
    expect(addressEditCheck({ ...q, addressStatus: null }, shown, next)).toMatchObject({ ok: true, addressStatus: "Unconfirmed" });
    expect(addressEditCheck({ ...q, addressStatus: "Confirmed" }, shown, next)).toMatchObject({ ok: true, addressStatus: "Confirmed" });
  });

  it("refuses a won job, an unlinked quote, and a blank street or city", () => {
    expect(addressEditCheck({ ...q, projectNumber: "PP-412" }, shown, next)).toMatchObject({ ok: false, message: expect.stringMatching(/Notion project/) });
    expect(addressEditCheck({ ...q, ghlOpportunityId: null }, shown, next)).toMatchObject({ ok: false });
    expect(addressEditCheck(q, shown, { address: "22 Sample Ave", city: "  " })).toMatchObject({ ok: false, message: expect.stringMatching(/street address and the city/) });
    expect(addressEditCheck(q, shown, { address: "", city: "Oakville" })).toMatchObject({ ok: false });
    expect(addressEditCheck(q, shown, { address: "x".repeat(201), city: "Oakville" })).toMatchObject({ ok: false, message: expect.stringMatching(/too long/) });
  });

  it("writes nothing if the quote's address changed since the page opened", () => {
    expect(addressEditCheck(q, { address: "9 Other Rd", city: "Toronto" }, next)).toMatchObject({ ok: false, message: expect.stringMatching(/changed since/) });
    expect(addressEditCheck(q, { address: "1 Example St", city: "Ajax" }, next)).toMatchObject({ ok: false });
    // Spacing and case in what the page showed don't count as a change.
    expect(addressEditCheck(q, { address: " 1 example st", city: "TORONTO" }, next)).toMatchObject({ ok: true });
  });

  it("refuses an address that is the same as the quote's, but lets a spelling or case fix through", () => {
    expect(addressEditCheck(q, shown, { address: " 1 Example  St", city: "Toronto" })).toMatchObject({ ok: false, message: expect.stringMatching(/already has/) });
    expect(addressEditCheck(q, shown, { address: "1 EXAMPLE ST", city: "Toronto" })).toMatchObject({ ok: true, address: "1 EXAMPLE ST" });
  });
});
