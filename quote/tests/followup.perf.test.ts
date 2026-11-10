import { describe, expect, it } from "vitest";
import { hoursInTiers, lateness, median, needsYouResponse, newEvents, parseEvents, replyGaps, type StateEvent } from "../src/lib/followup/perf";

// Invented times only: this repo is public.
const at = (d: string, h = 15) => `${d}T${String(h).padStart(2, "0")}:00:00.000Z`;

describe("the state log", () => {
  it("adds a tier event only when the tier changes, and a due event once per cycle", () => {
    let log: StateEvent[] = [];
    log = [...log, ...newEvents(log, { at: at("2026-11-01"), tier: "watch", score: 10, dueToday: null, lastTouch: null })];
    expect(log).toHaveLength(1);
    expect(newEvents(log, { at: at("2026-11-02"), tier: "watch", score: 12, dueToday: null, lastTouch: null })).toEqual([]);
    log = [...log, ...newEvents(log, { at: at("2026-11-03"), tier: "needs", score: 24, dueToday: "2026-11-03", lastTouch: null })];
    expect(log.map((e) => e.kind)).toEqual(["tier", "tier", "due"]);
    // Still due the next day, nothing done: no second due event.
    expect(newEvents(log, { at: at("2026-11-04"), tier: "needs", score: 24, dueToday: "2026-11-03", lastTouch: null })).toEqual([]);
    // Followed up, then due again later: a new cycle.
    expect(newEvents(log, { at: at("2026-11-10"), tier: "needs", score: 24, dueToday: "2026-11-10", lastTouch: "2026-11-04" })).toEqual([{ at: at("2026-11-10"), kind: "due", day: "2026-11-10" }]);
  });
  it("reads back only well-formed events", () => {
    expect(parseEvents([{ at: at("2026-11-01"), kind: "tier", tier: "needs", score: 3 }, { at: "x", kind: "due", day: "2026-11-01" }, { at: at("2026-11-01"), kind: "due", day: "nope" }])).toHaveLength(1);
  });
});

describe("reply speed", () => {
  it("times each customer message (a run counts once) to our first human reply", () => {
    const m = [
      { direction: "in" as const, channel: "sms", automated: false, at: at("2026-11-01", 14), callSeconds: null },
      { direction: "in" as const, channel: "sms", automated: false, at: at("2026-11-01", 15), callSeconds: null },
      { direction: "out" as const, channel: "sms", automated: true, at: at("2026-11-01", 15), callSeconds: null },
      { direction: "out" as const, channel: "call", automated: false, at: at("2026-11-01", 16), callSeconds: 0 },
      { direction: "out" as const, channel: "sms", automated: false, at: at("2026-11-01", 17), callSeconds: null },
      { direction: "in" as const, channel: "email", automated: false, at: at("2026-11-02", 15), callSeconds: null },
    ];
    expect(replyGaps(m, at("2026-10-01"))).toEqual([
      { at: at("2026-11-01", 14), hours: 3 },
      { at: at("2026-11-02", 15), hours: null },
    ]);
  });
});

describe("time in tiers, acting on Needs you, lateness", () => {
  const log: StateEvent[] = [
    { at: at("2026-11-01", 10), kind: "tier", tier: "auto", score: 3 },
    { at: at("2026-11-01", 12), kind: "tier", tier: "needs", score: 25 },
    { at: at("2026-11-01", 12), kind: "due", day: "2026-11-01" },
    { at: at("2026-11-02", 12), kind: "tier", tier: "watch", score: 12 },
  ];
  it("adds up hours per tier, the last one to now", () => {
    expect(hoursInTiers(log, new Date(at("2026-11-02", 14)))).toEqual({ auto: 2, needs: 24, watch: 2 });
  });
  it("measures how fast a Needs you was acted on, and how late a due day was met", () => {
    expect(needsYouResponse(log, [at("2026-11-01", 15)])).toEqual([3]);
    expect(needsYouResponse(log, [])).toEqual([null]);
    expect(lateness(log, ["2026-11-03"])).toEqual([2]);
    expect(lateness(log, ["2026-11-01"])).toEqual([0]);
  });
  it("median", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2])).toBe(1.5);
    expect(median([])).toBeNull();
  });
});
