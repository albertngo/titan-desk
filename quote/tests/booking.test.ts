import { describe, expect, it } from "vitest";
import { bookingDecision, opportunityUpdateBody, parseBooking, parseBookingLinks, pickOpportunity, sameSiteAs, type SiteQuote } from "../src/lib/link/booking";
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
  it("takes the opportunity on the booking when GHL sent one", () => {
    expect(pickOpportunity("oppBOOKED001", [{ id: "oppOTHER0001" }])).toEqual({ kind: "use", id: "oppBOOKED001", how: "booking" });
  });

  it("otherwise the contact's only open opportunity", () => {
    expect(pickOpportunity(null, [{ id: "oppONLY00001" }])).toEqual({ kind: "use", id: "oppONLY00001", how: "only-open" });
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
