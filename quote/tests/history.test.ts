import { describe, expect, it } from "vitest";
import { VERSION } from "../src/lib/airtable/fields";
import { appendLog, authorFields, describePlan, firstNameOf, logEntries, logLine, stamp } from "../src/lib/quotes/history";
import type { SavePlan } from "../src/lib/quotes/savePlan";

// Invented people and times only.
const T0 = new Date("2026-10-22T18:05:00Z"); // 14:05 in Toronto (EDT)
const plan = (p: Partial<SavePlan> = {}): SavePlan => ({ version: {}, createOptions: [], updateOptions: [], detachOptions: [], createLines: [], updateLines: [], detachLines: [], ...p });

describe("who worked on a version (2026-10-22)", () => {
  it("stamps Toronto time, not the server's", () => {
    expect(stamp(T0)).toBe("2026-10-22 14:05");
    expect(stamp(new Date("2026-01-15T04:30:00Z"))).toBe("2026-01-14 23:30"); // EST, previous day
    expect(stamp(new Date("2026-10-23T04:00:00Z"))).toBe("2026-10-23 00:00"); // midnight is 00, never 24
  });

  it("writes one line per event and appends, oldest first, keeping the newest when it gets long", () => {
    const l1 = logLine(T0, "pat@example.com", "saved: 2 lines changed");
    expect(l1).toBe("2026-10-22 14:05 · pat@example.com · saved: 2 lines changed");
    const log = appendLog(appendLog(null, l1), logLine(new Date(T0.getTime() + 60_000), "sam@example.com", "sent by email"));
    expect(log.split("\n")).toHaveLength(2);
    expect(log.endsWith("sam@example.com · sent by email")).toBe(true);
    let long: string | null = null;
    for (let i = 0; i < 400; i++) long = appendLog(long, logLine(T0, "pat@example.com", `save ${i}`));
    const lines = long!.split("\n");
    expect(lines).toHaveLength(300);
    expect(lines[0]).toContain("save 100");
    expect(lines.at(-1)).toContain("save 399");
  });

  it("reads the log back newest first, and keeps a line it cannot parse", () => {
    const e = logEntries("2026-10-22 14:05 · pat@example.com · saved\n2026-10-22 14:06 · sam@example.com · sent by email · from sam@example.com\nsomething odd");
    expect(e[0]).toEqual({ when: "", who: "", what: "something odd" });
    expect(e[1]).toEqual({ when: "2026-10-22 14:06", who: "sam@example.com", what: "sent by email · from sam@example.com" });
    expect(e[2].what).toBe("saved");
    expect(logEntries(null)).toEqual([]);
  });

  it("describes a save plan in words", () => {
    expect(describePlan(plan())).toBe("nothing changed");
    expect(describePlan(plan({ updateLines: [{ id: "a", option: "o", fields: {} }], createLines: [{ option: "o", fields: {} }, { option: "o", fields: {} }], version: { x: 1 } }))).toBe("1 line changed, 2 lines added, terms changed");
    expect(describePlan(plan({ detachOptions: ["o"], detachLines: ["l"] }))).toBe("1 line removed, 1 option removed");
  });

  it("writes who, when and the log together; created-by only on creation", () => {
    const f = authorFields({ email: "pat@example.com", name: "Pat Example" }, T0, "saved: terms changed", "2026-10-21 09:00 · sam@example.com · created v1");
    expect(f[VERSION.lastEditedBy]).toBe("pat@example.com");
    expect(f[VERSION.lastEditedAt]).toBe("2026-10-22T18:05:00.000Z");
    expect(f[VERSION.editLog]).toBe("2026-10-21 09:00 · sam@example.com · created v1\n2026-10-22 14:05 · pat@example.com · saved: terms changed");
    expect(VERSION.createdBy in f).toBe(false);
    expect(authorFields({ email: "pat@example.com", name: null }, T0, "created v1", null, true)[VERSION.createdBy]).toBe("pat@example.com");
  });

  it("finds a first name from the sign-in, else from a personal address, never from a shared box", () => {
    expect(firstNameOf({ email: "pat@example.com", name: "Pat Example" })).toBe("Pat");
    expect(firstNameOf({ email: "pat@example.com", name: null })).toBe("Pat");
    expect(firstNameOf({ email: "mary.ann@example.com", name: "" })).toBe("Mary");
    expect(firstNameOf({ email: "info@example.com", name: null })).toBeNull();
    expect(firstNameOf({ email: "frontdesk@example.com", name: null })).toBeNull();
    expect(firstNameOf({ email: "a1@example.com", name: null })).toBeNull();
    expect(firstNameOf({ email: "info@example.com", name: "Zoë Q" })).toBe("Zoë");
  });
});
