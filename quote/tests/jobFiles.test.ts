import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ASK_MARK, bookedRunPayload, lastAsk, parseBooking } from "../src/lib/link/booking";
import { jobToken, jobTokenOk } from "../src/lib/quotes/jobToken";

// INVENTED ids and people only: this repo is public.
const Q = "recQUOTE00000000A";
const C = "conJANE00001";

describe("Create CompanyCam + folder (2026-11-16)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("still reads a booking from GHL as before", () => {
    expect(parseBooking({ contactId: C, opportunityId: "", quoteRecordId: "", manual: "" })).toEqual({ ok: true, value: { opportunityId: null, contactId: C } });
  });

  it("reads a run from the quote app only with a well-formed quote and signature", () => {
    const token = "a".repeat(64);
    expect(parseBooking({ contactId: C, opportunityId: "oppJOB000001", quoteRecordId: Q, manual: token })).toEqual({
      ok: true,
      value: { opportunityId: "oppJOB000001", contactId: C, fromApp: { quoteRecordId: Q, token } },
    });
    expect(parseBooking({ contactId: C, quoteRecordId: Q, manual: "" }).ok).toBe(false);
    expect(parseBooking({ contactId: C, quoteRecordId: "nope", manual: token }).ok).toBe(false);
    expect(parseBooking({ contactId: C, manual: token }).ok).toBe(false);
  });

  it("signs with the booking key, for that quote and contact only", () => {
    expect(jobToken(Q, C)).toBeNull();
    vi.stubEnv("QUOTE_BOOKING_KEY", "test-key-not-real");
    const t = jobToken(Q, C)!;
    expect(t).toMatch(/^[a-f0-9]{64}$/);
    expect(jobTokenOk(t, Q, C)).toBe(true);
    expect(jobTokenOk(t, "recQUOTE00000000B", C)).toBe(false);
    expect(jobTokenOk(t, Q, "conJOHN00001")).toBe(false);
    expect(jobTokenOk("b".repeat(64), Q, C)).toBe(false);
    vi.stubEnv("QUOTE_BOOKING_KEY", "");
    expect(jobTokenOk(t, Q, C)).toBe(false);
  });

  it("sends Make the fields GHL's workflow sends, the site as it stands, and the quote with its signature", () => {
    const p = bookedRunPayload({ contactId: C, opportunityId: null, quoteRecordId: Q, token: "t", name: "Jane Doe", phone: "+15550000000", email: null, address: "1 Example St", city: "Testville" });
    expect(p).toEqual({
      contact_id: C,
      full_name: "Jane Doe",
      phone: "+15550000000",
      email: "",
      city: "Testville",
      customData: { opportunity_id: "", project_address: "1 Example St", project_city: "Testville", contact_number: "+15550000000", quote_record_id: Q, manual: "t" },
    });
  });

  it("finds the last ask in the quote's notes", () => {
    expect(lastAsk(null)).toBeNull();
    expect(lastAsk("2026-11-01: booked.")).toBeNull();
    const notes = `2026-11-01: booked.\n2026-11-16T14:05:00.000Z: ${ASK_MARK} by Sam.\n2026-11-16T15:00:00.000Z: ${ASK_MARK} by Sam.`;
    expect(lastAsk(notes)).toBe(Date.parse("2026-11-16T15:00:00.000Z"));
  });
});
