import { describe, expect, it } from "vitest";
import { curve, DAILY_CAP, HOT_AT, NEEDS_YOU_AT, overCap, scoreOf, staysAuto, twoWay, type ScoreInput, type ScoreMessage, type Signals } from "../src/lib/followup/score";
import { pickSlots } from "../src/lib/followup/slots";
import { cleanBrief } from "../src/lib/followup/brief";
import { emptyState, parseState, serializeState, withAlerted } from "../src/lib/followup/plan";
import { visitedWhere } from "../src/lib/followup/visit";

// Invented dates and numbers only: this repo is public.
const day = (s: string | Date) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(s).toISOString().slice(0, 10));
const at = (d: string, h = 15) => `${d}T${String(h).padStart(2, "0")}:00:00.000Z`;
const msg = (d: string, direction: "in" | "out", o: Partial<ScoreMessage> = {}): ScoreMessage => ({ direction, channel: "sms", automated: false, at: at(d), callSeconds: null, ...o });
/** n messages back and forth, ending with the customer, on the days before `last`. */
const chat = (n: number, last: string): ScoreMessage[] =>
  Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.parse(at(last)) - (n - 1 - i) * 3_600_000).toISOString();
    return { direction: (n - 1 - i) % 2 === 0 ? "in" : "out", channel: "sms", automated: false, at: t, callSeconds: null } as ScoreMessage;
  });
const sig = (o: Partial<Signals> = {}): Signals => ({ buyingQuestion: false, namedDate: false, competitor: false, objection: false, commercial: false, complaint: false, replyClass: "none", ...o });
const input = (o: Partial<ScoreInput> = {}): ScoreInput => ({
  messages: [],
  sentAt: at("2026-11-01"),
  preliminary: true,
  visit: { kind: "none" },
  visited: [],
  value: 5_000,
  opens: 0,
  lastOpened: null,
  signals: null,
  namedDay: null,
  now: new Date(at("2026-11-03")),
  torontoDay: day,
  ...o,
});

describe("the touch curve (Lead to Won Review, 2026-11-03)", () => {
  it("passes through the deck's buckets and flattens past 41", () => {
    expect(curve(0)).toBe(2);
    expect(curve(8)).toBe(8);
    expect(curve(15)).toBe(20);
    expect(curve(30)).toBe(33);
    expect(curve(41)).toBe(47);
    expect(curve(90)).toBe(47);
    expect(curve(11.5)).toBeGreaterThan(8);
    expect(curve(11.5)).toBeLessThan(20);
  });

  it("counts two-way touches as the deck does: no automation, no notes, no missed calls", () => {
    const m = [msg("2026-11-02", "out"), msg("2026-11-02", "in"), msg("2026-11-02", "out", { automated: true }), msg("2026-11-02", "out", { channel: "note" }), msg("2026-11-02", "in", { channel: "call", callSeconds: 0 }), msg("2026-11-02", "out", { channel: "call", callSeconds: 120 })];
    expect(twoWay(m, at("2026-10-01"))).toMatchObject({ ours: 2, theirs: 1 });
  });

  it("weighs a customer message one and a half times ours", () => {
    const ours = scoreOf(input({ messages: Array.from({ length: 10 }, () => msg("2026-11-02", "out")) })).score;
    const theirs = scoreOf(input({ messages: Array.from({ length: 10 }, () => msg("2026-11-02", "in")) })).score;
    expect(theirs).toBeGreaterThan(ours);
  });
});

describe("tiers", () => {
  it("a fresh preliminary with no conversation is Auto and stays with GHL's texts", () => {
    const s = scoreOf(input());
    expect(s.tier).toBe("auto");
    expect(staysAuto({ preliminary: true, tier: s.tier, reason: "scheduled", signals: null })).toBe(true);
  });

  it("a measured quote is never Auto: a person is always on it", () => {
    expect(scoreOf(input({ preliminary: false })).tier).toBe("watch");
    expect(staysAuto({ preliminary: false, tier: "auto", reason: "scheduled", signals: null })).toBe(false);
  });

  it("about 11 to 20 two-way messages reaches Needs you", () => {
    const s = scoreOf(input({ messages: chat(14, "2026-11-02") }));
    expect(s.score).toBeGreaterThanOrEqual(NEEDS_YOU_AT);
    expect(s.tier).toBe("needs");
  });

  it("home plus store lifts it to at least 60, a home visit alone to 28", () => {
    expect(scoreOf(input({ visited: ["in-home", "in store"], visit: { kind: "visited", day: "2026-11-02", where: "in store" } })).score).toBeGreaterThanOrEqual(60 * 1);
    expect(scoreOf(input({ visited: ["in-home"], visit: { kind: "visited", day: "2026-11-02", where: "in-home" } })).score).toBe(28);
  });

  it("value multiplies: the same conversation scores higher on a bigger job", () => {
    const m = chat(8, "2026-11-02");
    const small = scoreOf(input({ messages: m, value: 2_000 })).score;
    const mid = scoreOf(input({ messages: m, value: 5_000 })).score;
    const big = scoreOf(input({ messages: m, value: 15_000 })).score;
    expect(small).toBeLessThan(mid);
    expect(mid).toBeLessThan(big);
  });

  it("fades when the customer goes quiet, unless they named a later day", () => {
    const m = chat(14, "2026-11-02");
    const fresh = scoreOf(input({ messages: m, now: new Date(at("2026-11-03")) })).score;
    const week = scoreOf(input({ messages: m, now: new Date(at("2026-11-10")) })).score;
    const fortnight = scoreOf(input({ messages: m, now: new Date(at("2026-11-17")) })).score;
    const named = scoreOf(input({ messages: m, now: new Date(at("2026-11-17")), namedDay: "2026-12-01" })).score;
    expect(week).toBeLessThan(fresh);
    expect(fortnight).toBeLessThan(week);
    expect(named).toBe(fresh);
  });
});

describe("hard flags put it on Needs you whatever the number", () => {
  const quiet = input({ messages: [msg("2026-11-02", "in")] });
  it.each([
    ["buying", sig({ buyingQuestion: true, replyClass: "intent" })],
    ["objection", sig({ competitor: true })],
    ["objection", sig({ objection: true })],
    ["big", sig({ commercial: true })],
    ["complaint", sig({ complaint: true })],
  ] as const)("%s", (flag, signals) => {
    const s = scoreOf({ ...quiet, signals });
    expect(s.flags).toContain(flag);
    expect(s.tier).toBe("needs");
    expect(s.hot).toBe(true);
  });

  it("a buying question we already answered is no longer a flag", () => {
    const s = scoreOf(input({ messages: [msg("2026-11-02", "in"), msg("2026-11-02", "out", { at: at("2026-11-02", 18) })], signals: sig({ buyingQuestion: true }) }));
    expect(s.flags).not.toContain("buying");
  });

  it("the top value band", () => {
    expect(scoreOf(input({ value: 30_000 })).flags).toContain("big");
  });

  it("gone cold after a long conversation", () => {
    const s = scoreOf(input({ messages: chat(16, "2026-11-02"), now: new Date(at("2026-11-09")) }));
    expect(s.flags).toContain("cold");
  });

  it("an older brief without signals is 'not known': no flag, and a reply keeps the row on the list", () => {
    expect(scoreOf(input({ signals: null })).flags).toEqual([]);
    expect(staysAuto({ preliminary: true, tier: "auto", reason: "replied", signals: null })).toBe(false);
    expect(staysAuto({ preliminary: true, tier: "auto", reason: "replied", signals: sig({ replyClass: "closer" }) })).toBe(true);
    expect(staysAuto({ preliminary: true, tier: "auto", reason: "replied", signals: sig({ replyClass: "intent" }) })).toBe(false);
    expect(staysAuto({ preliminary: true, tier: "auto", reason: "measure", signals: null })).toBe(false);
  });

  it("hot means Needs you at 33 or more, or with a flag", () => {
    const s = scoreOf(input({ messages: chat(30, "2026-11-02") }));
    expect(s.score).toBeGreaterThanOrEqual(HOT_AT);
    expect(s.hot).toBe(true);
  });
});

describe("the daily cap", () => {
  const row = (id: string, owner: string, score: number, flags: string[] = []) => ({ id, owner, score: { score, tier: "needs" as const, reasons: [], flags: flags as never, hot: false, touches: 0 } });
  it("keeps the top 8 per sender and lets the rest wait; a hard flag never waits", () => {
    const rows = [...Array.from({ length: 10 }, (_, i) => row(`a${i}`, "a@x", 20 + i)), row("flag", "a@x", 1, ["buying"]), row("b0", "b@x", 21)];
    const wait = overCap(rows);
    expect(wait.has("flag")).toBe(false);
    expect(wait.has("b0")).toBe(false);
    // 8 a day including the flagged one: the 7 highest unflagged stay.
    expect([...wait].sort()).toEqual(["a0", "a1", "a2"]);
    expect(rows.filter((r) => r.owner === "a@x").length - wait.size).toBe(DAILY_CAP);
  });
});

describe("the brief's signals", () => {
  const meta = { basedOn: "s", at: at("2026-11-03"), model: "m", today: "2026-11-03" };
  it("keeps only real trues and a known reply class", () => {
    const b = cleanBrief({ standing: "x", step: { kind: "text" }, signals: { buyingQuestion: true, competitor: "yes", replyClass: "maybe" } }, meta);
    expect(b?.signals).toEqual(sig({ buyingQuestion: true, replyClass: "none" }));
  });
  it("is null on a brief written before it existed", () => {
    expect(cleanBrief({ standing: "x", step: { kind: "text" } }, meta)?.signals).toBeNull();
  });
});

describe("alerts once per rise", () => {
  it("keeps when it alerted on Quotes → Follow Up", () => {
    const s = withAlerted(emptyState(), { at: at("2026-11-03"), score: 40 });
    expect(parseState(serializeState(s)).alerted).toEqual({ at: at("2026-11-03"), score: 40 });
    expect(parseState(serializeState(emptyState())).alerted).toBeUndefined();
  });
});

describe("visits that went ahead", () => {
  const cal = { inHome: "calHome", inStore: "calStore" };
  it("reads home and store from the calendars, skipping no-shows and future ones", () => {
    const appts = [
      { id: "1", calendarId: "calHome", start: at("2026-11-01"), status: "confirmed", title: null },
      { id: "2", calendarId: "calStore", start: at("2026-11-02"), status: "noshow", title: null },
      { id: "3", calendarId: "calStore", start: at("2026-11-20"), status: "confirmed", title: null },
    ];
    expect(visitedWhere(appts, new Date(at("2026-11-05")), cal)).toEqual(["in-home"]);
  });
});

describe("firm-date slots", () => {
  const now = new Date(at("2026-11-09", 14));
  it("offers real slots only, from tomorrow, one a day, near a booked visit first", () => {
    const free = [at("2026-11-09", 20), at("2026-11-10", 15), at("2026-11-10", 17), at("2026-11-11", 15), at("2026-11-12", 18), at("2026-11-13", 15)];
    const booked = [at("2026-11-12", 16)];
    const out = pickSlots(free, booked, now, day);
    expect(out.length).toBe(3);
    expect(out.some((s) => s.at === at("2026-11-09", 20))).toBe(false);
    expect(out.find((s) => s.at === at("2026-11-12", 18))?.near).toBe(true);
    expect(new Set(out.map((s) => s.at.slice(0, 10))).size).toBe(3);
  });
  it("offers nothing when the calendar has nothing", () => {
    expect(pickSlots([], [], now, day)).toEqual([]);
  });
});
