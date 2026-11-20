import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sentComment } from "../src/lib/activity/track";
import { logLine } from "../src/lib/quotes/history";
import { cleanStaffNote, copyChanges, installSqft, sendHistory, splitNote, STAFF_NOTE_MAX, withNote, type HistoryVersion } from "../src/lib/quotes/sendHistory";
import type { CopyOption, CopySection, CustomerCopy } from "../src/lib/send/copy";

/* Invented numbers and people only (quote/CLAUDE.md rule 4). Show history on All quotes, 2026-11-20. */

const item = (description: string, qty: number, amount: number | null = null) => ({ kind: "item" as const, n: 1, description, note: null, qty, uom: "sqft", wastePct: null, unitPrice: null, minimum: false, amount, optional: false });
const section = (name: string, lines: ReturnType<typeof item>[]): CopySection => ({ name, total: null, lines });
const option = (name: string, subtotal: number, sections: CopySection[] = [], extra: Partial<CopyOption> = {}): CopyOption => ({
  name,
  description: null,
  recommended: false,
  sections,
  exclusions: [],
  totals: { preDiscount: subtotal, discount: 0, subtotal, hst: round(subtotal * 0.13), total: round(subtotal * 1.13), payment1: 0, payment2: 0, paymentFinal: 0 },
  ...extra,
});
const round = (n: number) => Math.round(n * 100) / 100;
const copy = (options: CopyOption[], p: Partial<CustomerCopy> = {}): CustomerCopy =>
  ({ v: 1, quoteNumber: "Q-9001", version: 1, basis: "Measured", sentOn: "2026-11-01", validUntil: "2026-12-01", customer: { name: "Pat Example", siteAddress: null, siteCity: null }, discountRate: 0, pricing: "lump", showHst: true, company: { name: "Co", address: null, phone: null, email: null, website: null }, options, ...p }) as CustomerCopy;

const version = (p: Partial<HistoryVersion>): HistoryVersion => ({ id: "recV", version: 1, label: null, status: "Sent", changeNo: null, sentAt: null, sentBy: null, sentTo: null, copy: null, editLog: null, lastEditedBy: null, lastEditedAt: null, createdTime: "2026-11-01T12:00:00.000Z", ...p });

describe("the staff note (2026-11-20)", () => {
  it("is one trimmed line, capped, and empty is none", () => {
    expect(cleanStaffNote("  Customer asked\n to drop   the stairs ")).toBe("Customer asked to drop the stairs");
    expect(cleanStaffNote("   ")).toBeNull();
    expect(cleanStaffNote(undefined)).toBeNull();
    expect(cleanStaffNote(42)).toBeNull();
    expect(cleanStaffNote("x".repeat(500))!.length).toBe(STAFF_NOTE_MAX);
  });

  it("rides on the end of the send's Edit Log line and comes back off it", () => {
    expect(withNote("sent by email", null)).toBe("sent by email");
    const w = withNote("sent by email, PDF on the quote page", "Matched the other quote · lower");
    expect(splitNote(w)).toEqual({ what: "sent by email, PDF on the quote page", note: "Matched the other quote · lower" });
    expect(splitNote("sent by text")).toEqual({ what: "sent by text", note: null });
  });

  it("goes last on GHL's internal comment, and only when there is one", () => {
    const link = "https://quote.example.com/c/abc";
    expect(sentComment("Q-9001", 2, link, null, "Dropped the stairs")).toBe(`Q-9001 v2\nStaff Link to Quote: ${link}#staff\nStaff note: Dropped the stairs`);
    expect(sentComment("Q-9001", 2, link, null)).toBe(`Q-9001 v2\nStaff Link to Quote: ${link}#staff`);
  });

  it("never reaches anything the customer gets", () => {
    const send = readFileSync(join(__dirname, "../src/lib/quotes/send.ts"), "utf8");
    // The note is read from the request and used only in the Edit Log (withNote) and the staff comment (sentComment).
    const uses = [...send.matchAll(/input\.staffNote|staffNote: cleanStaffNote|\bnote\b(?=[),])/g)].length;
    expect(uses).toBeGreaterThan(0);
    for (const fn of ["customerCopy(", "emailMessage(", "smsMessage(", "changeEmailMessage(", "changeSmsMessage(", "resendEmailMessage(", "resendSmsMessage("]) {
      for (const call of send.split(fn).slice(1)) expect(call.slice(0, call.indexOf(")"))).not.toMatch(/staffNote|\bnote\b/);
    }
    const copyTs = readFileSync(join(__dirname, "../src/lib/send/copy.ts"), "utf8");
    expect(copyTs).not.toMatch(/staffNote/);
  });
});

describe("what changed between two sends: one line per option", () => {
  const install = (qty: number) => section("Install", [item("Click install", qty)]);

  it("puts install sqft and the price before HST on one line, arrows where they moved", () => {
    const a = copy([option("Oak", 9150, [install(800)]), option("Stairs", 2400)]);
    const b = copy([option("Oak", 8900, [install(860)]), option("Vinyl plank", 8420, [install(820)])]);
    const c = copyChanges(a, b);
    expect(c.options).toEqual(["Oak: 800 → 860 sqft · $9,150 → $8,900", "Vinyl plank: 820 sqft · $8,420 (new)", "Stairs removed (was $2,400)"]);
    expect(c.details).toEqual(["Changed: Click install, 800 sqft to 860 sqft on Oak"]);
    expect(c.moved).toBe(true);
  });

  it("says no change on an option that didn't move, and leaves sqft off a stairs option", () => {
    const a = copy([option("Oak", 9150, [install(800)]), option("Stairs", 2400)]);
    const b = copy([option("Oak", 9150, [install(800)]), option("Stairs", 2600)]);
    expect(copyChanges(a, b).options).toEqual(["Oak: 800 sqft · $9,150, no change", "Stairs: $2,400 → $2,600"]);
  });

  it("counts install sqft only: not sanding or refinishing, not an add-on, not other sections", () => {
    const o = option("Oak", 1000, [
      section("Install", [item("Click install", 500), item("Sand and refinish", 200), { ...item("Glue assist", 500) }, { ...item("Extra closet", 40), optional: true }]),
      section("Materials", [item("Oak plank", 550)]),
    ]);
    expect(installSqft(o)).toBe(500);
    expect(installSqft(option("Stairs", 2400))).toBeNull();
  });

  it("names a lone option renamed, and moves the range into the line", () => {
    const c = copyChanges(copy([option("Option A", 5000, [install(500)])]), copy([option("Engineered oak", 5600, [install(560)])]));
    expect(c.options).toEqual(["Engineered oak (was Option A): 500 → 560 sqft · $5,000 → $5,600"]);
    const pre = option("Oak", 5000, [], { range: { low: 4850, high: 5500, lowWithHst: 5480, highWithHst: 6215 } });
    const r = copyChanges(copy([pre]), copy([option("Oak", 5000)]));
    expect(r.options).toEqual(["Oak: $4,850–$5,500 → $5,000"]);
    expect(r.details).toEqual(["exact price"]);
  });

  it("keeps the pricing shown, the discount and the date in the details", () => {
    const c = copyChanges(copy([option("Oak", 5000)]), copy([option("Oak", 5000)], { pricing: "itemised", discountRate: 0.1, validUntil: "2026-12-15" }));
    expect(c.details).toEqual(["breakdown sent", "discount 0% → 10%", "good until 2026-12-15"]);
  });

  it("has nothing moved for the same quote", () => {
    const a = copy([option("Oak", 5000, [install(500)])]);
    expect(copyChanges(a, structuredClone(a))).toEqual({ options: ["Oak: 500 sqft · $5,000, no change"], details: [], moved: false });
  });
});

describe("the send history", () => {
  const v1 = version({
    id: "recV1",
    version: 1,
    status: "Superseded",
    sentAt: "2026-11-01",
    sentBy: "albert@titanfloors.ca",
    sentTo: "Email",
    copy: copy([option("Oak", 9150)]),
    editLog: [logLine(new Date("2026-10-31T15:00:00Z"), "albert@titanfloors.ca", "autosaved"), logLine(new Date("2026-11-01T15:00:00Z"), "albert@titanfloors.ca", "sent by email from albert@titanfloors.ca")].join("\n"),
  });
  const v2 = version({
    id: "recV2",
    version: 2,
    status: "Sent",
    sentAt: "2026-11-18",
    sentBy: "info@titanfloors.ca",
    sentTo: "Email, Text",
    copy: copy([option("Oak", 8900)]),
    createdTime: "2026-11-17T12:00:00.000Z",
    editLog: [
      logLine(new Date("2026-11-18T15:00:00Z"), "pat@titanfloors.ca", withNote("sent by email and text from info@titanfloors.ca, text from +15550000000, as info@titanfloors.ca", "Matched the other quote")),
      logLine(new Date("2026-11-19T19:05:00Z"), "pat@titanfloors.ca", withNote("sent again by text, with the PDF link", "Asked for the PDF")),
    ].join("\n"),
  });
  const draft = version({ id: "recV3", version: 3, status: "Draft", lastEditedBy: "pat@titanfloors.ca", lastEditedAt: "2026-11-20T14:00:00.000Z", createdTime: "2026-11-20T12:00:00.000Z" });

  it("lists sends newest first: who, how, the note, and what changed since the send before", () => {
    const h = sendHistory([draft, v1, v2]);
    expect(h.rows.map((r) => r.id)).toEqual(["recV2", "recV1"]);
    const [last, first] = h.rows;
    expect(last).toMatchObject({ label: "v2", by: "Joey", how: "email and text", note: "Matched the other quote", options: ["Oak: $9,150 → $8,900"], details: [], first: false, same: false });
    expect(last.resends).toEqual([{ when: "2026-11-19 14:05", who: "Pat", how: "text", note: "Asked for the PDF" }]);
    expect(first).toMatchObject({ by: "Albert", how: "email", note: null, options: ["Oak: $9,150"], details: [], first: true, same: false, resends: [] });
    expect(h.draft).toEqual({ id: "recV3", label: "v3", lastEditedBy: "Pat", lastEditedAt: "2026-11-20T14:00:00.000Z" });
  });

  it("says when a new version went out unchanged, and reads a marked-sent version", () => {
    const again = version({ ...v2, copy: copy([option("Oak", 9150)]), sentTo: "Marked sent", editLog: logLine(new Date("2026-11-18T15:00:00Z"), "albert@titanfloors.ca", "marked sent, nothing sent to the customer") });
    const [row] = sendHistory([v1, again]).rows;
    expect(row).toMatchObject({ options: ["Oak: $9,150, no change"], same: true });
    expect(row.how).toBe("marked sent, nothing went to the customer");
  });

  it("leaves out versions that never went out, and has no draft when none is open", () => {
    expect(sendHistory([draft])).toEqual({ rows: [], draft: expect.objectContaining({ id: "recV3" }) });
    expect(sendHistory([v1]).draft).toBeNull();
  });
});
