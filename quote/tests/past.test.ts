import { describe, expect, it } from "vitest";
import { addLine, addOption, blankQuote, buildCatalogue, discountLine, lineFromEntry, manualLine, type CardEntry, type EditorLine, type EditorOption } from "../src/lib/editor/model";
import { cardPriceNow, copyPastOptions, pastNote } from "../src/lib/editor/past";
import { ACCEPTED_LINE, CONTRACTOR_LINE, PRICE_ADJUSTMENT } from "../src/lib/pricing/discounts";
import { optionTotals, PRIVATE_SECTION } from "../src/lib/calc";
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

describe("copy options from old quotes, exactly (2026-11-16)", () => {
  const q = blankQuote();
  const r = copyPastOptions(q, [past()], now);
  const copy = r.quote.options.at(-1)!;
  const src = past();

  it("adds a new option with fresh ids and leaves the quote's own options alone", () => {
    expect(r.quote.options).toHaveLength(2);
    expect(r.quote.options[0]).toBe(q.options[0]);
    expect(r.added).toEqual([copy.id]);
    expect(copy.id).not.toBe(src.id);
    expect(copy.lines.every((l) => !l.id.startsWith("rec"))).toBe(true);
  });

  it("keeps everything on the option, flags included", () => {
    expect([copy.name, copy.description, copy.crew, copy.scope, copy.part, copy.recommended, copy.notOffered, copy.sqftOk]).toEqual([
      "Click plank", "Main floor, about 600 sf.", "Crew A", "Flooring", "Main floor", true, true, "600/660",
    ]);
  });

  it("keeps every line at the price it had, discounts and the accepted price included", () => {
    const strip = (ls: EditorLine[]) => ls.map((l) => ({ ...l, id: "" }));
    expect(strip(copy.lines)).toEqual(strip(src.lines));
    expect(copy.lines.map((l) => l.description)).toEqual(expect.arrayContaining([ACCEPTED_LINE, CONTRACTOR_LINE, PRICE_ADJUSTMENT]));
    expect(optionTotals(copy.lines, 0, false).subtotal).toBe(optionTotals(src.lines, 0, false).subtotal);
  });

  it("counts the card lines whose price has moved since, without changing them", () => {
    // Click plank (2 -> 2.5) twice, the tread (90 -> 95), and the row that's gone.
    expect(r.cardMoved).toBe(4);
    expect(cardPriceNow(src.lines[4], now, "Standard")).toBeUndefined();
    // Against the card it was priced from, only the row that never existed there counts.
    expect(copyPastOptions(q, [past()], then).cardMoved).toBe(1);
  });

  it("never gives two options the same name, and keeps one recommended per Part", () => {
    const twice = copyPastOptions(r.quote, [past(), past()], now);
    expect(twice.quote.options.map((o) => o.name)).toEqual(["Option 1", "Click plank", "Click plank (2)", "Click plank (3)"]);
    expect(twice.quote.options.filter((o) => o.recommended)).toHaveLength(1);
    expect(copyPastOptions(addOption(q, "click plank"), [past()], now).quote.options.at(-1)!.name).toBe("Click plank (2)");
  });

  it("hands a version-wide discount rate to the quote's own options first, so copies don't take it", () => {
    const old = { ...addLine(q, q.options[0].id, { ...lineFromEntry(click, "Install"), qty: 100 }), discountRate: 0.1 };
    const before = optionTotals(old.options[0].lines, 0.1, true).subtotal;
    const out = copyPastOptions(old, [past()], now).quote;
    expect(out.discountRate).toBe(0);
    expect(optionTotals(out.options[0].lines, 0, true).subtotal).toBe(before);
  });

  it("says what happened in plain words", () => {
    expect(pastNote(r)).toBe("Copied 1 option exactly, discounts included. 4 card lines are priced differently on today's Rate Card; the copy keeps the old prices.");
    expect(pastNote({ added: ["a", "b"], cardMoved: 0 })).toBe("Copied 2 options exactly, discounts included.");
  });
});
