import { describe, expect, it } from "vitest";
import { ageWords, byUrgency, dueOf, emptyState, parseState, postponeBack, postponeProblem, serializeState, threadSince, withLost, withSnooze, withTouch, type FollowUpState, type Thread } from "../src/lib/followup/plan";
import { buildPostpone, lostStatusBody, postponedStageId } from "../src/lib/link/ghlRequest";

// Invented dates and ids only: this repo is public.
const day = (s: string | Date) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(s).toISOString().slice(0, 10));
const at = (d: string) => `${d}T15:00:00.000Z`;
const due = (o: { sent: string; today: string; state?: FollowUpState; thread?: Thread | null; validUntil?: string | null }) =>
  dueOf({ sentAt: at(o.sent), validUntil: o.validUntil ?? null, state: o.state ?? emptyState(), thread: o.thread === undefined ? { staffTouches: [], lastCustomer: null } : o.thread, now: new Date(at(o.today)), torontoDay: day });

describe("the fallback schedule: 3, 10, 21, then close out at 45", () => {
  it("is due 3 days after sending with nothing done", () => {
    expect(due({ sent: "2026-11-01", today: "2026-11-03" })).toMatchObject({ bucket: "upcoming", day: "2026-11-04", reason: { kind: "scheduled", touch: 1 } });
    expect(due({ sent: "2026-11-01", today: "2026-11-04" })).toMatchObject({ bucket: "due", day: "2026-11-04" });
  });
  it("moves to day 10 after the first touch, and never sooner than a week after a late one", () => {
    expect(due({ sent: "2026-11-01", today: "2026-11-05", thread: { staffTouches: [at("2026-11-04")], lastCustomer: null } })).toMatchObject({ day: "2026-11-11", reason: { touch: 2 } });
    expect(due({ sent: "2026-11-01", today: "2026-11-13", thread: { staffTouches: [at("2026-11-12")], lastCustomer: null } })).toMatchObject({ day: "2026-11-19" });
  });
  it("counts a text and a call on the same day once, and adds I followed up", () => {
    const state = withTouch(emptyState(), { at: at("2026-11-12"), by: "a@x.ca" });
    const d = due({ sent: "2026-11-01", today: "2026-11-13", state, thread: { staffTouches: [at("2026-11-04"), at("2026-11-04")], lastCustomer: null } });
    expect(d).toMatchObject({ touches: 2, reason: { touch: 3 }, day: "2026-11-23" });
  });
  it("asks to close out at day 45 after three touches, then every 14 days", () => {
    const thread = { staffTouches: ["2026-11-04", "2026-11-11", "2026-11-22"].map(at), lastCustomer: null };
    expect(due({ sent: "2026-11-01", today: "2026-11-25", thread })).toMatchObject({ day: "2026-12-16", reason: { kind: "close-out" } });
    expect(due({ sent: "2026-11-01", today: "2026-12-20", thread: { ...thread, staffTouches: [...thread.staffTouches, at("2026-12-17")] } })).toMatchObject({ day: "2026-12-31", reason: { kind: "close-out" } });
  });
  it("never lists a lost quote", () => {
    expect(due({ sent: "2026-11-01", today: "2026-11-20", state: withLost(emptyState(), { at: at("2026-11-10"), by: "a", reasonId: null, reason: null }) })).toBeNull();
  });
});

describe("what moves it sooner", () => {
  it("a reply nobody answered is due the day they wrote", () => {
    expect(due({ sent: "2026-11-01", today: "2026-11-06", thread: { staffTouches: [at("2026-11-02")], lastCustomer: at("2026-11-05") } })).toMatchObject({ bucket: "due", day: "2026-11-05", reason: { kind: "replied" } });
    expect(due({ sent: "2026-11-01", today: "2026-11-06", thread: { staffTouches: [at("2026-11-05")], lastCustomer: at("2026-11-05") } })?.reason.kind).toBe("scheduled");
  });
  it("a passed good-until date is due now", () => {
    expect(due({ sent: "2026-10-01", today: "2026-11-06", validUntil: "2026-10-31", thread: { staffTouches: ["2026-10-04", "2026-10-11", "2026-10-22"].map(at), lastCustomer: null } })).toMatchObject({ bucket: "due", reason: { kind: "expired" } });
  });
  it("still works when GHL couldn't be read", () => {
    expect(due({ sent: "2026-11-01", today: "2026-11-04", thread: null })).toMatchObject({ bucket: "due" });
  });
});

describe("snooze and postpone", () => {
  it("a snooze holds it until it ends, unless they write after it was set", () => {
    const state = withSnooze(emptyState(), "2026-11-04", 7, at("2026-11-04"), "a");
    expect(due({ sent: "2026-11-01", today: "2026-11-05", state })).toMatchObject({ bucket: "snoozed", day: "2026-11-11" });
    expect(due({ sent: "2026-11-01", today: "2026-11-06", state, thread: { staffTouches: [], lastCustomer: at("2026-11-05") } })).toMatchObject({ bucket: "due", reason: { kind: "replied" } });
  });
  it("comes back a month before the date, or halfway when it's under two months away", () => {
    expect(postponeBack("2026-11-07", "2027-03-01")).toBe("2027-01-30");
    expect(postponeBack("2026-11-07", "2026-11-28")).toBe("2026-11-18");
    expect(postponeBack("2026-11-07", "2026-11-08")).toBe("2026-11-08");
  });
  it("is listed under Postponed until it comes back, then due", () => {
    const state: FollowUpState = { ...emptyState(), postpone: { until: "2027-03-01", back: "2027-01-30", at: at("2026-11-07"), by: "a" } };
    expect(due({ sent: "2026-11-01", today: "2026-12-01", state })).toMatchObject({ bucket: "postponed", day: "2027-01-30" });
    expect(due({ sent: "2026-11-01", today: "2027-01-30", state })).toMatchObject({ bucket: "due", reason: { kind: "postponed", until: "2027-03-01" } });
  });
  it("only takes a date after today, within two years", () => {
    expect(postponeProblem("2026-11-07", "2026-11-07")).toMatch(/after today/);
    expect(postponeProblem("2026-11-07", "nope")).toMatch(/Pick/);
    expect(postponeProblem("2026-11-07", "2029-01-01")).toMatch(/two years/);
    expect(postponeProblem("2026-11-07", "2026-12-01")).toBeNull();
  });
});

describe("reading GHL", () => {
  const m = (o: Partial<{ direction: "in" | "out"; channel: string; automated: boolean; at: string; callSeconds: number | null }>) => ({ direction: "out" as const, channel: "sms", automated: false, at: at("2026-11-03"), callSeconds: null, ...o });
  it("counts what a person sent and a call that connected, never automation, comments or before the send", () => {
    const t = threadSince(
      [m({}), m({ automated: true }), m({ channel: "note" }), m({ channel: "call", callSeconds: 0 }), m({ channel: "call", callSeconds: 95, at: at("2026-11-04") }), m({ at: at("2026-10-30") })],
      at("2026-11-01"),
    );
    expect(t.staffTouches).toEqual([at("2026-11-03"), at("2026-11-04")]);
    expect(t.lastCustomer).toBeNull();
  });
  it("a customer's text or missed call wants an answer; their answered call is a touch too", () => {
    expect(threadSince([m({ direction: "in", at: at("2026-11-05") })], at("2026-11-01")).lastCustomer).toBe(at("2026-11-05"));
    expect(threadSince([m({ direction: "in", channel: "call", callSeconds: 0 })], at("2026-11-01")).lastCustomer).toBe(at("2026-11-03"));
    expect(threadSince([m({ direction: "in", channel: "call", callSeconds: 60 })], at("2026-11-01")).staffTouches).toHaveLength(1);
  });
});

describe("the stored field", () => {
  it("round-trips, and reads junk as nothing kept", () => {
    const s = withTouch(emptyState(), { at: at("2026-11-04"), by: "a@x.ca", note: "called" });
    expect(parseState(serializeState(s))).toEqual(s);
    expect(parseState("{not json")).toEqual(emptyState());
    expect(parseState(JSON.stringify({ touches: [{ at: "never" }], snooze: { until: "soon" } }))).toEqual(emptyState());
  });
});

describe("the page", () => {
  it("puts due first, then the earliest", () => {
    const r = (bucket: "due" | "upcoming", d: string) => ({ due: { bucket, day: d, age: 1, touches: 0, lastTouch: null, reason: { kind: "replied" as const } } });
    expect([r("upcoming", "2026-11-01"), r("due", "2026-11-05"), r("due", "2026-11-02")].sort(byUrgency).map((x) => x.due.day)).toEqual(["2026-11-02", "2026-11-05", "2026-11-01"]);
  });
  it("says the age against the typical close", () => {
    expect(ageWords(9)).toBe("day 9 · most close by day 12");
    expect(ageWords(20)).toMatch(/past the usual close/);
  });
});

describe("what goes to GHL", () => {
  it("postpones to the Sales pipeline's Postponed stage with the date", () => {
    const stage = postponedStageId([{ id: "ZxYBFNifUNNxU7xgQclg", name: "Sales", stages: [{ id: "s1", name: "1a. Meeting" }, { id: "s2", name: "1b. Postponed " }] }]);
    expect(stage).toBe("s2");
    const r = buildPostpone({ contactId: "c1", opportunityId: "o1", stageId: "s2", untilFieldId: "f1", until: "2027-03-01" });
    expect(r.mode).toBe("link");
    expect(JSON.parse(r.oppBody)).toEqual({ pipelineId: "ZxYBFNifUNNxU7xgQclg", pipelineStageId: "s2", status: "open", customFields: [{ id: "f1", field_value: "2027-03-01" }] });
    expect(JSON.parse(buildPostpone({ contactId: "c1", opportunityId: "o1", stageId: "s2", untilFieldId: null, until: "2027-03-01" }).oppBody).customFields).toBeUndefined();
  });
  it("sends lost with GHL's own reason, or none", () => {
    expect(lostStatusBody("r9")).toBe('{"status":"lost","lostReasonId":"r9"}');
    expect(lostStatusBody(null)).toBe('{"status":"lost"}');
  });
});
