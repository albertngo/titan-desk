import { describe, expect, it } from "vitest";
import { buildCustomer, createdId, firstMatch, hikeBody, isWonContact, lightspeedBody, lightspeedQueries, logWords, parseState, serializeState, todo } from "../src/lib/pos/plan";

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

  it("matches by email or the last 10 phone digits, never loosely", () => {
    const c = buildCustomer(base)!;
    expect(firstMatch([{ id: 7, phone: "555-010-9999" }, { id: 8, phone: "1 (555) 010-0000" }], c)).toBe("8");
    expect(firstMatch([{ id: "x", email: "TEST@example.com" }], c)).toBe("x");
    expect(firstMatch([{ id: 9, phone: "0000" }], c)).toBeNull();
    expect(firstMatch("nope", c)).toBeNull();
  });
  it("never sends an id when creating", () => {
    const c = buildCustomer(base)!;
    expect("id" in lightspeedBody(c)).toBe(false);
    expect("id" in hikeBody(c)).toBe(false);
    expect(lightspeedBody(c).note).toBe("GHL contact abc123 · Quote Q-1");
    expect(lightspeedQueries(c)[0]).toBe("email=test%40example.com");
  });
  it("reads the new id from any answer shape", () => {
    expect(createdId({ data: { id: "a" } })).toBe("a");
    expect(createdId({ id: 3 })).toBe("3");
    expect(createdId({ result: { id: "r" } })).toBe("r");
    expect(createdId({})).toBeNull();
  });
});
