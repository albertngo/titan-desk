import { describe, expect, it } from "vitest";
import { apptDay, apptsByContact, apptWords, inApptFilter, type ApptEvent } from "@/lib/quotes/appts";

const CAL = { inHome: "calHome", inStore: "calStore" };
const day = (s: string) => s.slice(0, 10);
const now = new Date("2026-11-20T15:00:00Z");
const ev = (contactId: string, calendarId: string, start: string, status: string | null = "confirmed"): ApptEvent => ({ contactId, calendarId, start, status });

describe("appointments on All quotes (2026-11-26)", () => {
  it("keeps one in-home and one in-store visit per contact, the latest that went ahead", () => {
    const m = apptsByContact([ev("a", "calHome", "2026-10-01T14:00:00Z"), ev("a", "calHome", "2026-11-02T14:00:00Z"), ev("a", "calStore", "2026-09-10T14:00:00Z")], now, day, CAL);
    expect(m.get("a")).toEqual({ inHome: { day: "2026-11-02", ahead: false }, inStore: { day: "2026-09-10", ahead: false } });
  });

  it("prefers a booked visit still ahead, the soonest one", () => {
    const m = apptsByContact([ev("a", "calHome", "2026-11-02T14:00:00Z"), ev("a", "calHome", "2026-12-10T14:00:00Z"), ev("a", "calHome", "2026-11-28T14:00:00Z")], now, day, CAL);
    expect(m.get("a")?.inHome).toEqual({ day: "2026-11-28", ahead: true });
  });

  it("leaves out cancelled and no-show visits, and other calendars", () => {
    const m = apptsByContact([ev("a", "calHome", "2026-11-02T14:00:00Z", "cancelled"), ev("a", "calStore", "2026-11-03T14:00:00Z", "noshow"), ev("b", "other", "2026-11-03T14:00:00Z")], now, day, CAL);
    expect(m.size).toBe(0);
  });

  it("filters by had one, which one, or both", () => {
    const home = { inHome: { day: "2026-11-02", ahead: false }, inStore: null };
    const both = { inHome: home.inHome, inStore: { day: "2026-11-05", ahead: false } };
    expect([inApptFilter(null, "with"), inApptFilter(home, "with"), inApptFilter(home, "in-home"), inApptFilter(home, "in-store"), inApptFilter(home, "both"), inApptFilter(both, "both"), inApptFilter(null, "any")]).toEqual([false, true, true, false, false, true, true]);
  });

  it("says where and when, with the year only when it isn't this year's", () => {
    expect(apptWords({ inHome: { day: "2026-11-02", ahead: false }, inStore: { day: "2026-12-03", ahead: true } }, "2026-11-20").map((a) => a.text)).toEqual(["In-home · Nov 2", "In-store · Dec 3, booked"]);
    expect(apptDay("2025-12-30", "2026-11-20")).toMatch(/2025/);
  });
});
