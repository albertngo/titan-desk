import { describe, expect, it } from "vitest";
import { dateShort } from "@/lib/format";

describe("dateShort", () => {
  it("keeps the calendar day of a bare Airtable date", () => {
    // UTC midnight is the previous evening in Toronto; the day must not slip back.
    expect(dateShort("2026-09-19")).toContain("19");
    expect(dateShort("2026-01-01")).toContain("2026");
  });

  it("shows a dash for no date", () => {
    expect(dateShort(null)).toBe("—");
  });
});
