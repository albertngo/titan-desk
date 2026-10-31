import { describe, expect, it } from "vitest";
import { bookedElsewhere, bookingDecision, elsewhereNote, opportunityUpdateBody, parseBooking, parseBookingLinks, pickOpportunity, projectJobs, alreadyMade, recentlyClosed, sameSiteAs, sameStreet, type SiteQuote } from "../src/lib/link/booking";
import { OPP_FIELDS } from "../src/lib/ghl/ids";
import type { QuoteKeys } from "../src/lib/link/match";

// INVENTED ids and people only: this repo is public.
const Q = (o: Partial<QuoteKeys> & { id: string }): QuoteKeys => ({ opportunityId: null, contactId: null, phone: null, email: null, ...o });
const probe = { opportunityId: "oppBOOKED001", contactId: "conJANE00001", phone: "+14165550199", email: "jane@example.com" };

describe("booking: which quote does this appointment belong to?", () => {
  it("uses the opportunity's own quote", () => {
    expect(bookingDecision([Q({ id: "recA", opportunityId: "oppBOOKED001", contactId: "conJANE00001" })], probe)).toEqual({ kind: "existing", id: "recA" });
  });

  it("links the customer's quote that has no opportunity yet", () => {
    expect(bookingDecision([Q({ id: "recB", contactId: "conJANE00001" })], probe)).toEqual({ kind: "link", id: "recB" });
    expect(bookingDecision([Q({ id: "recC", phone: "416-555-0199" })], probe)).toEqual({ kind: "link", id: "recC" });
  });

  it("never takes over the customer's quote for different work", () => {
    expect(bookingDecision([Q({ id: "recD", opportunityId: "oppOLDJOB001", contactId: "conJANE00001", phone: "416-555-0199" })], probe)).toEqual({
      kind: "create",
      note: null,
    });
  });

  it("starts a new quote, and says why, when two earlier quotes could be this one", () => {
    const d = bookingDecision([Q({ id: "recE", contactId: "conJANE00001" }), Q({ id: "recF", contactId: "conJANE00001" })], probe);
    expect(d.kind).toBe("create");
    expect(d.kind === "create" && d.note).toMatch(/2 earlier quotes match this customer by contact/);
  });

  it("starts a new quote for a new customer", () => {
    expect(bookingDecision([], probe)).toEqual({ kind: "create", note: null });
  });
});

describe("booking: which job is this appointment for?", () => {
  it("takes the opportunity on the booking when GHL sent one that is still open", () => {
    expect(pickOpportunity("oppBOOKED001", [{ id: "oppOTHER0001" }, { id: "oppBOOKED001" }])).toEqual({ kind: "use", id: "oppBOOKED001", how: "booking" });
  });

  it("ignores one GHL sent that is won, lost or abandoned: a returning customer's old job is never reused", () => {
    expect(pickOpportunity("oppOLDWON001", [])).toEqual({ kind: "none" });
    expect(pickOpportunity("oppOLDWON001", [{ id: "oppNEW000001" }])).toEqual({ kind: "use", id: "oppNEW000001", how: "only-open" });
  });

  it("otherwise the contact's only open opportunity", () => {
    expect(pickOpportunity(null, [{ id: "oppONLY00001" }])).toEqual({ kind: "use", id: "oppONLY00001", how: "only-open" });
  });

  it("never makes a new one while a lost or abandoned job from the last 90 days might be coming back", () => {
    expect(pickOpportunity(null, [], ["oppSTALE0001"])).toEqual({ kind: "revived", ids: ["oppSTALE0001"] });
    expect(pickOpportunity("oppSTALE0001", [], ["oppSTALE0001"])).toEqual({ kind: "revived", ids: ["oppSTALE0001"] });
    // An open job always wins over a closed one.
    expect(pickOpportunity(null, [{ id: "oppOPEN00001" }], ["oppSTALE0001"])).toEqual({ kind: "use", id: "oppOPEN00001", how: "only-open" });
  });

  it("counts only lost or abandoned jobs closed within 90 days, never a won one", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const opps = [
      { id: "oppWON000001", status: "won", statusChangedAt: "2026-10-01T00:00:00Z" },
      { id: "oppOLD000001", status: "abandoned", statusChangedAt: "2026-06-01T00:00:00Z" },
      { id: "oppLOST00001", status: "lost", statusChangedAt: "2026-08-20T00:00:00Z" },
      { id: "oppSTALE0001", status: "abandoned", statusChangedAt: "2026-09-30T00:00:00Z" },
      { id: "oppOPEN00001", status: "open", statusChangedAt: "2026-10-10T00:00:00Z" },
      { id: "oppNODATE001", status: "abandoned", statusChangedAt: null },
    ];
    expect(recentlyClosed(opps, now)).toEqual(["oppSTALE0001", "oppLOST00001"]);
  });

  it("never takes a STORE order as the job, only the project pipelines", () => {
    const opps = [
      { id: "oppSTORE0001", pipelineId: "ySvXh8g1u1TSjUB5A1Zg" },
      { id: "oppLEAD00001", pipelineId: "z7ZevSnG9HnGMzC9nSHp" },
      { id: "oppSALES0001", pipelineId: "ZxYBFNifUNNxU7xgQclg" },
      { id: "oppNOPIPE001", pipelineId: null },
    ];
    expect(projectJobs(opps).map((o) => o.id)).toEqual(["oppLEAD00001", "oppSALES0001"]);
    // GHL sent the store order: it is ignored and the one open project job is used.
    expect(pickOpportunity("oppSTORE0001", projectJobs(opps).slice(0, 1))).toEqual({ kind: "use", id: "oppLEAD00001", how: "only-open" });
  });

  it("knows a job's folder exists from the quote's links or, for a job booked before the app, the opportunity's CompanyCam URL", () => {
    const none = { folderUrl: null, companyCamUrl: null };
    expect(alreadyMade(undefined, undefined)).toBe(false);
    expect(alreadyMade(none, { companyCamUrl: null })).toBe(false);
    expect(alreadyMade({ ...none, folderUrl: "https://example.com/folder" }, undefined)).toBe(true);
    expect(alreadyMade(undefined, { companyCamUrl: "https://example.com/project" })).toBe(true);
  });

  it("makes one when there is none, and never guesses between several", () => {
    expect(pickOpportunity(null, [])).toEqual({ kind: "none" });
    expect(pickOpportunity(null, [{ id: "oppA00000001" }, { id: "oppB00000001" }])).toEqual({ kind: "several", ids: ["oppA00000001", "oppB00000001"] });
  });

  it("with no opportunity, only reuses a quote that has none either", () => {
    const quotes = [Q({ id: "recOnJob", opportunityId: "oppOLDJOB001", contactId: "conJANE00001" }), Q({ id: "recLoose", contactId: "conJANE00001" })];
    expect(bookingDecision(quotes, { ...probe, opportunityId: null })).toEqual({ kind: "link", id: "recLoose" });
    expect(bookingDecision([quotes[0]], { ...probe, opportunityId: null })).toEqual({ kind: "create", note: null });
  });
});

describe("booking: the site", () => {
  const S = (o: Partial<SiteQuote> & { id: string }): SiteQuote => ({
    quoteNumber: null,
    contactId: "conJANE00001",
    opportunityId: null,
    siteAddress: null,
    addressStatus: null,
    won: false,
    ...o,
  });

  it("flags the same address already confirmed on the customer's other open job", () => {
    const quotes = [
      S({ id: "recHome", quoteNumber: "Q-1010", siteAddress: "12 Example St.", addressStatus: "Confirmed" }),
      S({ id: "recThis", quoteNumber: "Q-1011" }),
    ];
    expect(sameSiteAs(quotes, { quoteId: "recThis", contactId: "conJANE00001" }, "12 example st")).toEqual(["Q-1010"]);
  });

  it("ignores won jobs, unconfirmed sites, other customers and the quote itself", () => {
    const quotes = [
      S({ id: "recWon", quoteNumber: "Q-1001", siteAddress: "12 Example St", addressStatus: "Confirmed", won: true }),
      S({ id: "recUnconf", quoteNumber: "Q-1002", siteAddress: "12 Example St", addressStatus: "Unconfirmed" }),
      S({ id: "recOther", quoteNumber: "Q-1003", siteAddress: "12 Example St", addressStatus: "Confirmed", contactId: "conSOMEONE01" }),
      S({ id: "recThis", quoteNumber: "Q-1004", siteAddress: "12 Example St", addressStatus: "Confirmed" }),
    ];
    expect(sameSiteAs(quotes, { quoteId: "recThis", contactId: "conJANE00001" }, "12 Example St")).toEqual([]);
    expect(sameSiteAs(quotes, { quoteId: "recThis", contactId: "conJANE00001" }, null)).toEqual([]);
  });

  it("puts the quote number and the confirmed site on the opportunity, never a blank", () => {
    expect(JSON.parse(opportunityUpdateBody("Q-1011", { address: "5 Rental Rd", city: "Newtown" }))).toEqual({
      customFields: [
        { id: OPP_FIELDS.quoteNumber, field_value: "Q-1011" },
        { id: OPP_FIELDS.projectAddress, field_value: "5 Rental Rd" },
        { id: OPP_FIELDS.projectCity, field_value: "Newtown" },
      ],
    });
    expect(JSON.parse(opportunityUpdateBody("Q-1011", { address: null, city: "Newtown" }))).toEqual({
      customFields: [{ id: OPP_FIELDS.quoteNumber, field_value: "Q-1011" }],
    });
  });
});

describe("booking: booked somewhere else (a new project for the same customer)", () => {
  const confirmed = { siteAddress: "5 Example Crt", addressStatus: "Confirmed" };

  it("reads the same street loosely: case, punctuation and the street word", () => {
    expect(sameStreet("5 Example Crt", "5 example court")).toBe(true);
    expect(sameStreet("12 Sample St.", "12 SAMPLE STREET")).toBe(true);
    expect(sameStreet("40 Test Ave N", "40 Test Avenue North")).toBe(true);
  });

  it("never reads another number, street or unit as the same place", () => {
    expect(sameStreet("5 Example Crt", "7 Example Crt")).toBe(false);
    expect(sameStreet("5 Example Crt", "5 Example Cres")).toBe(false);
    expect(sameStreet("10 Sample St Unit 4", "10 Sample St Unit 5")).toBe(false);
    expect(sameStreet("", "")).toBe(false);
  });

  it("flags a booking at a different address from the matched quote's confirmed site", () => {
    expect(bookedElsewhere(confirmed, "88 Other Rd")).toBe(true);
  });

  it("treats the same address as a rebooking of the same job", () => {
    expect(bookedElsewhere(confirmed, "5 example court")).toBe(false);
  });

  it("lets booking confirm a quote whose site isn't confirmed yet, and never guesses without an address", () => {
    expect(bookedElsewhere({ siteAddress: "5 Example Crt", addressStatus: "Unconfirmed" }, "88 Other Rd")).toBe(false);
    expect(bookedElsewhere({ siteAddress: null, addressStatus: "Confirmed" }, "88 Other Rd")).toBe(false);
    expect(bookedElsewhere(confirmed, null)).toBe(false);
    expect(bookedElsewhere(undefined, "88 Other Rd")).toBe(false);
  });

  it("names both addresses and both ways out in the note", () => {
    const note = elsewhereNote({ quoteNumber: "Q-1010", siteAddress: "5 Example Crt" }, "88 Other Rd");
    expect(note).toMatch(/booked at 88 Other Rd, but Q-1010 is confirmed at 5 Example Crt/);
    expect(note).toMatch(/new project, create its opportunity/);
    expect(note).toMatch(/Fix address/);
  });
});

describe("booking: what Make may send", () => {
  it("takes the contact id, and the opportunity id when GHL has one, and nothing else", () => {
    expect(parseBooking({ opportunityId: "oppBOOKED001", contactId: "conJANE00001", firstName: "ignored" })).toEqual({
      ok: true,
      value: { opportunityId: "oppBOOKED001", contactId: "conJANE00001" },
    });
    expect(parseBooking({ opportunityId: "", contactId: "conJANE00001" })).toEqual({ ok: true, value: { opportunityId: null, contactId: "conJANE00001" } });
    expect(parseBooking({ contactId: "conJANE00001" }).ok).toBe(true);
    expect(parseBooking({ opportunityId: "opp'; --", contactId: "conJANE00001" }).ok).toBe(false);
    expect(parseBooking({ opportunityId: "oppBOOKED001" }).ok).toBe(false);
  });

  it("takes only https links for the folder and CompanyCam", () => {
    const base = { quoteRecordId: "recQUOTE00000000A", contactId: "conJANE00001" };
    expect(parseBookingLinks({ ...base, folderUrl: "https://example.sharepoint.com/f", companyCamUrl: "javascript:alert(1)" })).toEqual({
      ok: true,
      value: { ...base, folderUrl: "https://example.sharepoint.com/f", companyCamUrl: null },
    });
    expect(parseBookingLinks({ ...base, folderUrl: "http://example.com" }).ok).toBe(false);
    expect(parseBookingLinks({ ...base, quoteRecordId: "nope", folderUrl: "https://example.com" }).ok).toBe(false);
  });
});
