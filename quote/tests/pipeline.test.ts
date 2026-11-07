import { describe, expect, it } from "vitest";
import { followUpReasons, groupVersions, inFilter, offerValue, QUOTE_FILTERS, quoteValue, reasonWords, sortGroups, type OptionMoney, type QuoteHead, type VersionRow } from "../src/lib/quotes/group";
import { money, pulse, valueWords } from "../src/lib/quotes/pipeline";

// INVENTED people and numbers only: this repo is public.
const O = (o: Partial<OptionMoney> & { id: string; total: number | null }): OptionMoney => ({ recommended: false, notOffered: false, part: null, scope: null, sortOrder: 0, ...o });
const V = (o: Partial<VersionRow> & { id: string; quoteRecordId: string | null }): VersionRow & { quoteRecordId: string | null } => ({ label: null, version: 1, status: "Draft", basis: "Measured", optionCount: 1, createdTime: "2026-11-01T00:00:00Z", ...o });
const H = (o: Partial<QuoteHead> & { quoteRecordId: string }): QuoteHead => ({ quoteNumber: null, customerName: null, siteCity: null, phone: null, email: null, projectNumber: null, linkStatus: null, addressStatus: null, ...o });
const one = (v: Partial<VersionRow>, head: Partial<Omit<QuoteHead, "quoteRecordId">> = {}) => groupVersions([V({ id: "v", quoteRecordId: "q", ...v })], new Map([["q", H({ quoteRecordId: "q", ...head })]]))[0];
const NOW = new Date("2026-11-07T15:00:00Z"); // Saturday 10 am, Toronto

describe("Value: what a quote is worth on the list", () => {
  it("is the one option's total, and nothing when no option is priced", () => {
    expect(offerValue([O({ id: "a", total: 9640 })])).toEqual({ kind: "quote", low: 9640, high: 9640, likely: 9640, recommended: true, options: 1 });
    expect(offerValue([O({ id: "a", total: null })])).toBeNull();
    expect(offerValue([])).toBeNull();
  });

  it("reads alternatives as a range, the recommended one as likely, else the cheapest", () => {
    const v = offerValue([O({ id: "a", total: 8200 }), O({ id: "b", total: 11400, recommended: true }), O({ id: "c", total: 9000 })]);
    expect(v).toMatchObject({ low: 8200, high: 11400, likely: 11400, recommended: true, options: 3 });
    expect(offerValue([O({ id: "a", total: 8200 }), O({ id: "b", total: 11400 })])).toMatchObject({ likely: 8200, recommended: false });
  });

  it("adds one option per part: flooring and stairs are both taken", () => {
    const v = offerValue([
      O({ id: "f1", total: 10000, scope: "Flooring", recommended: true }),
      O({ id: "f2", total: 12000, scope: "Flooring" }),
      O({ id: "s1", total: 4000, scope: "Stairs" }),
    ]);
    expect(v).toMatchObject({ low: 14000, high: 16000, likely: 14000, recommended: true });
    expect(offerValue([O({ id: "a", total: 3000, part: "Main floor" }), O({ id: "b", total: 2000, part: "Basement" })])).toMatchObject({ low: 5000, high: 5000 });
  });

  it("never counts an option left off what was sent", () => {
    expect(offerValue([O({ id: "a", total: 5000 }), O({ id: "b", total: 50000, notOffered: true })])).toMatchObject({ low: 5000, high: 5000 });
  });

  it("is the contract once accepted, else the accepted options, else the offer", () => {
    const opts = [O({ id: "a", total: 5000 }), O({ id: "b", total: 7000 })];
    expect(quoteValue(one({ status: "Accepted", options: opts }, { contractTotal: 7345.5 }))).toEqual({ kind: "contract", total: 7345.5 });
    expect(quoteValue(one({ status: "Won", options: opts, acceptedOptionIds: ["b"] }, { projectNumber: "PP-1" }))).toEqual({ kind: "contract", total: 7000 });
    expect(quoteValue(one({ status: "Sent", options: opts }))).toMatchObject({ kind: "quote", low: 5000, high: 7000 });
  });

  it("words it for the column", () => {
    expect(valueWords(quoteValue(one({ options: [O({ id: "a", total: 9640 })] })))).toMatchObject({ main: "$9,640", sub: null });
    expect(valueWords({ kind: "quote", low: 8200, high: 11400, likely: 9600, recommended: true, options: 2 })).toMatchObject({ main: "$8.2k–$11.4k", sub: "Rec. $9.6k" });
    expect(valueWords({ kind: "contract", total: 12400 })).toMatchObject({ main: "$12,400", sub: "Contract" });
    expect(valueWords(null)).toBeNull();
    expect(money(950, true)).toBe("$950");
    expect(money(123456, true)).toBe("$123k");
  });

  it("sorts by value, unpriced last", () => {
    const gs = groupVersions(
      [V({ id: "x", quoteRecordId: "x", options: [O({ id: "1", total: 3000 })] }), V({ id: "y", quoteRecordId: "y", options: [] }), V({ id: "z", quoteRecordId: "z", options: [O({ id: "2", total: 9000 })] })],
      new Map(["x", "y", "z"].map((k) => [k, H({ quoteRecordId: k })])),
    );
    expect(sortGroups(gs, { key: "value", dir: "desc" }).map((g) => g.quoteRecordId)).toEqual(["z", "x", "y"]);
    expect(sortGroups(gs, { key: "value", dir: "asc" }).map((g) => g.quoteRecordId)).toEqual(["x", "z", "y"]);
  });
});

describe("Follow up: sent quotes that want a nudge", () => {
  const sent = (o: Partial<VersionRow>, head: Partial<Omit<QuoteHead, "quoteRecordId">> = {}) => one({ status: "Sent", tracked: true, sentAt: "2026-11-06", openedCount: 1, ...o }, head);

  it("is a sent quote not opened in two days, opened three times, or near its good-until date", () => {
    expect(followUpReasons(sent({ sentAt: "2026-11-05", openedCount: 0 }), NOW)).toEqual([{ kind: "unopened", days: 2 }]);
    expect(followUpReasons(sent({ sentAt: "2026-11-06", openedCount: 0 }), NOW)).toEqual([]);
    expect(followUpReasons(sent({ openedCount: 3 }), NOW)).toEqual([{ kind: "opened", opens: 3 }]);
    expect(followUpReasons(sent({ validUntil: "2026-11-14" }), NOW)).toEqual([{ kind: "expiring", days: 7 }]);
    expect(followUpReasons(sent({ validUntil: "2026-11-15" }), NOW)).toEqual([]);
    expect(followUpReasons(sent({ validUntil: "2026-11-05" }), NOW)).toEqual([{ kind: "expiring", days: -2 }]);
  });

  it("counts the Sent At date-time as its Toronto day", () => {
    // 01:30 UTC on the 6th is still the 5th in Toronto: two days ago.
    expect(followUpReasons(sent({ sentAt: "2026-11-06T01:30:00.000Z", openedCount: 0 }), NOW)).toEqual([{ kind: "unopened", days: 2 }]);
  });

  it("never flags an untracked link as unopened, nor a draft, an accepted, won, lost or expired quote", () => {
    expect(followUpReasons(sent({ sentAt: "2026-10-01", openedCount: 0, tracked: false }), NOW)).toEqual([]);
    expect(followUpReasons(one({ status: "Draft", openedCount: 5 }), NOW)).toEqual([]);
    expect(followUpReasons(sent({ openedCount: 9 }, { projectNumber: "PP-9" }), NOW)).toEqual([]);
    const lost = groupVersions(
      [V({ id: "a", quoteRecordId: "q", version: 1, status: "Sent", openedCount: 9 }), V({ id: "b", quoteRecordId: "q", version: 2, status: "Lost" })],
      new Map([["q", H({ quoteRecordId: "q" })]]),
    )[0];
    expect(followUpReasons(lost, NOW)).toEqual([]);
  });

  it("keeps chasing the sent version while a new draft is worked on above it", () => {
    const g = groupVersions(
      [V({ id: "a", quoteRecordId: "q", version: 1, status: "Sent", openedCount: 4 }), V({ id: "b", quoteRecordId: "q", version: 2, status: "Draft" })],
      new Map([["q", H({ quoteRecordId: "q" })]]),
    )[0];
    expect(followUpReasons(g, NOW)).toEqual([{ kind: "opened", opens: 4 }]);
    expect(inFilter(g, "followup", NOW)).toBe(true);
  });

  it("is a quick filter, after All", () => {
    expect(QUOTE_FILTERS.map((f) => f.key).slice(0, 2)).toEqual(["all", "followup"]);
  });

  it("words each reason", () => {
    expect(reasonWords({ kind: "unopened", days: 3 }).text).toBe("Not opened in 3 days");
    expect(reasonWords({ kind: "opened", opens: 4 }).text).toBe("Opened 4×, no answer");
    expect(reasonWords({ kind: "expiring", days: 1 }).text).toBe("Expires in 1 day");
    expect(reasonWords({ kind: "expiring", days: 0 }).text).toBe("Expires today");
    expect(reasonWords({ kind: "expiring", days: -1 })).toEqual({ text: "Expired yesterday", tone: "bad" });
  });
});

describe("The strip: what is out, what to chase, what came in", () => {
  it("adds the likely value of what is out, and this month's yeses", () => {
    const gs = groupVersions(
      [
        V({ id: "s1", quoteRecordId: "a", status: "Sent", tracked: true, sentAt: "2026-11-01", openedCount: 0, options: [O({ id: "1", total: 8000 }), O({ id: "2", total: 10000, recommended: true })] }),
        V({ id: "s2", quoteRecordId: "b", status: "Sent", options: [] }),
        V({ id: "w1", quoteRecordId: "c", status: "Won", acceptedAt: "2026-11-03", options: [O({ id: "3", total: 5000 })], acceptedOptionIds: ["3"] }),
        V({ id: "w2", quoteRecordId: "d", status: "Accepted", acceptedAt: "2026-10-30", options: [O({ id: "4", total: 7000 })] }),
        V({ id: "l1", quoteRecordId: "e", status: "Lost", acceptedAt: "2026-11-02", options: [O({ id: "5", total: 9000 })], acceptedOptionIds: ["5"] }),
      ],
      new Map([
        ["a", H({ quoteRecordId: "a" })],
        ["b", H({ quoteRecordId: "b", linkStatus: "Needs linking" })],
        ["c", H({ quoteRecordId: "c", projectNumber: "PP-3", contractTotal: 5650 })],
        ["d", H({ quoteRecordId: "d" })],
        ["e", H({ quoteRecordId: "e" })],
      ]),
    );
    expect(pulse(gs, NOW)).toEqual({
      out: { count: 2, value: 10000, unpriced: 1 },
      followUp: 1,
      // October's yes and a cancelled one (Lost) don't count.
      acceptedThisMonth: { count: 1, value: 5650 },
      linking: 1,
    });
  });
});
