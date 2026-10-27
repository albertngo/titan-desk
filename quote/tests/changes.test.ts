import { describe, expect, it } from "vitest";
import { byDay, CHANGES, dayLabel, KIND_LABEL } from "../src/lib/changes";

describe("What's new", () => {
  it("every entry has a real date, a known kind, a title and details", () => {
    for (const c of CHANGES) {
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(c.date))).toBe(false);
      expect(Object.keys(KIND_LABEL)).toContain(c.kind);
      expect(c.title.trim()).not.toBe("");
      expect(c.details.length).toBeGreaterThan(0);
      for (const d of c.details) expect(d.trim()).not.toBe("");
    }
  });

  it("is newest first, so a new entry goes at the top", () => {
    for (let i = 1; i < CHANGES.length; i++) expect(CHANGES[i - 1].date >= CHANGES[i].date).toBe(true);
  });

  it("groups by day without reordering", () => {
    const days = byDay([
      { date: "2026-10-02", kind: "new", title: "b", details: ["x"] },
      { date: "2026-10-02", kind: "fixed", title: "a", details: ["x"] },
      { date: "2026-10-01", kind: "new", title: "c", details: ["x"] },
    ]);
    expect(days.map((d) => [d.date, d.changes.map((c) => c.title)])).toEqual([
      ["2026-10-02", ["b", "a"]],
      ["2026-10-01", ["c"]],
    ]);
  });

  it("labels the day it says, whatever the server's zone", () => {
    expect(dayLabel("2026-10-27")).toContain("27");
    expect(dayLabel("2026-10-27")).toContain("2026");
  });
});
