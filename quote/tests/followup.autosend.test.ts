import { describe, expect, it } from "vitest";
import { amountsOk, autoBlock, channelFor, checkDraft, editShare, readiness, type AutoInput, type SentLog } from "../src/lib/followup/autosend";
import { dueOf, emptyState, parseState, serializeState, withAutoOff, withSent } from "../src/lib/followup/plan";
import { scoreOf, staysAuto } from "../src/lib/followup/score";

// Invented dates, names and numbers only: this repo is public.
const day = (s: string | Date) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(s).toISOString().slice(0, 10));
const at = (d: string, h = 15) => `${d}T${String(h).padStart(2, "0")}:00:00.000Z`;
/** 2026-11-10 is a Tuesday; 15:00Z is 10am in Toronto. */
const TUE_10AM = new Date(at("2026-11-10", 15));
const base = (o: Partial<AutoInput> = {}): AutoInput => ({
  switchOn: true,
  quoteOn: true,
  measured: true,
  dueNow: true,
  briefCurrent: true,
  kind: "checkin",
  stepKind: "text",
  draft: "Hi Sam, any questions on the quote so far? - Jo",
  flags: [],
  unanswered: false,
  value: 8_000,
  sent: [],
  now: TUE_10AM,
  ...o,
});
const log = (atIso: string, o: Partial<SentLog> = {}): SentLog => ({ at: atIso, kind: "checkin", how: "tap", channel: "sms", by: "jo@x", edited: 0, ...o });

describe("checkDraft: nothing goes out with a price the quote doesn't carry", () => {
  it("accepts the quote's own total, with or without cents or commas", () => {
    expect(amountsOk("The total came to $8,240 with HST.", [8240.4])).toEqual({ ok: true });
    expect(amountsOk("About $8.2k all in.", [8240])).toEqual({ ok: true });
    expect(checkDraft({ text: "It's $8,240.40 for the main floor.", channel: "sms" }, [8240.4])).toBeNull();
  });
  it("refuses an invented price or discount", () => {
    expect(checkDraft({ text: "I can do it for $7,500 if you book this week.", channel: "sms" }, [8240])).toMatch(/\$7,500 isn't a price on this quote/);
    expect(checkDraft({ text: "Take $500 off.", channel: "sms" }, [8240])).toMatch(/isn't a price/);
  });
  it("refuses a long dash, an over-long text, and an email with no subject", () => {
    expect(checkDraft({ text: "Hi — there", channel: "sms" }, [])).toMatch(/long dash/);
    expect(checkDraft({ text: "x".repeat(500), channel: "sms" }, [])).toMatch(/at most/);
    expect(checkDraft({ text: "Hi", channel: "email", subject: "" }, [])).toMatch(/subject/);
    expect(checkDraft({ text: "Hi", channel: "email", subject: "Your quote" }, [])).toBeNull();
  });
});

describe("autoBlock: every guardrail (Albert, 2026-11-09)", () => {
  it("lets a routine measured check-in go, in hours", () => {
    expect(autoBlock(base())).toBeNull();
  });
  it.each([
    ["the app switch is off", { switchOn: false }, /off for the app/],
    ["this quote's switch is off", { quoteOn: false }, /off for this quote/],
    ["a preliminary", { measured: false }, /Only measured/],
    ["not due", { dueNow: false }, /Not due/],
    ["an old brief", { briefCurrent: false }, /out of date/],
    ["a call step", { stepKind: "call" }, /for a person/],
    ["a slot offer", { kind: "slot" }, /check-ins and nudges/],
    ["their message is open", { unanswered: true }, /waiting on a person/],
    ["a flag", { flags: ["buying"] }, /flag/],
    ["a $25k+ job", { value: 30_000 }, /\$25k/],
    ["Sunday", { now: new Date(at("2026-11-15", 15)) }, /Monday to Saturday/],
    ["8am", { now: new Date(at("2026-11-10", 13)) }, /9:00 to 19:00/],
    ["7pm", { now: new Date(at("2026-11-11", 0)) }, /9:00 to 19:00/],
    ["one in the last 2 days", { sent: [log(at("2026-11-09", 15))] }, /last 48 hours/],
    ["4 already sent", { sent: [1, 2, 3, 4].map((n) => log(at(`2026-10-0${n}`))) }, /4 already/],
  ] as const)("blocks when %s", (_w, o, re) => {
    expect(autoBlock(base(o as Partial<AutoInput>))).toMatch(re);
  });
});

describe("channel: theirs, else a text, email only without a mobile", () => {
  it("follows the customer", () => {
    expect(channelFor("email", true, true)).toBe("email");
    expect(channelFor("sms", true, true)).toBe("sms");
    expect(channelFor(null, true, true)).toBe("sms");
    expect(channelFor(null, false, true)).toBe("email");
    expect(channelFor("email", true, false)).toBe("sms");
    expect(channelFor(null, false, false)).toBeNull();
  });
});

describe("the Stage 2 report", () => {
  it("measures edits and is ready at 30 taps with 80% as written; it never counts its own sends", () => {
    expect(editShare("Hi Sam, any questions on the quote?", "Hi Sam, any questions on the quote?")).toBe(0);
    expect(editShare("Hi Sam, any questions on the quote?", "Hey, did you get a chance to look yet")).toBeGreaterThan(0.5);
    const taps = Array.from({ length: 30 }, (_, i) => log(at("2026-11-01"), { edited: i < 25 ? 0.05 : 0.6 }));
    expect(readiness(taps)).toMatchObject({ taps: 30, light: 25, ready: true });
    expect(readiness(taps.slice(0, 29)).ready).toBe(false);
    expect(readiness([...taps.map((t) => ({ ...t, edited: 0.6 })), ...Array.from({ length: 40 }, () => log(at("2026-11-02"), { how: "auto" }))]).ready).toBe(false);
  });
});

describe("what the app sent is kept, and counts as a follow-up", () => {
  it("round-trips sent[] and the per-quote switch", () => {
    const s = withAutoOff(withSent(emptyState(), log(at("2026-11-05"), { how: "auto", by: "app" })), true);
    const back = parseState(serializeState(s));
    expect(back.sent).toHaveLength(1);
    expect(back.touches).toHaveLength(1);
    expect(back.autoOff).toBe(true);
    expect(parseState(serializeState(withAutoOff(back, false))).autoOff).toBeUndefined();
  });
});

describe("opened, no reply (measured): the day after", () => {
  const due = (o: { firstOpened?: string | null; today: string; lastCustomer?: string | null; preliminary?: boolean; touches?: string[] }) =>
    dueOf({ sentAt: at("2026-11-01"), validUntil: null, state: emptyState(), thread: { staffTouches: o.touches ?? [], lastCustomer: o.lastCustomer ?? null }, now: new Date(at(o.today)), torontoDay: day, preliminary: o.preliminary ?? false, firstOpened: o.firstOpened ?? null });
  it("is due the day after the first open, ahead of day 3", () => {
    expect(due({ firstOpened: at("2026-11-01", 20), today: "2026-11-02" })).toMatchObject({ bucket: "due", day: "2026-11-02", reason: { kind: "opened" } });
  });
  it("not when they wrote, we followed up since, or it's a preliminary", () => {
    expect(due({ firstOpened: at("2026-11-01", 20), today: "2026-11-02", lastCustomer: at("2026-11-02", 13) })?.reason.kind).toBe("replied");
    expect(due({ firstOpened: at("2026-11-01", 20), today: "2026-11-03", touches: [at("2026-11-02")] })?.reason.kind).not.toBe("opened");
    expect(due({ firstOpened: at("2026-11-01", 20), today: "2026-11-02", preliminary: true })?.reason.kind).not.toBe("opened");
  });
});

describe("re-reading: 3+ opens on 2+ days, no reply", () => {
  const input = (openDays: string[], opens: number, messages: { direction: "in" | "out"; channel: string; automated: boolean; at: string; callSeconds: null }[] = []) =>
    scoreOf({ messages, sentAt: at("2026-11-01"), preliminary: true, visit: { kind: "none" }, visited: [], value: 5_000, opens, lastOpened: at("2026-11-03"), openDays, signals: null, namedDay: null, now: new Date(at("2026-11-04")), torontoDay: day });
  it("flags it, pulls a preliminary off auto, and alerts", () => {
    const s = input(["2026-11-02", "2026-11-03"], 3);
    expect(s.flags).toContain("rereading");
    expect(s.tier).toBe("needs");
    expect(s.hot).toBe(true);
    expect(staysAuto({ preliminary: true, tier: s.tier, reason: "scheduled", signals: null })).toBe(false);
  });
  it("not 3 opens on one day, and not once they wrote", () => {
    expect(input(["2026-11-02"], 3).flags).not.toContain("rereading");
    expect(input(["2026-11-02", "2026-11-03"], 3, [{ direction: "in", channel: "sms", automated: false, at: at("2026-11-03", 18), callSeconds: null }]).flags).not.toContain("rereading");
  });
});
