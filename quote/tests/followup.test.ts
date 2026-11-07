import { describe, expect, it } from "vitest";
import { ageWords, byUrgency, dueOf, emptyState, parseState, postponeBack, postponeProblem, serializeState, threadSince, withLost, withSnooze, withTouch, type FollowUpState, type Thread } from "../src/lib/followup/plan";
import { buildLostDetails, buildPostpone, lostDetailsText, lostStatusBody, postponedStageId } from "../src/lib/link/ghlRequest";
import { LOST_REASONS } from "../src/lib/ghl/ids";
import { visitOf, visitWords } from "../src/lib/followup/visit";
import { visitsWithoutQuote, type ContactQuotes } from "../src/lib/followup/visits";
import { briefPrompt, briefSignature, cleanBrief, parseBrief } from "../src/lib/followup/brief";

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

describe("the send itself is not a follow-up (Sent At is a day)", () => {
  it("ignores our messages on the day it was sent, but not a reply that day", () => {
    const d = dueOf({ sentAt: "2026-11-03", validUntil: null, state: emptyState(), thread: { staffTouches: [at("2026-11-03")], lastCustomer: null }, now: new Date(at("2026-11-04")), torontoDay: day });
    expect(d).toMatchObject({ touches: 0, day: "2026-11-06", reason: { kind: "scheduled", touch: 1 } });
    const r = dueOf({ sentAt: "2026-11-03", validUntil: null, state: emptyState(), thread: { staffTouches: [at("2026-11-03")], lastCustomer: at("2026-11-03") }, now: new Date(at("2026-11-04")), torontoDay: day });
    expect(r).toMatchObject({ bucket: "due", reason: { kind: "replied" } });
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

describe("the brief (step 2)", () => {
  const meta = { basedOn: "sig1", at: at("2026-11-07"), model: "m", today: "2026-11-07" };
  it("keeps what is usable and drops what isn't", () => {
    const b = cleanBrief(
      { standing: "Warm, asked about stairs.", asked: [{ text: "Stairs price?", answered: false }, { text: "" }], step: { kind: "call", why: "Big job" }, draft: "Hi Sam", nextDay: "2026-11-14", nextQuote: "next week" },
      meta,
    );
    expect(b).toMatchObject({ asked: [{ text: "Stairs price?", answered: false }], step: { kind: "call" }, draft: "Hi Sam", nextDay: "2026-11-14", nextQuote: "next week", basedOn: "sig1" });
    expect(cleanBrief({ standing: "x", step: { kind: "nonsense" } }, meta)?.step.kind).toBe("text");
    expect(cleanBrief({ standing: "x", step: { kind: "wait" }, draft: "should go" }, meta)?.draft).toBe("");
    expect(cleanBrief({ standing: "x", nextDay: "2026-11-01" }, meta)?.nextDay).toBeNull();
    expect(cleanBrief({ asked: [] }, meta)).toBeNull();
  });
  it("is kept and read back", () => {
    const b = cleanBrief({ standing: "x", step: { kind: "text", why: "y" }, draft: "d", nextDay: "2026-12-01", nextQuote: "December" }, meta)!;
    expect(parseBrief(JSON.parse(JSON.stringify(b)))).toEqual(b);
    expect(parseState(serializeState({ ...emptyState(), brief: b })).brief).toEqual(b);
  });
  it("is rewritten when anything moves", () => {
    const base = { lastMessage: { id: "m1", at: at("2026-11-05") }, opens: 2, touches: 0, postponeUntil: null, sentAt: "2026-11-03" };
    const s = briefSignature(base);
    expect(briefSignature({ ...base })).toBe(s);
    expect(briefSignature({ ...base, lastMessage: { id: "m2", at: at("2026-11-06") } })).not.toBe(s);
    expect(briefSignature({ ...base, opens: 3 })).not.toBe(s);
    expect(briefSignature({ ...base, touches: 1 })).not.toBe(s);
  });
  it("a day they named replaces the schedule", () => {
    const d = dueOf({ sentAt: "2026-11-03", validUntil: null, state: emptyState(), thread: { staffTouches: [], lastCustomer: null }, now: new Date(at("2026-11-07")), torontoDay: day, named: { day: "2026-11-20", quote: "after the 15th" } });
    expect(d).toMatchObject({ bucket: "upcoming", day: "2026-11-20", reason: { kind: "named", quote: "after the 15th" } });
  });
  it("tells Claude no cost, and asks for the JSON", () => {
    const p = briefPrompt(
      { today: "2026-11-07", customer: "Sam", quoteNumber: "Q-1", basis: "Preliminary", sentDay: "2026-11-03", age: 4, validUntil: null, opens: 2, lastOpened: null, options: [{ name: "Vinyl", total: 5000 }], sender: "Joey", typicalCloseDay: 12, scheduleDays: [3, 10, 21], postponedTo: null, loggedHere: [], visit: "No visit yet" },
      [{ id: "1", at: at("2026-11-04"), who: "customer", channel: "sms", body: "Can you do stairs too?" }],
    );
    expect(p).toMatch(/CUSTOMER via sms: Can you do stairs too\?/);
    expect(p).toMatch(/"nextDay"/);
    expect(p).toMatch(/Never mention internal notes, costs or margins/);
    expect(p).not.toMatch(/margin %|cost:/i);
  });
});

describe("the visit chip (2026-11-07)", () => {
  const cal = { inHome: "home1", inStore: "store1" };
  const now = new Date("2026-11-07T17:00:00Z");
  const appt = (o: Partial<{ id: string; calendarId: string; start: string; status: string; title: string }>) => ({ id: "a", calendarId: null, start: null, status: "confirmed", title: null, ...o });
  it("reads booked ahead first, then the latest visit, then a miss, then none", () => {
    expect(visitOf([appt({ calendarId: "home1", start: "2026-11-12T15:00:00Z" }), appt({ calendarId: "store1", start: "2026-11-02T15:00:00Z" })], now, day, cal)).toEqual({ kind: "booked", day: "2026-11-12", where: "in-home" });
    expect(visitOf([appt({ calendarId: "store1", start: "2026-11-02T15:00:00Z", status: "showed" })], now, day, cal)).toEqual({ kind: "visited", day: "2026-11-02", where: "in store" });
    expect(visitOf([appt({ start: "2026-11-03T15:00:00Z", status: "noshow", title: "In-home measure" })], now, day, cal)).toEqual({ kind: "missed", day: "2026-11-03", where: "in-home", why: "no-show" });
    expect(visitOf([], now, day, cal)).toEqual({ kind: "none" });
    expect(visitOf(null, now, day, cal)).toBeNull();
  });
  it("words it plainly", () => {
    expect(visitWords({ kind: "none" })).toBe("No visit yet");
    expect(visitWords({ kind: "booked", day: "2026-11-12", where: "in-home" })).toBe("Visit booked Nov 12 · in-home");
    expect(visitWords({ kind: "visited", day: "2026-11-04", where: "appointment" })).toBe("Visited Nov 4");
  });
  it("a preliminary whose visit happened is owed the measured quote the next day", () => {
    const d = dueOf({ sentAt: "2026-11-01", validUntil: null, state: emptyState(), thread: { staffTouches: [], lastCustomer: null }, now: new Date(at("2026-11-07")), torontoDay: day, visit: { kind: "visited", day: "2026-11-05", where: "in-home" }, preliminary: true });
    expect(d).toMatchObject({ bucket: "due", day: "2026-11-04", reason: { kind: "measure" } });
    const m = dueOf({ sentAt: "2026-11-01", validUntil: null, state: emptyState(), thread: { staffTouches: [], lastCustomer: null }, now: new Date(at("2026-11-07")), torontoDay: day, visit: { kind: "visited", day: "2026-11-05", where: "in-home" }, preliminary: false });
    expect(m?.reason.kind).toBe("scheduled");
  });
});

describe("lost reasons and Lost Details (2026-11-07)", () => {
  const meta = { basedOn: "s", at: "2026-11-07T15:00:00.000Z", model: "m", today: "2026-11-07", lostReasons: LOST_REASONS.map((r) => r.name) };
  it("the brief suggests one of GHL's reasons only, and only to close it out", () => {
    expect(cleanBrief({ standing: "x", step: { kind: "close", why: "y" }, lostReason: "Price - Too High" }, meta)?.lostReason).toBe("Price - Too High");
    expect(cleanBrief({ standing: "x", step: { kind: "close", why: "y" }, lostReason: "Too pricey" }, meta)?.lostReason).toBeUndefined();
    expect(cleanBrief({ standing: "x", step: { kind: "call", why: "y" }, lostReason: "Price - Too High" }, meta)?.lostReason).toBeUndefined();
  });
  it("knows GHL's five reasons, so Lost never goes without one", () => {
    expect(LOST_REASONS.map((r) => r.name)).toContain("Price - Too High");
    expect(LOST_REASONS.every((r) => /^[0-9a-f]{24}$/.test(r.id))).toBe(true);
  });
  it("writes the reason, the note, the day and who on the opportunity", () => {
    expect(lostDetailsText({ reason: "Price - Too High", note: "Went with someone cheaper", day: "2026-11-07", by: "Joey" })).toBe("Price - Too High · Went with someone cheaper · 2026-11-07 · Joey");
    expect(lostDetailsText({ reason: "We Were Too Slow", day: "2026-11-07", by: "Joey" })).toBe("We Were Too Slow · 2026-11-07 · Joey");
    expect(JSON.parse(buildLostDetails({ contactId: "c", opportunityId: "o", fieldId: "f", text: "t" }).oppBody)).toEqual({ customFields: [{ id: "f", field_value: "t" }] });
  });
});

describe("Visited, no quote yet (2026-11-07)", () => {
  const cal = { inHome: "home1", inStore: "store1" };
  const now = new Date("2026-11-07T17:00:00Z");
  const ev = (o: Partial<{ id: string; contactId: string; calendarId: string; start: string; status: string; title: string; assignedUserId: string }>) => ({ id: "e", contactId: "c1", calendarId: "home1", start: "2026-11-05T15:00:00Z", status: "confirmed", title: "Measure - Jane Doe", assignedUserId: "u1", ...o });
  const q = (o: Partial<ContactQuotes>): ContactQuotes => ({ quoteRecordId: "rec1", quoteNumber: "Q-1", customer: "Jane Doe", versionId: "recV", measuredSent: [], closed: false, ...o });
  it("lists a finished visit with no measured quote since, newest first", () => {
    const out = visitsWithoutQuote([ev({}), ev({ contactId: "c2", start: "2026-11-06T15:00:00Z", calendarId: "store1", title: "Store visit - Bo Li" })], new Map([["c1", [q({})]]]), now, day, cal);
    expect(out.map((v) => [v.contactId, v.day, v.where, v.name, v.days])).toEqual([
      ["c2", "2026-11-06", "in store", "Bo Li", 1],
      ["c1", "2026-11-05", "in-home", "Jane Doe", 2],
    ]);
    expect(out[1].quote?.versionId).toBe("recV");
  });
  it("leaves out a visit with a measured quote sent on or after it, a closed quote, a miss, a future one and other calendars", () => {
    const quotes = new Map([["c1", [q({ measuredSent: ["2026-11-05"] })]], ["c3", [q({ closed: true })]]]);
    const out = visitsWithoutQuote(
      [ev({}), ev({ contactId: "c3" }), ev({ contactId: "c4", status: "noshow" }), ev({ contactId: "c5", start: "2026-11-09T15:00:00Z" }), ev({ contactId: "c6", calendarId: "other" }), ev({ contactId: "c7", start: "2026-10-01T15:00:00Z" })],
      quotes,
      now,
      day,
      cal,
    );
    expect(out).toEqual([]);
  });
  it("still flags a visit when the only measured quote went out before it", () => {
    expect(visitsWithoutQuote([ev({})], new Map([["c1", [q({ measuredSent: ["2026-11-01"] })]]]), now, day, cal)).toHaveLength(1);
  });
});

describe("torontoTime", () => {
  it("reads GHL's offset-less appointment time as Toronto wall time", async () => {
    const { torontoTime } = await import("@/lib/followup/visit");
    // The same visit, as /contacts/{id}/appointments and /calendars/events gave it on 2026-11-07.
    expect(torontoTime("2026-10-24 16:30:00")).toBe(new Date("2026-10-24T16:30:00-04:00").toISOString());
    expect(torontoTime("2026-12-02 09:00:00")).toBe(new Date("2026-12-02T09:00:00-05:00").toISOString());
    expect(torontoTime("2026-10-24T16:30:00-04:00")).toBe("2026-10-24T16:30:00-04:00");
    expect(torontoTime(null)).toBeNull();
  });
});
