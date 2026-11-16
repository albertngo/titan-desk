import { describe, expect, it } from "vitest";
import { addOption, blankQuote, buildCatalogue, discountLine, lineFromEntry, manualLine, type CardEntry, type EditorOption } from "../src/lib/editor/model";
import { copyPastOptions, pastNote, refreshLine } from "../src/lib/editor/past";
import { ACCEPTED_LINE, CONTRACTOR_LINE, PRICE_ADJUSTMENT } from "../src/lib/pricing/discounts";
import { PRIVATE_SECTION } from "../src/lib/calc";
import type { RateRow, StairRow } from "../src/lib/quotes/types";

// INVENTED rates and contractors only: this repo is public.
const R = (o: Partial<RateRow>): RateRow => ({ id: "recRate0000000000", labourType: "Install", spec: "CLICK PLANK", contractor: "Crew A", uom: "sqft", rate: 2, cost: 1.2, minCharge: null, defaultWaste: null, ...o });
const then = buildCatalogue([R({ id: "recRateA000000001" })], [{ id: "recStair000000001", name: "Stair tread", category: "Treads", size: "36in", rate: 90, cost: 40 }] as StairRow[]);
// Today's card: the click plank rate went up, the stair tread too, and a row has gone.
const now = buildCatalogue([R({ id: "recRateA000000002", rate: 2.5, cost: 1.4 })], [{ id: "recStair000000001", name: "Stair tread", category: "Treads", size: "36in", rate: 95, cost: 42 }] as StairRow[]);
const click = then.find((e) => e.key === "Install|CLICK PLANK") as Extract<CardEntry, { kind: "rate" }>;
const tread = then.find((e) => e.kind === "stair")!;

const past = (): EditorOption => ({
  id: "recOptOld00000001",
  name: "Click plank",
  description: "Main floor, about 600 sf.",
  recommended: true,
  notOffered: true,
  sqftOk: "600/660",
  serviceLevel: "Standard",
  crew: "Crew A",
  scope: "Flooring",
  part: "Main floor",
  lines: [
    { ...lineFromEntry(click, "Install"), id: "recLineOld0000001", qty: 600 },
    { ...lineFromEntry(click, "Install"), id: "recLineOld0000002", qty: 50, unitPrice: 3 },
    { ...lineFromEntry(tread, "Stairs"), id: "recLineOld0000003", qty: 13 },
    { ...lineFromEntry({ ...click, key: "Install|GONE", spec: "GONE" }, "Install"), id: "recLineOld0000004" },
    { ...manualLine("Other", "Move the piano"), id: "recLineOld0000005", unitPrice: 150 },
    { ...discountLine(ACCEPTED_LINE, 200), id: "recLineOld0000006" },
    { ...discountLine(CONTRACTOR_LINE, 100), id: "recLineOld0000007" },
    { ...manualLine(PRIVATE_SECTION, PRICE_ADJUSTMENT), id: "recLineOld0000008", unitPrice: 20 },
  ],
});

describe("copy options from a past quote (2026-11-16)", () => {
  const q = blankQuote();
  const r = copyPastOptions(q, [past()], now);
  const copy = r.quote.options.at(-1)!;

  it("adds a new option with fresh ids and leaves the quote's own options alone", () => {
    expect(r.quote.options).toHaveLength(2);
    expect(r.quote.options[0]).toBe(q.options[0]);
    expect(r.added).toEqual([copy.id]);
    expect(copy.id).not.toBe("recOptOld00000001");
    expect(copy.lines.every((l) => !l.id.startsWith("rec"))).toBe(true);
  });

  it("keeps the option's work and drops what was about that customer", () => {
    expect([copy.name, copy.description, copy.crew, copy.scope, copy.part]).toEqual(["Click plank", "Main floor, about 600 sf.", "Crew A", "Flooring", "Main floor"]);
    expect(copy.recommended).toBe(false);
    expect(copy.notOffered).toBeUndefined();
    expect(copy.sqftOk).toBeUndefined();
  });

  it("leaves off every discount and the accepted price adjustment", () => {
    expect(copy.lines.map((l) => l.description)).not.toContain(ACCEPTED_LINE);
    expect(copy.lines.map((l) => l.description)).not.toContain(CONTRACTOR_LINE);
    expect(copy.lines.map((l) => l.description)).not.toContain(PRICE_ADJUSTMENT);
    expect(copy.lines).toHaveLength(5);
    expect(r.dropped).toBe(3);
  });

  it("prices card lines at today's card and keeps typed prices as typed", () => {
    const [plank, typed, stair, gone, manual] = copy.lines;
    expect([plank.unitPriceSnap, plank.unitCostSnap, plank.sourceId, plank.qty]).toEqual([2.5, 1.4, "recRateA000000002", 600]);
    expect([typed.unitPrice, typed.unitPriceSnap]).toEqual([3, 2.5]);
    expect([stair.unitPriceSnap, stair.unitCostSnap, stair.qty]).toEqual([95, 42, 13]);
    // A row no longer on the card keeps what it had, and is counted.
    expect(gone.unitPriceSnap).toBe(2);
    expect(r.stale).toBe(1);
    expect([manual.description, manual.unitPrice]).toEqual(["Move the piano", 150]);
  });

  it("never gives two options the same name", () => {
    const twice = copyPastOptions(r.quote, [past(), past()], now);
    expect(twice.quote.options.map((o) => o.name)).toEqual(["Option 1", "Click plank", "Click plank (2)", "Click plank (3)"]);
    expect(copyPastOptions(addOption(q, "click plank"), [past()], now).quote.options.at(-1)!.name).toBe("Click plank (2)");
  });

  it("re-prices a stair line at the option's service level", () => {
    const l = { ...lineFromEntry(tread, "Stairs"), id: "x" };
    expect(refreshLine(l, now, "Premium")!.unitPriceSnap).toBeGreaterThan(95);
  });

  it("says what happened in plain words", () => {
    expect(pastNote(r)).toContain("Copied 1 option.");
    expect(pastNote(r)).toContain("1 line is no longer on the card");
    expect(pastNote(r)).toContain("Discounts from the old quote were left off.");
    expect(pastNote({ added: ["a", "b"], stale: 0, dropped: 0 })).toBe("Copied 2 options. Card lines are at today's Rate Card; typed prices stayed as typed.");
  });
});
