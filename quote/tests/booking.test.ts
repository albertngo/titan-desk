import { describe, expect, it } from "vitest";
import { bookingDecision, parseBooking, parseBookingLinks } from "../src/lib/link/booking";
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

describe("booking: what Make may send", () => {
  it("takes the two GHL ids and nothing else", () => {
    expect(parseBooking({ opportunityId: "oppBOOKED001", contactId: "conJANE00001", firstName: "ignored" })).toEqual({
      ok: true,
      value: { opportunityId: "oppBOOKED001", contactId: "conJANE00001" },
    });
    expect(parseBooking({ opportunityId: "opp'; --", contactId: "conJANE00001" }).ok).toBe(false);
    expect(parseBooking({ opportunityId: "oppBOOKED001" }).ok).toBe(false);
  });

  it("takes only https links for the folder and CompanyCam", () => {
    const base = { quoteRecordId: "recQUOTE00000000A", opportunityId: "oppBOOKED001" };
    expect(parseBookingLinks({ ...base, folderUrl: "https://example.sharepoint.com/f", companyCamUrl: "javascript:alert(1)" })).toEqual({
      ok: true,
      value: { ...base, folderUrl: "https://example.sharepoint.com/f", companyCamUrl: null },
    });
    expect(parseBookingLinks({ ...base, folderUrl: "http://example.com" }).ok).toBe(false);
    expect(parseBookingLinks({ ...base, quoteRecordId: "nope", folderUrl: "https://example.com" }).ok).toBe(false);
  });
});
