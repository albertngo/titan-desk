import { describe, expect, it } from "vitest";
import {
  activityEntries,
  applyActivity,
  deviceOf,
  devicesSeen,
  firstOpenComment,
  followUpTagBodies,
  isBot,
  mentionsFor,
  parseActivity,
  summaryComment,
  summaryDue,
  type ActivityInfo,
  type TrackState,
} from "../src/lib/activity/track";

/** Open tracking (Albert, 2026-10-27). Invented people and numbers only. */

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const PIXEL = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const TOKEN = "A".repeat(32);

const blank: TrackState = { openedCount: 0, firstOpenedAt: null, lastOpenedAt: null, pdfDownloads: 0, activityLog: null };
// 2026-10-27 14:03 Toronto (EDT, UTC-4).
const T0 = new Date("2026-10-27T18:03:00Z");
const later = (min: number) => new Date(T0.getTime() + min * 60_000);

describe("what counts as an open", () => {
  it("names the device from the browser, and treats previews and scanners as bots", () => {
    expect(deviceOf(IPHONE)).toBe("iPhone");
    expect(deviceOf(PIXEL)).toBe("Android phone");
    expect(deviceOf(WINDOWS)).toBe("Windows");
    expect(deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)")).toBe("Mac");
    expect(deviceOf(null)).toBe("Other");
    for (const ua of [IPHONE, PIXEL, WINDOWS]) expect(isBot(ua)).toBe(false);
    for (const ua of ["facebookexternalhit/1.1", "WhatsApp/2.24", "Mozilla/5.0 (compatible; Googlebot/2.1)", "Mozilla/5.0 HeadlessChrome/120", "", null]) expect(isBot(ua)).toBe(true);
  });

  it("accepts only a well-formed report", () => {
    expect(parseActivity({ token: TOKEN, kind: "open", device: "iPhone" })).toEqual({ token: TOKEN, kind: "open", device: "iPhone" });
    expect(parseActivity({ token: TOKEN, kind: "pdf", device: "a fridge" })).toEqual({ token: TOKEN, kind: "pdf", device: "Other" });
    expect(parseActivity({ token: "short", kind: "open" })).toBeNull();
    expect(parseActivity({ token: `${TOKEN.slice(1)}'`, kind: "open" })).toBeNull();
    expect(parseActivity({ token: TOKEN, kind: "delete" })).toBeNull();
    expect(parseActivity(null)).toBeNull();
  });

  it("counts the first open, treats a reload within 30 minutes as the same open, and counts the next visit", () => {
    const one = applyActivity(blank, "open", "iPhone", T0);
    expect(one.counted).toBe(true);
    expect(one.firstOpen).toBe(true);
    expect(one.next).toMatchObject({ openedCount: 1, firstOpenedAt: T0.toISOString(), lastOpenedAt: T0.toISOString(), activityLog: "2026-10-27 14:03 · opened · iPhone" });

    const reload = applyActivity(one.next, "open", "iPhone", later(10));
    expect(reload.counted).toBe(false);
    expect(reload.firstOpen).toBe(false);
    expect(reload.next.openedCount).toBe(1);
    expect(reload.next.lastOpenedAt).toBe(later(10).toISOString());
    expect(reload.next.activityLog).toBe(one.next.activityLog);

    const again = applyActivity(reload.next, "open", "Windows", later(10 + 31));
    expect(again.counted).toBe(true);
    expect(again.firstOpen).toBe(false);
    expect(again.next.openedCount).toBe(2);
    expect(again.next.firstOpenedAt).toBe(T0.toISOString());
    expect(devicesSeen(again.next.activityLog)).toEqual(["iPhone", "Windows"]);
  });

  it("counts every PDF download and never calls it an open", () => {
    const one = applyActivity(blank, "open", "iPhone", T0);
    const pdf = applyActivity(one.next, "pdf", "iPhone", later(2));
    expect(pdf.next.pdfDownloads).toBe(1);
    expect(pdf.next.openedCount).toBe(1);
    expect(pdf.firstOpen).toBe(false);
    expect(activityEntries(pdf.next.activityLog).map((e) => e.what)).toEqual(["opened", "PDF downloaded"]);
  });
});

describe("the GHL comments", () => {
  const info: ActivityInfo = { quoteNumber: "Q-1234", version: 2, basis: "Measured", sentAt: "2026-10-24", senderName: "Pat", sentTo: "Email, Text" };

  it("notes the first open; a measured quote's tags the sender and nudges, a preliminary's tags nobody", () => {
    expect(firstOpenComment(info, T0, "iPhone", ["Pat Example"])).toBe(
      "@Pat Example Quote opened: Q-1234 v2 (measured) was opened by the customer for the first time, Tue Oct 27, 2:03 pm on an iPhone. Sent Oct 24 by Pat, by email and text. A good moment to follow up.",
    );
    expect(firstOpenComment({ ...info, version: 1, basis: "Preliminary" }, T0, "Android phone", [])).toBe(
      "Quote opened: Q-1234 v1 (preliminary) was opened by the customer for the first time, Tue Oct 27, 2:03 pm on an Android phone. Sent Oct 24 by Pat, by email and text.",
    );
  });

  it("sums up three days after sending: opens, devices, last open and downloads, or not opened yet", () => {
    let s = applyActivity(blank, "open", "iPhone", T0).next;
    s = applyActivity(s, "open", "Windows", later(120)).next;
    s = applyActivity(s, "pdf", "Windows", later(121)).next;
    expect(summaryComment(info, s, ["Pat Example"])).toBe(
      "@Pat Example Quote summary, 3 days after sending: Q-1234 v2 (measured) was opened twice on iPhone and Windows. Last opened Tue Oct 27, 4:03 pm. PDF downloaded once.",
    );
    expect(summaryComment({ ...info, basis: "Preliminary" }, blank, [])).toBe(
      "Quote summary, 3 days after sending: Q-1234 v2 (preliminary) has not been opened yet. Sent Oct 24 by Pat, by email and text.",
    );
  });

  it("is due three days after the send date, not before", () => {
    expect(summaryDue("2026-10-24", "2026-10-26")).toBe(false);
    expect(summaryDue("2026-10-24", "2026-10-27")).toBe(true);
    expect(summaryDue("2026-10-24", "2026-11-03")).toBe(true);
    expect(summaryDue(null, "2026-10-27")).toBe(false);
  });

  it("tags the assigned user, plus the sender when that is someone else; a preliminary nobody", () => {
    const users = [
      { id: "userPat0000000000001", email: "pat@example.com", name: "Pat Example" },
      { id: "userSam0000000000002", email: "sam@example.com", name: "Sam Example" },
    ];
    const pat = { id: "userPat0000000000001", name: "Pat Example" };
    const sam = { id: "userSam0000000000002", name: "Sam Example" };
    // Sam is assigned, Pat sent it: both, assigned first.
    expect(mentionsFor("Measured", "PAT@example.com", users, "userSam0000000000002", "fallback")).toEqual([sam, pat]);
    // The assigned user sent it: once.
    expect(mentionsFor("Measured", "sam@example.com", users, "userSam0000000000002", "fallback")).toEqual([sam]);
    // A shared box, or users can't be listed: the assigned user alone.
    expect(mentionsFor("Measured", "info@example.com", users, "userSam0000000000002", "fallback")).toEqual([sam]);
    expect(mentionsFor("Measured", "pat@example.com", [], "userSam0000000000002", "fallback")).toEqual([{ id: "userSam0000000000002", name: null }]);
    // Nobody assigned: Albert, plus the sender.
    expect(mentionsFor("Measured", "pat@example.com", users, null, "fallback")).toEqual([{ id: "fallback", name: null }, pat]);
    expect(mentionsFor("Measured", null, [], null, "fallback")).toEqual([{ id: "fallback", name: null }]);
    expect(mentionsFor("Preliminary", "pat@example.com", users, "userSam0000000000002", "fallback")).toEqual([]);
  });

  it("writes every tagged name in front", () => {
    expect(summaryComment(info, blank, ["Sam Example", "Pat Example"])).toMatch(/^@Sam Example @Pat Example Quote summary/);
  });
});

describe("the follow-up tags on send", () => {
  it("removes both quote-sent tags and adds this version's, in exactly the bodies Make's gate accepts", () => {
    const remove = /^\{"tags":\["quote sent: (preliminary|measured)"(,"quote sent: (preliminary|measured)")*\]\}$/;
    const add = /^\{"tags":\["quote sent: (preliminary|measured)"\]\}$/;
    const prelim = followUpTagBodies("Preliminary");
    const measured = followUpTagBodies("Measured");
    expect(prelim.removeBody).toMatch(remove);
    expect(prelim.addBody).toBe('{"tags":["quote sent: preliminary"]}');
    expect(measured.addBody).toBe('{"tags":["quote sent: measured"]}');
    for (const b of [prelim.addBody, measured.addBody]) expect(b).toMatch(add);
    expect(JSON.parse(measured.removeBody).tags).toEqual(["quote sent: preliminary", "quote sent: measured"]);
  });
});
