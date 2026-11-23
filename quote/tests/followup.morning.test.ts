import { describe, expect, it } from "vitest";
import { byMorning, doneToday, dueShort, laterOf, pinOf, placeOf, primaryOf, shortMoney, stepLine, summaryLine, type MorningRow } from "../src/lib/followup/morning";
import type { Brief } from "../src/lib/followup/brief";
import type { Choice } from "../src/lib/followup/choices";

// Invented dates and numbers only: this repo is public.
const TODAY = "2026-11-20";
const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }));
const row = (o: Omit<Partial<MorningRow>, "score"> & { tier?: "needs" | "watch" | "auto"; score?: number } = {}): MorningRow => ({
  due: { bucket: "due", day: TODAY, reason: { kind: "scheduled", touch: 1 }, lastTouch: null, ...(o.due ?? {}) },
  score: { score: o.score ?? 30, tier: o.tier ?? "needs" },
  state: { touches: [], snooze: null, postpone: null, lost: null, ...(o.state ?? {}) },
  waiting: o.waiting ?? false,
  basis: o.basis ?? "Measured",
  channel: o.channel === undefined ? "sms" : o.channel,
  ghlUrl: o.ghlUrl === undefined ? "https://example.com/ghl" : o.ghlUrl,
});
const brief = (kind: Brief["step"]["kind"], o: Partial<Brief> = {}): Brief => ({ standing: "Opened it twice. Warm.", asked: [], step: { kind, why: "x" }, draft: kind === "wait" || kind === "close" ? "" : "Hi there", nextDay: null, nextQuote: null, basedOn: "s", at: `${TODAY}T13:00:00Z`, model: "m", ...o });
const choice = (o: Partial<Choice> = {}): Choice => ({ at: `${TODAY}T14:14:00.000Z`, by: "sam@example.com", suggested: "text", score: 30, group: "reach", did: "send", ...o });

describe("where a row sits on the morning brief (2026-11-22)", () => {
  it("Needs you due is Reach today, Watch due is If you have time, the rest is Later", () => {
    expect(placeOf(row(), null, TODAY, day)).toBe("reach");
    expect(placeOf(row({ tier: "watch" }), null, TODAY, day)).toBe("time");
    expect(placeOf(row({ due: { bucket: "upcoming", day: "2026-11-22", reason: { kind: "scheduled", touch: 2 }, lastTouch: null } }), null, TODAY, day)).toBe("later");
    expect(placeOf(row({ waiting: true }), null, TODAY, day)).toBe("later");
  });

  it("a row done today stays in the group it was acted from", () => {
    const r = row({ tier: "watch", due: { bucket: "snoozed", day: "2026-11-27", reason: { kind: "scheduled", touch: 1 }, lastTouch: null }, state: { touches: [], snooze: { until: "2026-11-27", at: `${TODAY}T14:00:00Z`, by: "x" }, postpone: null, lost: null, choices: [choice({ did: "snooze", group: "reach" })] } });
    const done = doneToday(r, TODAY, day);
    expect(done?.words).toBe("Snoozed to 2026-11-27");
    expect(placeOf(r, done, TODAY, day)).toBe("reach");
  });

  it("counts any touch today: the app's buttons, and a text or call in GHL", () => {
    expect(doneToday(row({ state: { touches: [], snooze: null, postpone: null, lost: null, choices: [choice()], sent: [{ at: `${TODAY}T14:14:00Z`, kind: "nudge", how: "tap", channel: "sms", by: "x", edited: 0 }] } }), TODAY, day)?.words).toMatch(/^Texted 9:14/);
    expect(doneToday(row({ due: { bucket: "upcoming", day: "2026-11-27", reason: { kind: "scheduled", touch: 2 }, lastTouch: TODAY } }), TODAY, day)?.words).toBe("Followed up in GHL");
    expect(doneToday(row({ state: { touches: [{ at: "2026-11-19T14:00:00Z", by: "x" }], snooze: null, postpone: null, lost: null } }), TODAY, day)).toBeNull();
  });

  it("pins what we owe on top, then sorts by score, and sinks what's done", () => {
    const a = { row: row({ score: 60 }), done: null };
    const b = { row: row({ score: 10, due: { bucket: "due", day: TODAY, reason: { kind: "replied" }, lastTouch: null } }), done: null };
    const c = { row: row({ score: 90 }), done: { at: `${TODAY}T14:00:00Z`, words: "Texted" } };
    const d = { row: row({ score: 80 }), done: null };
    expect([a, b, c, d].sort(byMorning).map((x) => x.row.score.score)).toEqual([10, 80, 60, 90]);
    expect(pinOf(b.row)).toBe("Replied");
    expect(pinOf(row({ due: { bucket: "due", day: TODAY, reason: { kind: "measure", day: TODAY }, lastTouch: null } }))).toBe("Owed");
  });

  it("files Later by kind", () => {
    expect(laterOf(row({ waiting: true }))).toBe("next");
    expect(laterOf(row({ due: { bucket: "auto", day: TODAY, reason: { kind: "scheduled", touch: 1 }, lastTouch: null } }))).toBe("auto");
  });
});

describe("the one button and the one line", () => {
  it("does the brief's step, and never sends from the collapsed row", () => {
    expect(primaryOf(row(), brief("text"))).toEqual({ label: "Review text", act: "expand" });
    expect(primaryOf(row({ channel: "email" }), brief("email"))).toEqual({ label: "Review email", act: "expand" });
    expect(primaryOf(row({ basis: "Preliminary" }), brief("text"))).toEqual({ label: "Copy and open GHL", act: "copyGhl" });
    expect(primaryOf(row(), brief("call"))).toEqual({ label: "Open in GHL", act: "ghl" });
    expect(primaryOf(row({ ghlUrl: null }), brief("call")).act).toBe("expand");
    expect(primaryOf(row({ basis: "Preliminary" }), brief("visit"))).toEqual({ label: "Copy booking link", act: "link" });
    expect(primaryOf(row(), brief("close"))).toEqual({ label: "Close it out", act: "lost" });
    expect(primaryOf(row(), brief("wait"))).toEqual({ label: "Snooze 7 days", act: "snooze" });
    expect(primaryOf(row(), null)).toEqual({ label: "Open", act: "expand" });
  });

  it("leads with an unanswered question, else the first sentence of where it stands", () => {
    expect(stepLine(brief("text", { asked: [{ text: "Does the nosing match?", answered: false }] }), "x")).toEqual({ lead: "Send a text", text: 'asked "Does the nosing match", not answered yet' });
    expect(stepLine(brief("call"), "x")).toEqual({ lead: "Call them", text: "Opened it twice." });
    expect(stepLine(null, "First follow-up")).toEqual({ lead: null, text: "First follow-up" });
  });

  it("says when in a word, and money short", () => {
    expect(dueShort(TODAY, TODAY)).toBe("today");
    expect(dueShort("2026-11-19", TODAY)).toBe("1 day late");
    expect(dueShort("2026-11-17", TODAY)).toBe("3 days late");
    expect(dueShort("2026-11-21", TODAY)).toBe("tomorrow");
    expect(shortMoney(14_230)).toBe("$14.2k");
    expect(shortMoney(850)).toBe("$850");
    expect(shortMoney(null)).toBeNull();
  });
});

describe("the sentence at the top", () => {
  it("counts the day by step, follows the filter, and says what's done", () => {
    const s = summaryLine("Sam", [
      { kind: "text", done: false },
      { kind: "text", done: true },
      { kind: "call", done: false },
      { kind: "visit", done: false },
      { kind: "quote", done: false },
    ]);
    expect(s).toEqual({ text: "Sam, 5 people today: 2 texts, 1 call, 1 visit to book, 1 quote to write.", done: "1 done." });
    expect(summaryLine("Everyone", [{ kind: "email", done: false }]).text).toBe("The team, 1 person today: 1 email.");
    expect(summaryLine("Sam", [])).toEqual({ text: "Sam, nobody needs you today.", done: null });
  });
});
