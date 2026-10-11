import { describe, expect, it } from "vitest";
import { isQuoter, parseAllowlist } from "../src/lib/access";

describe("quoter allowlist", () => {
  it("fails closed when unset or empty", () => {
    expect(isQuoter("someone@example.com", parseAllowlist(undefined))).toBe(false);
    expect(isQuoter("someone@example.com", parseAllowlist(" , "))).toBe(false);
  });

  it("matches case- and space-insensitively", () => {
    const allow = parseAllowlist(" Owner@Example.com ,rep@example.com");
    expect(isQuoter("owner@example.com", allow)).toBe(true);
    expect(isQuoter("REP@example.com ", allow)).toBe(true);
  });

  it("rejects anyone not listed, and non-strings", () => {
    const allow = parseAllowlist("owner@example.com");
    expect(isQuoter("staff@example.com", allow)).toBe(false);
    expect(isQuoter(undefined, allow)).toBe(false);
    expect(isQuoter(["owner@example.com"], allow)).toBe(false);
  });
});
