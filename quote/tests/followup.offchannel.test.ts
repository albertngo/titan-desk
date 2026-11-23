import { describe, expect, it } from "vitest";
import type { Message } from "@/lib/conversation/thread";
import { calledOffByText } from "@/lib/followup/visits";
import { isUnitRateFind, cleanOffChannel, offChannelNote, offChannelPlan, priceCandidates, sentOutside, parseOffChannel, hasMoney } from "@/lib/followup/offchannel";

const msg = (id: string, over: Partial<Message>): Message => ({ id, channel: "sms", label: "Text", direction: "out", body: null, subject: null, attachments: [], at: "2026-11-10T15:00:00Z", status: null, automated: false, callSeconds: null, emailId: null, ...over });
const day = (iso: string) => iso.slice(0, 10);

describe("prices given outside the app", () => {
  const thread = [
    msg("a", { direction: "in", body: "The other company said $3000" }),
    msg("b", { body: "It would be $4,850 installed for the main floor" }),
    msg("c", { body: "Automated reminder, $50 off", automated: true }),
    msg("d", { channel: "note", direction: "out", body: "Call summary: quoted 2.5k plus HST for stairs" }),
    msg("e", { channel: "note", direction: "out", body: "Quote opened on iPhone, $4,850" }),
    msg("f", { body: "See you Tuesday" }),
  ];

  it("only our human messages and call notes with a dollar figure are candidates", () => {
    expect(priceCandidates(thread, null).map((m) => m.id)).toEqual(["b", "d"]);
    expect(hasMoney("around 4k")).toBe(true);
    expect(hasMoney("call me at 4")).toBe(false);
  });

  it("skips the app's own quote texts and anything sent with a quote's send", () => {
    const own = [
      msg("p", { body: "Thanks for telling us about your project. Your estimate is $3,300 to $3,800 + HST." }),
      msg("l", { body: "Here it is: https://example.test/c/abcdefgh12 total $5,000" }),
      msg("n", { body: "It comes to $2,000", at: "2026-11-10T15:05:00Z" }),
      msg("k", { body: "It comes to $2,000", at: "2026-11-11T15:05:00Z" }),
    ];
    expect(priceCandidates(own, null, ["2026-11-10T15:00:00Z"]).map((m) => m.id)).toEqual(["k"]);
  });

  it("refuses an answer that points at a message without a figure", () => {
    expect(cleanOffChannel({ found: true, messageId: "f", kind: "firm", amount: 100 }, thread, ["b", "d"])).toBeNull();
    expect(cleanOffChannel({ found: false }, thread, ["b"])).toBeNull();
  });

  it("reads a call note as given on a call", () => {
    const f = cleanOffChannel({ found: true, messageId: "d", kind: "firm", amount: 2500, hst: "plus", what: "stairs", quote: "2.5k plus HST" }, thread, ["b", "d"]);
    expect(f?.how).toBe("call");
    expect(offChannelNote(f!, day)).toContain("Given verbally: $2500 plus HST");
  });

  it("matches an option, adds one, or only notes a ballpark", () => {
    const opts = [{ id: "o1", total: 4850, preHst: 4292 }];
    expect(offChannelPlan({ kind: "firm", amount: 4850 }, opts)).toEqual({ did: "matched", optionId: "o1" });
    expect(offChannelPlan({ kind: "firm", amount: 5000 }, opts)).toEqual({ did: "added", optionId: null });
    expect(offChannelPlan({ kind: "ballpark", amount: 4000 }, opts).did).toBe("noted");
  });

  it("is sent outside only when firm and after the app's last send", () => {
    const off = parseOffChannel({ at: "2026-11-10T15:00:00Z", how: "sms", kind: "firm", amount: 1, hst: "unknown", messageId: "b", did: "added" });
    expect(sentOutside(off, null)).toBe(true);
    expect(sentOutside(off, "2026-11-11T00:00:00Z")).toBe(false);
    expect(sentOutside({ ...off!, kind: "ballpark" }, null)).toBe(false);
  });

  it("reads a visit called off by text, from the customer only, around the visit", () => {
    const start = "2026-11-09T18:00:00Z";
    const ms = [msg("x", { direction: "in", body: "So sorry, we'll have to reschedule today", at: "2026-11-09T17:25:00Z" })];
    expect(calledOffByText(ms, start)).toContain("reschedule");
    expect(calledOffByText([{ ...ms[0], direction: "out" }], start)).toBeNull();
    expect(calledOffByText([{ ...ms[0], at: "2026-11-01T10:00:00Z" }], start)).toBeNull();
  });

  it("never takes a rate per unit as a price for the job", () => {
    const t = [msg("r", { channel: "note", body: "Call summary: casing quoted at $4 per linear foot ($160 per door)" })];
    expect(cleanOffChannel({ found: true, messageId: "r", kind: "firm", amount: 160, what: "door casing", quote: "$160 per door" }, t, ["r"])).toBeNull();
    expect(isUnitRateFind({ quote: "$160 per door", what: "casing" })).toBe(true);
    expect(isUnitRateFind({ quote: "quoted $2780 cash for the installation", what: "install" })).toBe(false);
  });
});
