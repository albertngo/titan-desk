import { describe, expect, it } from "vitest";
import { ago, fromLabel, fromWords, groupVersions, inFilter, matchesSearch, openedOn, type QuoteHead, type VersionRow } from "../src/lib/quotes/group";

// INVENTED people and numbers only: this repo is public.
const V = (o: Partial<VersionRow> & { id: string; quoteRecordId: string | null }): VersionRow & { quoteRecordId: string | null } => ({ label: null, version: 1, status: "Draft", basis: "Preliminary", optionCount: 1, createdTime: "2026-10-01T00:00:00Z", ...o });
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

describe("All quotes: quick filters and dates", () => {
  it("files each quote under the filters its newest version and links say", () => {
    const g = (o: Partial<Omit<QuoteHead, "quoteRecordId">>, status: string) => ({ ...H({ quoteRecordId: "recX", ...o }), versions: [V({ id: "x", quoteRecordId: "recX", status })], latestAt: "" });
    expect(inFilter(g({ linkStatus: "Needs linking" }, "Draft"), "linking")).toBe(true);
    expect(inFilter(g({}, "Draft"), "draft")).toBe(true);
    expect(inFilter(g({}, "Sent"), "draft")).toBe(false);
    expect(inFilter(g({}, "Sent"), "sent")).toBe(true);
    expect(inFilter(g({ projectNumber: "PP-1" }, "Superseded"), "won")).toBe(true);
    // 2026-10-27: accepted with no PP number yet is Accepted; with one, Won. Neither is Sent.
    expect(inFilter(g({}, "Accepted"), "accepted")).toBe(true);
    expect(inFilter(g({}, "Accepted"), "won")).toBe(false);
    expect(inFilter(g({ projectNumber: "PP-2" }, "Won"), "accepted")).toBe(false);
    expect(inFilter(g({ projectNumber: "PP-2" }, "Sent"), "sent")).toBe(false);
    expect(inFilter(g({}, "Lost"), "all")).toBe(true);
  });

  it("says when, the way staff would", () => {
    const now = new Date("2026-10-15T16:00:00Z");
    expect(ago("2026-10-15T13:00:00Z", now)).toBe("Today");
    expect(ago("2026-10-14T20:00:00Z", now)).toBe("Yesterday");
    expect(ago("2026-10-12T20:00:00Z", now)).toBe("3 days ago");
    expect(ago("2026-09-01T16:00:00Z", now)).toBe("Sep 1");
  });

  it("says when the customer last opened a version: the time today or yesterday, then the date", () => {
    const now = new Date("2026-10-15T16:00:00Z"); // 12:00 pm in Toronto
    expect(openedOn("2026-10-15T18:14:00Z", now)).toBe("today 2:14 pm");
    expect(openedOn("2026-10-15T03:30:00Z", now)).toBe("yesterday 11:30 pm"); // late evening in Toronto, already the 15th in UTC
    expect(openedOn("2026-10-14T13:05:00Z", now)).toBe("yesterday 9:05 am");
    expect(openedOn("2026-10-12T20:00:00Z", now)).toBe("Oct 12");
    expect(openedOn("2025-09-01T16:00:00Z", now)).toBe("Sep 1, 2025");
  });
});

describe("fromLabel", () => {
  const vs = [
    { id: "v9", version: 9 },
    { id: "v8", version: 8 },
    { id: "v4", version: 4 },
    { id: "v1", version: 1 },
  ];
  it("names the older version a draft was branched from", () => {
    expect(fromLabel({ supersedes: "v4" }, vs)).toBe("from v4");
  });
  it("puts the change number first on a change", () => {
    expect(fromLabel({ supersedes: "v4", changeNo: 3 }, vs)).toBe("Change 3 · from v4");
  });
  it("says nothing for version 1", () => {
    expect(fromLabel({ supersedes: null, changeNo: null }, vs)).toBeNull();
  });
  it("ignores a source id that is not one of this quote's versions", () => {
    expect(fromLabel({ supersedes: "recElsewhere" }, vs)).toBeNull();
    expect(fromLabel({ supersedes: "recElsewhere", changeNo: 2 }, vs)).toBe("Change 2");
  });
  it("fromWords builds the header words", () => {
    expect(fromWords(1, 4)).toBe("Change 1 · from v4");
    expect(fromWords(null, 8)).toBe("from v8");
    expect(fromWords(null, null)).toBeNull();
  });
});
