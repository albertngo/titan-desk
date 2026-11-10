import { describe, expect, it } from "vitest";
import { checkValue, DEFS, defaults, merge, shown } from "../src/lib/settings/registry";

// Invented numbers and addresses only: this repo is public.
describe("settings (2026-11-10)", () => {
  it("defaults come from the old Vercel variables, else the built-in numbers", () => {
    const d = defaults({ QUOTE_AUTO_FOLLOWUPS: "on", QUOTE_ALERT_TO: "+14165550100", QUOTE_ADMIN_EMAILS: "a@x.ca, b@x.ca" });
    expect(d).toMatchObject({ autoFollowUps: true, alertsOn: true, alertTo: "+14165550100", adminEmails: ["a@x.ca", "b@x.ca"], needsYouAt: 20, watchAt: 8, dailyCap: 8 });
    expect(defaults({}).autoFollowUps).toBe(false);
  });
  it("checks each kind of value", () => {
    expect(checkValue("autoFollowUps", "maybe").ok).toBe(false);
    expect(checkValue("needsYouAt", "25")).toEqual({ ok: true, value: "25" });
    expect(checkValue("needsYouAt", "500").ok).toBe(false);
    expect(checkValue("autoValueLimit", "$30,000")).toEqual({ ok: true, value: "30000" });
    expect(checkValue("alertTo", "416-555-0100")).toEqual({ ok: true, value: "+14165550100" });
    expect(checkValue("adminEmails", "nonsense").ok).toBe(false);
    expect(checkValue("noSuch", "1").ok).toBe(false);
  });
  it("stored rows override the defaults; a bad row is ignored, and thresholds stay in order", () => {
    const s = merge(defaults({}), [
      { key: "autoFollowUps", value: "on" },
      { key: "dailyCap", value: "abc" },
      { key: "needsYouAt", value: "10" },
      { key: "watchAt", value: "15" },
    ]);
    expect(s.autoFollowUps).toBe(true);
    expect(s.dailyCap).toBe(8);
    expect(s.watchAt).toBeLessThan(s.needsYouAt);
    expect(shown(s, "autoFollowUps")).toBe("on");
  });
  it("never holds a key, token or webhook address", () => {
    expect(DEFS.map((d) => d.key).join(" ")).not.toMatch(/key\b|token|hook|secret|password/i);
  });
});
