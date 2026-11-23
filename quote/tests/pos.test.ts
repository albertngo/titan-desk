import { describe, expect, it } from "vitest";
import { buildCustomer, isWonContact, logWords, parseState, serializeState, todo } from "../src/lib/pos/plan";

const base = { firstName: "Test", lastName: "Person", email: " Test@Example.com ", phone: "(555) 010-0000", address: "1 Sample St", city: "Sampleville", postalCode: "a1a 1a1", contactId: "abc123", quoteNumber: "Q-1" };

describe("POS customers", () => {
  it("builds the customer with the GHL contact and quote in the note", () => {
    const c = buildCustomer(base)!;
    expect(c.email).toBe("test@example.com");
    expect(c.phone).toBe("+15550100000");
    expect(c.postalCode).toBe("A1A 1A1");
    expect(c.note).toBe("GHL contact abc123 · Quote Q-1");
  });
  it("needs a name and an email or phone", () => {
    expect(buildCustomer({ ...base, email: null, phone: null })).toBeNull();
    expect(buildCustomer({ ...base, firstName: null, lastName: "" })).toBeNull();
  });
  it("does each system once, and only when switched on", () => {
    const s = parseState(serializeState({ lightspeed: { id: "1", how: "linked", at: "x" } }));
    expect(todo(s, { lightspeed: true, hike: true })).toEqual(["hike"]);
    expect(todo(s, { lightspeed: true, hike: false })).toEqual([]);
    expect(parseState("nonsense")).toEqual({});
  });
  it("reads won from any opportunity", () => {
    expect(isWonContact([{ status: "open" }, { status: "won" }])).toBe(true);
    expect(isWonContact([{ status: "lost" }])).toBe(false);
  });
  it("logs in plain words", () => {
    expect(logWords([{ system: "lightspeed", ok: true, how: "created" }, { system: "hike", ok: false, message: "down" }])).toBe("POS customers: Lightspeed created; Hike failed (down)");
  });
});
