import { describe, expect, it } from "vitest";
import { cleanContext, isOverride, liveNote, newestNote, overrideLines, overrideStats, parseChoices, parseNote, parseStepOverride, withChoice, withReason, type Choice } from "../src/lib/followup/choices";
import { briefPrompt, briefSignature, cleanBrief, type BriefFacts } from "../src/lib/followup/brief";
import { parseState, serializeState, withNote, withStepOverride, withTouch } from "../src/lib/followup/plan";

// Invented people, dates and numbers only: this repo is public.
const ch = (o: Partial<Choice> = {}): Choice => ({ at: "2026-11-20T14:00:00.000Z", by: "sam@example.com", suggested: "text", score: 40, group: "reach", did: "send", ...o });

describe("the choice log (2026-11-22)", () => {
  it("reads back what it wrote, and drops what isn't a choice", () => {
    const list = parseChoices([ch(), ch({ did: "step", step: "call", reason: "Prefer to call" }), { at: "nope", did: "send" }, { at: "2026-11-20T14:00:00Z", did: "explode" }, null]);
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ did: "step", step: "call", reason: "Prefer to call" });
    expect(parseChoices([{ ...ch(), reason: "Because" }])[0].reason).toBeUndefined();
  });

  it("survives the round trip through Quotes → Follow Up, beside the rest of the state", () => {
    const s = withChoice(withTouch(parseState(null), { at: "2026-11-20T14:00:00.000Z", by: "sam@example.com" }), ch());
    const back = parseState(serializeState(withNote(withStepOverride(s, { kind: "call", at: "2026-11-20T14:00:00.000Z", by: "sam@example.com", basedOn: "sig" }), { text: "Wife decides, evenings", at: "2026-11-20T14:00:00.000Z", by: "sam@example.com" })));
    expect(back.choices).toHaveLength(1);
    expect(back.touches).toHaveLength(1);
    expect(back.stepOverride?.kind).toBe("call");
    expect(back.note?.text).toBe("Wife decides, evenings");
    expect(withStepOverride(back, null).stepOverride).toBeUndefined();
  });

  it("knows following the suggestion from going against it", () => {
    expect(isOverride(ch({ suggested: "text", did: "send" }))).toBe(false);
    expect(isOverride(ch({ suggested: "text", did: "ghl" }))).toBe(false);
    expect(isOverride(ch({ suggested: "text", did: "snooze" }))).toBe(true);
    expect(isOverride(ch({ suggested: "call", did: "send" }))).toBe(true);
    expect(isOverride(ch({ suggested: "wait", did: "snooze" }))).toBe(false);
    expect(isOverride(ch({ suggested: "close", did: "lost" }))).toBe(false);
    expect(isOverride(ch({ suggested: "visit", did: "link" }))).toBe(false);
    expect(isOverride(ch({ suggested: "text", did: "step", step: "call" }))).toBe(true);
    expect(isOverride(ch({ suggested: "text", did: "step", step: "text" }))).toBe(false);
    expect(isOverride(ch({ suggested: null, did: "snooze" }))).toBe(false);
  });

  it("puts a tapped reason on the person's own recent override only", () => {
    const now = new Date("2026-11-20T14:05:00.000Z");
    const s = { choices: [ch({ did: "snooze" })] };
    expect(withReason(s, "SAM@example.com", "Not ready", now)?.choices?.[0].reason).toBe("Not ready");
    expect(withReason(s, "kim@example.com", "Not ready", now)).toBeNull();
    expect(withReason(s, "sam@example.com", "Not ready", new Date("2026-11-20T15:00:00.000Z"))).toBeNull();
    expect(withReason({ choices: [ch({ did: "send" })] }, "sam@example.com", "Not ready", now)).toBeNull();
  });

  it("tells the next brief the last three overrides, in words", () => {
    const list = [
      ch({ at: "2026-11-10T14:00:00Z", did: "snooze" }),
      ch({ at: "2026-11-12T14:00:00Z", did: "send" }),
      ch({ at: "2026-11-14T14:00:00Z", did: "step", step: "call", reason: "Prefer to call" }),
      ch({ at: "2026-11-16T14:00:00Z", suggested: "call", did: "snooze", reason: "Not ready" }),
      ch({ at: "2026-11-18T14:00:00Z", suggested: "wait", did: "lost" }),
    ];
    const lines = overrideLines(list);
    expect(lines).toEqual(["2026-11-14: suggested a text; staff picked a call (Prefer to call)", "2026-11-16: suggested a call; staff snoozed it (Not ready)", "2026-11-18: suggested waiting; staff marked it lost"]);
  });

  it("keeps the newest note across a customer's quotes, and a cleared one stays cleared", () => {
    const old = parseNote({ text: "Call evenings", at: "2026-11-01T12:00:00Z", by: "sam@example.com" });
    const cleared = parseNote({ text: "", cleared: true, at: "2026-11-05T12:00:00Z", by: "sam@example.com" });
    expect(liveNote(newestNote([old, null]))?.text).toBe("Call evenings");
    expect(liveNote(newestNote([old, cleared]))).toBeNull();
    expect(parseNote({ text: "  ", at: "2026-11-01T12:00:00Z" })).toBeNull();
  });

  it("takes only a score and a group from the page", () => {
    expect(cleanContext({ score: 140.4, group: "reach", extra: "x" })).toEqual({ score: 100, group: "reach" });
    expect(cleanContext("nonsense")).toEqual({ score: null, group: null });
    expect(parseStepOverride({ kind: "dance", at: "2026-11-01T12:00:00Z", basedOn: "x" })).toBeNull();
  });

  it("reports where staff went against the suggestions, and how those quotes turned out", () => {
    const stats = overrideStats(
      [
        { choices: [ch({ did: "snooze", reason: "Not ready", score: 25 }), ch({ did: "send", edited: 0 })], outcome: "won" },
        { choices: [ch({ suggested: "call", did: "touch", by: "kim@example.com", score: 5 })], outcome: "lost" },
        { choices: [ch({ at: "2026-01-01T00:00:00Z", did: "snooze" })], outcome: "open" },
      ],
      "2026-11-01T00:00:00Z",
      (e) => e.split("@")[0],
    );
    expect(stats.bySuggested.map((r) => [r.label, r.acted, r.overrides])).toEqual([
      ["call", 1, 0],
      ["text", 2, 1],
    ]);
    expect(stats.bySuggested[1].reasons).toEqual({ "Not ready": 1 });
    expect(stats.byPerson.map((r) => r.label)).toEqual(["kim", "sam"]);
    expect(stats.byBand.map((r) => r.label)).toEqual(["Under 8", "20 to 32", "33 or more"]);
    expect(stats.outcomes).toEqual({ overridden: { won: 1, lost: 0, open: 0 }, followed: { won: 0, lost: 1, open: 0 } });
    expect(stats.edited).toEqual({ sends: 1, asWritten: 1 });
  });
});

describe("the brief follows the note and the picked step (2026-11-22)", () => {
  const facts: BriefFacts = { today: "2026-11-20", customer: "Pat Example", quoteNumber: "Q-0001", basis: "Measured", sentDay: "2026-11-15", age: 5, validUntil: null, opens: 1, lastOpened: null, options: [], sender: "Sam", typicalCloseDay: 12, scheduleDays: [3, 10, 21], postponedTo: null, loggedHere: [], visit: "Visited" };

  it("puts the note, the overrides and the picked step in the prompt only when there are some", () => {
    expect(briefPrompt(facts, [])).not.toContain("STAFF NOTE");
    const p = briefPrompt({ ...facts, staffNote: "Wife decides, evenings", staffStep: "call", overrides: ["2026-11-14: suggested a text; staff snoozed it"] }, []);
    expect(p).toContain("STAFF NOTE on this customer (follow it in the step and the draft): Wife decides, evenings");
    expect(p).toContain('STAFF CHOSE THE NEXT STEP: "call"');
    expect(p).toContain("suggested a text; staff snoozed it");
  });

  it("holds the picked step whatever comes back", () => {
    const b = cleanBrief({ standing: "Warm.", step: { kind: "text", why: "x" }, draft: "Hi" }, { basedOn: "s", at: "2026-11-20T14:00:00Z", model: "m", today: "2026-11-20", forceStep: "wait" });
    expect(b?.step.kind).toBe("wait");
    expect(b?.draft).toBe("");
  });

  it("leaves the signature as it was when there's no note, so no brief goes stale on the change", () => {
    const base = { lastMessage: null, opens: 0, touches: 0, postponeUntil: null, sentAt: "2026-11-15" };
    expect(briefSignature(base)).toBe(briefSignature({ ...base, noteAt: null }));
    expect(briefSignature({ ...base, noteAt: "2026-11-20T14:00:00Z" })).not.toBe(briefSignature(base));
  });
});
