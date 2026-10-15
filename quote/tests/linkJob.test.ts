import { describe, expect, it } from "vitest";
import { OPP_FIELDS } from "../src/lib/ghl/ids";
import { buildLinkJob } from "../src/lib/link/ghlRequest";
import { linkChoices, type JobCandidate } from "../src/lib/link/linkJob";

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
