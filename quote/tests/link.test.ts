import { describe, expect, it } from "vitest";
import { displayName, displayPhone, monthYear, normalizeEmail, normalizePhone, quoteNumber, sameCustomer, versionLabel } from "../src/lib/link/identity";
import { fillBlanks, matchQuote, type QuoteKeys } from "../src/lib/link/match";
import { addressStatus, stageFor, stageToSet, TIMINGS } from "../src/lib/link/lead";
import { parseNewQuote } from "../src/lib/link/newQuote";

// INVENTED people, numbers and ids only: this repo is public.
const Q = (o: Partial<QuoteKeys> & { id: string }): QuoteKeys => ({ opportunityId: null, contactId: null, phone: null, email: null, ...o });

describe("identity", () => {
  it("normalises North American phones however they are typed", () => {
    for (const p of ["416-555-0199", "(416) 555 0199", "+1 416 555 0199", "14165550199"]) expect(normalizePhone(p)).toBe("+14165550199");
    expect(normalizePhone("555-0199")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("+44 20 7946 0000")).toBe("+442079460000");
    expect(displayPhone("+14165550199")).toBe("416-555-0199");
  });

  it("normalises emails and rejects things that are not one", () => {
    expect(normalizeEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
    expect(normalizeEmail("jane@")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it("numbers quotes from the autonumber, Q-1001 first", () => {
    expect(quoteNumber(1)).toBe("Q-1001");
    expect(quoteNumber(234)).toBe("Q-1234");
    expect(versionLabel("Q-1234", 2)).toBe("Q-1234 v2");
  });

  it("builds the shared name: first name first, month created, numbers last, PP only once won", () => {
    const at = "2026-10-14T15:00:00Z";
    expect(displayName({ first: "Jane", last: "Doe", createdAt: at, quoteNumber: "Q-1234" })).toBe("Jane Doe - 1026 - Q-1234");
    expect(displayName({ first: "Jane", last: "Doe", createdAt: at, quoteNumber: "Q-1234", projectNumber: "PP-412" })).toBe("Jane Doe - 1026 - Q-1234 - PP-412");
    expect(displayName({ phone: "416-555-0199", createdAt: at, quoteNumber: "Q-1234" })).toBe("416-555-0199 - 1026 - Q-1234");
    expect(displayName({ last: "Doe", createdAt: at, quoteNumber: "Q-1234" })).toBe("Doe - 1026 - Q-1234");
    expect(displayName({ createdAt: at, quoteNumber: "Q-1234" })).toBe("1026 - Q-1234");
  });

  it("dates the name in Toronto time, not UTC", () => {
    // 9:30 pm on 31 October in Toronto is already November in UTC.
    expect(monthYear("2026-11-01T01:30:00Z")).toBe("1026");
    expect(monthYear("2027-01-01T05:30:00Z")).toBe("0127");
  });
});

describe("is this \"new\" customer already in GHL?", () => {
  const ghl = { phone: "+14165550199", email: "jane@example.com" };
  it("matches on the same phone however it's typed, or the same email in any case", () => {
    expect(sameCustomer(ghl, { phone: "(416) 555-0199", email: null })).toBe(true);
    expect(sameCustomer(ghl, { phone: null, email: "JANE@example.com" })).toBe(true);
  });
  it("never matches on nothing, or on a different phone and email", () => {
    expect(sameCustomer(ghl, { phone: null, email: null })).toBe(false);
    expect(sameCustomer(ghl, { phone: "416-555-0100", email: "other@example.com" })).toBe(false);
    expect(sameCustomer({ phone: null, email: null }, { phone: null, email: null })).toBe(false);
  });
  it("lets staff confirm a different person", () => {
    const r = parseNewQuote({ timing: "Not sure", forceNew: true, newCustomer: { lastName: "Doe", email: "jane@example.com" } });
    expect(r.ok && r.value.forceNew).toBe(true);
  });
});

describe("matching a quote", () => {
  const quotes = [
    Q({ id: "recA", opportunityId: "oppA", contactId: "conX", phone: "416-555-0101" }),
    Q({ id: "recB", opportunityId: null, contactId: "conY", phone: "416-555-0202", email: "y@example.com" }),
    Q({ id: "recC", opportunityId: "oppC", contactId: "conZ", phone: "416-555-0303" }),
    Q({ id: "recD", opportunityId: "oppD", contactId: "conZ", phone: "416-555-0303" }),
  ];

  it("takes the opportunity first", () => {
    expect(matchQuote(quotes, { opportunityId: "oppA", contactId: "conY" })).toEqual({ kind: "one", id: "recA", by: "opportunity" });
  });

  it("links an unlinked quote by contact, then phone, then email", () => {
    expect(matchQuote(quotes, { opportunityId: "oppNEW", contactId: "conY" })).toEqual({ kind: "one", id: "recB", by: "contact" });
    expect(matchQuote(quotes, { phone: "(416) 555-0202" })).toEqual({ kind: "one", id: "recB", by: "phone" });
    expect(matchQuote(quotes, { email: "Y@Example.com" })).toEqual({ kind: "one", id: "recB", by: "email" });
  });

  it("never glues a returning customer's new opportunity onto their old quote", () => {
    // conX's only quote is tied to oppA; a booking for oppNEW must not land on it.
    expect(matchQuote(quotes, { opportunityId: "oppNEW", contactId: "conX", phone: "416-555-0101" })).toEqual({ kind: "none" });
  });

  it("reports two hits as ambiguous and does not fall through to a weaker key", () => {
    expect(matchQuote(quotes, { contactId: "conZ", phone: "416-555-0101" })).toEqual({ kind: "ambiguous", ids: ["recC", "recD"], by: "contact" });
  });

  it("finds nothing rather than guessing", () => {
    expect(matchQuote(quotes, { phone: "416-555-0999" })).toEqual({ kind: "none" });
    expect(matchQuote(quotes, {})).toEqual({ kind: "none" });
  });
});

describe("filling blanks", () => {
  it("fills what is empty, ignores what agrees and reports what differs", () => {
    const { patch, conflicts } = fillBlanks(
      { address: null, city: "Oakville", phone: "416-555-0101" },
      { address: "12 Example St", city: " oakville ", phone: "416-555-0999" },
    );
    expect(patch).toEqual({ address: "12 Example St" });
    expect(conflicts).toEqual([{ field: "phone", current: "416-555-0101", incoming: "416-555-0999" }]);
  });

  it("never blanks out a value", () => {
    expect(fillBlanks({ city: "Oakville" }, { city: "" })).toEqual({ patch: {}, conflicts: [] });
  });
});

describe("lead stage and address status", () => {
  it("maps timing to Hot, Warm and Cold", () => {
    expect(TIMINGS.map(stageFor)).toEqual(["Hot", "Warm", "Cold", "Cold"]);
  });

  it("only moves a new opportunity or one still in Leads", () => {
    expect(stageToSet("Within 1 month", { isNew: true, pipelineId: null }, "pipeLEADS")).toBe("Hot");
    expect(stageToSet("3+ months", { isNew: false, pipelineId: "pipeLEADS" }, "pipeLEADS")).toBe("Cold");
    expect(stageToSet("Within 1 month", { isNew: false, pipelineId: "pipeSALES" }, "pipeLEADS")).toBeNull();
  });

  it("calls an address copied from the contact unconfirmed", () => {
    expect(addressStatus(null, true)).toBe("No address");
    expect(addressStatus("12 Example St", false)).toBe("Unconfirmed");
    expect(addressStatus("12 Example St", true)).toBe("Confirmed");
  });
});


describe("the New quote form", () => {
  it("needs the timing question answered", () => {
    expect(parseNewQuote({ contactId: "abcDEF123456" })).toEqual({ ok: false, message: "Choose when they're planning to do the project." });
  });

  it("takes an existing contact with one of their opportunities, or a new one", () => {
    const r = parseNewQuote({ contactId: "abcDEF123456", opportunityId: "oppXYZ987654", timing: "1 to 3 months", addressConfirmed: true });
    expect(r).toEqual({
      ok: true,
      value: { contactId: "abcDEF123456", opportunityId: "oppXYZ987654", timing: "1 to 3 months", addressConfirmed: true, newCustomer: null, forceNew: false, basis: "Preliminary", origin: null },
    });
    const n = parseNewQuote({ contactId: "abcDEF123456", opportunityId: "", timing: "Not sure" });
    expect(n.ok && n.value.opportunityId).toBeNull();
  });

  it("takes where they found us from the list only (2026-10-27)", () => {
    const pick = parseNewQuote({ contactId: "abcDEF123456", timing: "Not sure", origin: "Meta Ad" });
    expect(pick.ok && pick.value.origin).toBe("Meta Ad");
    const neighbour = parseNewQuote({ contactId: "abcDEF123456", timing: "Not sure", origin: "Neighbour Ad" });
    expect(neighbour.ok && neighbour.value.origin).toBe("Neighbour Ad");
    const off = parseNewQuote({ contactId: "abcDEF123456", timing: "Not sure", origin: "Billboard" });
    expect(off.ok && off.value.origin).toBeNull();
    const fresh = parseNewQuote({ timing: "Not sure", origin: "Direct: Walk-in", newCustomer: { firstName: "Jane", phone: "416-555-0199" } });
    expect(fresh.ok && fresh.value.origin).toBe("Direct: Walk-in");
  });

  it("makes a preliminary unless asked for a measured quote (2026-10-18)", () => {
    const m = parseNewQuote({ contactId: "abcDEF123456", timing: "Not sure", kind: "measured" });
    expect(m.ok && m.value.basis).toBe("Measured");
    const p = parseNewQuote({ contactId: "abcDEF123456", timing: "Not sure", kind: "preliminary" });
    expect(p.ok && p.value.basis).toBe("Preliminary");
    const odd = parseNewQuote({ timing: "Not sure", newCustomer: { firstName: "Sam", phone: "416-555-0100" }, kind: "whatever" });
    expect(odd.ok && odd.value.basis).toBe("Preliminary");
  });

  it("refuses ids that aren't GHL ids, and an opportunity with no customer", () => {
    expect(parseNewQuote({ contactId: "x'; DROP", timing: "Not sure" }).ok).toBe(false);
    expect(parseNewQuote({ opportunityId: "oppXYZ987654", timing: "Not sure" }).ok).toBe(false);
  });

  it("takes a new customer with a name and a way to reach them", () => {
    expect(parseNewQuote({ timing: "3+ months", newCustomer: { firstName: "Jane" } })).toEqual({
      ok: false,
      message: "Add a phone number or an email, so GHL can reach them.",
    });
    expect(parseNewQuote({ timing: "3+ months", newCustomer: { firstName: "Jane", phone: "555-01" } }).ok).toBe(false);
    const r = parseNewQuote({ timing: "Within 1 month", newCustomer: { firstName: " Jane ", lastName: "Doe", phone: "(416) 555 0199", email: "JANE@EXAMPLE.COM" } });
    expect(r).toEqual({
      ok: true,
      value: {
        contactId: null,
        opportunityId: null,
        timing: "Within 1 month",
        addressConfirmed: false,
        newCustomer: { firstName: "Jane", lastName: "Doe", phone: "416-555-0199", email: "jane@example.com", address: null, city: null },
        forceNew: false,
        basis: "Preliminary",
        origin: null,
      },
    });
  });

  it("treats an address typed for a new customer as confirmed", () => {
    const r = parseNewQuote({ timing: "Not sure", newCustomer: { lastName: "Doe", email: "d@example.com", address: "12 Example St", city: "Oakville" } });
    expect(r.ok && r.value.addressConfirmed).toBe(true);
  });
});
