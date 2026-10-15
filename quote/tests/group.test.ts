import { describe, expect, it } from "vitest";
import { groupVersions, matchesSearch, type QuoteHead, type VersionRow } from "../src/lib/quotes/group";

// INVENTED people and numbers only: this repo is public.
const V = (o: Partial<VersionRow> & { id: string; quoteRecordId: string | null }) => ({ label: null, version: 1, status: "Draft", basis: "Preliminary", optionCount: 1, createdTime: "2026-10-01T00:00:00Z", ...o });
const H = (o: Partial<QuoteHead> & { quoteRecordId: string }): QuoteHead => ({ quoteNumber: null, customerName: null, siteCity: null, phone: null, email: null, projectNumber: null, linkStatus: null, addressStatus: null, ...o });

const heads = new Map([
  ["recJane", H({ quoteRecordId: "recJane", quoteNumber: "Q-1001", customerName: "Jane Doe", siteCity: "Scarborough", phone: "+14165550199", email: "jane@example.com" })],
  ["recSam", H({ quoteRecordId: "recSam", quoteNumber: "Q-1002", customerName: "Sam Lee", projectNumber: "PP-400" })],
]);
const groups = groupVersions(
  [
    V({ id: "v1", quoteRecordId: "recJane", version: 1, label: "Q-1001 v1", createdTime: "2026-10-01T00:00:00Z" }),
    V({ id: "v2", quoteRecordId: "recJane", version: 2, label: "Q-1001 v2", basis: "Measured", createdTime: "2026-10-09T00:00:00Z" }),
    V({ id: "s1", quoteRecordId: "recSam", createdTime: "2026-10-05T00:00:00Z" }),
    V({ id: "lone", quoteRecordId: null, createdTime: "2026-09-01T00:00:00Z" }),
  ],
  heads,
);

describe("All quotes: one row per quote", () => {
  it("puts each quote's versions under it, newest version first, and the quote with the newest version first", () => {
    expect(groups.map((g) => [g.quoteNumber, g.versions.map((v) => v.id)])).toEqual([
      ["Q-1001", ["v2", "v1"]],
      ["Q-1002", ["s1"]],
      [null, ["lone"]],
    ]);
  });
});

describe("All quotes: search", () => {
  const jane = groups[0];
  it("finds a customer by name, quote number, city, email or project number, ignoring case", () => {
    for (const q of ["jane", "DOE", "q-1001", "scarb", "jane@example", "jane doe"]) expect(matchesSearch(jane, q)).toBe(true);
    expect(matchesSearch(groups[1], "pp-400")).toBe(true);
    expect(matchesSearch(jane, "sam")).toBe(false);
    expect(matchesSearch(jane, "jane lee")).toBe(false);
  });

  it("finds a phone number however it is typed", () => {
    for (const q of ["416 555", "416-555-0199", "(416) 555-0199", "5550199"]) expect(matchesSearch(jane, q)).toBe(true);
    expect(matchesSearch(jane, "999")).toBe(false);
  });

  it("shows everything when the search is empty", () => {
    expect(groups.filter((g) => matchesSearch(g, "  "))).toHaveLength(groups.length);
  });
});
