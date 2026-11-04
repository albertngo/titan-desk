import { describe, expect, it } from "vitest";
import { optionTotals } from "../src/lib/calc";
import {
  acceptedIsSet,
  addDiscount,
  addLine,
  addOption,
  blankQuote,
  buildCatalogue,
  discountAmountFrom,
  holdAccepted,
  lineFromEntry,
  manualLine,
  PRICE_ADJUSTMENT,
  priceCeiling,
  removeDiscount,
  resetAccepted,
  setAcceptedPrice,
  setMarginTarget,
  setServiceLevel,
  setTotalDiscount,
  settleContractor,
  updateDiscount,
  updateLine,
  type EditorQuote,
} from "../src/lib/editor/model";
import { CONTRACTOR_LINE, grossOf, isContractorLine, priceForMargin, priceSummary } from "../src/lib/pricing/discounts";
import { SERVICE_LEVELS } from "../src/lib/pricing/service";
import { cleanEditorQuote } from "../src/lib/quotes/savePlan";
import type { RateRow } from "../src/lib/quotes/types";

// INVENTED rates and amounts only: this repo is public.

/** One option, $1,000 of work costing $600. */
function withWork(): { q: EditorQuote; id: string } {
  const q = blankQuote();
  const id = q.options[0].id;
  return { id, q: addLine(q, id, { ...manualLine("Install", "Work"), qty: 100, unitPrice: 10, costOverride: 6 }) };
}
const subtotal = (q: EditorQuote) => optionTotals(q.options[0].lines, q.discountRate, q.showHst).subtotal;
const summary = (q: EditorQuote) => priceSummary(q.options[0].lines, q.discountRate, q.showHst);

describe("discount items (Albert, 2026-11-04)", () => {
  it("are lines in the Discounts section priced below zero, counted like any other line", () => {
    const { q, id } = withWork();
    const r = addDiscount(q, id, "Senior", 100);
    const line = r.options[0].lines.find((l) => l.section === "Discounts");
    expect(line).toMatchObject({ description: "Senior", qty: 1, uom: "flat", unitPrice: -100, sourceKind: "manual", lineType: "Other" });
    expect(subtotal(r)).toBe(900);
    expect(summary(r)).toMatchObject({ gross: 1000, itemsTotal: 100, adjustment: 0, subtotal: 900, totalDiscountPct: 10, pinned: false });
  });

  it("can be several, renamed, re-priced and removed, and survive the save's cleaning", () => {
    const { q, id } = withWork();
    let r = addDiscount(addDiscount(q, id, "Senior", 100), id, "Referral", 50);
    const [a, b] = r.options[0].lines.filter((l) => l.section === "Discounts");
    r = updateDiscount(r, id, a.id, { label: "Senior discount", amount: 120 });
    expect(subtotal(r)).toBe(830);
    r = removeDiscount(r, id, b.id);
    expect(r.options[0].lines.filter((l) => l.section === "Discounts").map((l) => [l.description, l.unitPrice])).toEqual([["Senior discount", -120]]);
    const cleaned = cleanEditorQuote(JSON.parse(JSON.stringify(r)));
    expect(cleaned?.options[0].lines.find((l) => l.description === "Senior discount")).toMatchObject({ section: "Discounts", unitPrice: -120 });
  });

  it("take dollars only, never a percent (Albert, 2026-11-04)", () => {
    expect(discountAmountFrom("$250")).toBe(250);
    expect(discountAmountFrom("1,250.50")).toBe(1250.5);
    expect(discountAmountFrom("5%")).toBeNull();
    expect(discountAmountFrom("0")).toBeNull();
    expect(discountAmountFrom("abc")).toBeNull();
  });

  it("stay put while the accepted price moves its own adjustment around them", () => {
    const { q, id } = withWork();
    let r = addDiscount(q, id, "Senior", 100);
    r = setAcceptedPrice(r, id, 810);
    expect(subtotal(r)).toBe(810);
    expect(r.discountRate).toBe(0); // the option's own line, never the version's rate (2026-11-04)
    expect(summary(r)).toMatchObject({ itemsTotal: 100, adjustment: 90, totalDiscountPct: 19, pinned: true });
    // Listed for the totals as the customer reads it, after the items, in dollars.
    expect(summary(r).items.map((x) => [x.label, x.amount, x.accepted])).toEqual([["Senior", 100, false], ["Discount", 90, true]]);
    // Adding a discount item with an accepted price set keeps the accepted price.
    r = addDiscount(r, id, "Referral", 50);
    expect(subtotal(r)).toBe(810);
    expect(summary(r).itemsTotal).toBe(150);
  });
});

describe("the accepted price card's three boxes (2026-11-04)", () => {
  it("land the price from a total discount percent, counting the discount items", () => {
    const { q, id } = withWork();
    const r = setTotalDiscount(addDiscount(q, id, "Senior", 100), id, 15);
    expect(subtotal(r)).toBe(850);
    expect(summary(r).totalDiscountPct).toBe(15);
  });

  it("land the price from a margin percent on the cost", () => {
    const { q, id } = withWork();
    const r = setMarginTarget(q, id, 25);
    expect(subtotal(r)).toBe(800); // 600 / 0.75
    expect(summary(r).marginPct).toBe(25);
  });

  it("reset clears all three: no discount rate, no adjustment line, the items kept", () => {
    const { q, id } = withWork();
    const below = setAcceptedPrice(addDiscount(q, id, "Senior", 100), id, 700);
    expect(acceptedIsSet(below, below.options[0])).toBe(true);
    const r = resetAccepted(below, id);
    expect(r.discountRate).toBe(0);
    expect(acceptedIsSet(r, r.options[0])).toBe(false);
    expect(subtotal(r)).toBe(900);
    // An older quote's above-list adjustment line comes off too.
    const old = addLine(q, id, { ...manualLine("Private", PRICE_ADJUSTMENT), uom: "flat", qty: 1, unitPrice: 200 });
    expect(acceptedIsSet(old, old.options[0])).toBe(true);
    const r2 = resetAccepted(old, id);
    expect(r2.options[0].lines.some((l) => l.section === "Private")).toBe(false);
    expect(subtotal(r2)).toBe(1000);
  });

  it("never mark the price up: above what the slider and discounts make is refused (Albert, 2026-11-04)", () => {
    const { q, id } = withWork();
    const withItem = addDiscount(q, id, "Senior", 100);
    expect(priceCeiling(withItem, id)).toBe(900);
    expect(setAcceptedPrice(withItem, id, 950)).toBe(withItem);
    expect(setTotalDiscount(withItem, id, 5)).toBe(withItem); // 5% off 1000 is 950: above 900
    expect(setMarginTarget(withItem, id, 50)).toBe(withItem); // 1200: above
    expect(subtotal(setAcceptedPrice(withItem, id, 900))).toBe(900);
  });
});

describe("the 20% margin minimum (2026-11-04)", () => {
  it("is the lowest price before HST that keeps 20% on the cost, rounded up to the cent", () => {
    expect(priceForMargin(600)).toBe(750);
    expect(priceForMargin(100.01)).toBe(125.02); // 125.0125 rounds up, never under
    expect(priceForMargin(0)).toBeNull();
    const { q } = withWork();
    expect(summary(q).minPrice).toBe(750);
  });
});

const RATE: RateRow = {
  id: "recRate0000000000",
  labourType: "Install",
  spec: "CLICK PLANK",
  contractor: "Crew A",
  uom: "sqft",
  rate: 2,
  cost: 1.2,
  minCharge: null,
  defaultWaste: null,
  materialGroup: null,
  defaultMaterial: null,
} as RateRow;

describe("Contractor pricing (Albert, 2026-11-04)", () => {
  const card = buildCatalogue([RATE], []);
  const withCard = () => {
    const q = blankQuote();
    const id = q.options[0].id;
    return { id, q: addLine(q, id, { ...lineFromEntry(card[0], "Install"), qty: 500 }) };
  };

  it("sits left of Standard and Premium on the slider", () => {
    expect(SERVICE_LEVELS).toEqual(["Contractor", "Standard", "Premium"]);
  });

  it("takes 10% off the whole option as one discount line, at Standard card prices", () => {
    const { q, id } = withCard();
    const prem = setServiceLevel(q, id, "Premium", card).quote;
    const r = setServiceLevel(prem, id, "Contractor", card).quote;
    const lines = r.options[0].lines;
    expect(lines.find((l) => l.section === "Install")?.unitPriceSnap).toBe(2); // the card, not Premium's +15%
    expect(lines.find((l) => isContractorLine(l))).toMatchObject({ description: CONTRACTOR_LINE, section: "Discounts", unitPrice: -100 });
    expect(subtotal(r)).toBe(900);
    // Back to Standard: the line goes.
    const s = setServiceLevel(r, id, "Standard", card).quote;
    expect(s.options[0].lines.some((l) => isContractorLine(l))).toBe(false);
    expect(subtotal(s)).toBe(1000);
  });

  it("follows the list price as lines change, and leaves other levels alone", () => {
    const { q, id } = withCard();
    const r = setServiceLevel(q, id, "Contractor", card).quote;
    const install = r.options[0].lines.find((l) => l.section === "Install")!;
    const more = settleContractor(updateLine(r, id, install.id, { qty: 1000 }));
    expect(more.options[0].lines.find((l) => isContractorLine(l))?.unitPrice).toBe(-200);
    expect(grossOf(more.options[0].lines)).toBe(2000);
    expect(settleContractor(more)).toBe(more); // nothing moved: the same quote back
    expect(settleContractor(q)).toBe(q);
  });

  it("does not move an accepted price: the adjustment absorbs the slider", () => {
    const { q, id } = withCard();
    const accepted = setAcceptedPrice(q, id, 850);
    const r = setServiceLevel(accepted, id, "Contractor", card).quote;
    expect(subtotal(r)).toBe(850);
    expect(summary(r).itemsTotal).toBe(100);
    const p = setServiceLevel(r, id, "Premium", card).quote;
    expect(subtotal(p)).toBe(850);
    // Reset reads the slider and the discounts again.
    expect(subtotal(resetAccepted(p, id))).toBe(1150);
  });

  it("refuses a slider move that could only hold the accepted price with a markup, and never marks it up (2026-11-04)", () => {
    const { q, id } = withCard();
    const accepted = setAcceptedPrice(q, id, 950);
    const moved = settleContractor(setServiceLevel(accepted, id, "Contractor", card).quote); // 900 before the accepted discount
    expect(moved.options[0].lines.some((l) => l.section === "Private")).toBe(false);
    const r = holdAccepted(accepted, moved);
    expect(r.refused).toEqual({ optionId: id, name: accepted.options[0].name, price: 950 });
    expect(r.quote).toBe(accepted);
    expect(subtotal(r.quote)).toBe(950);
  });

  it("saves as Contractor", () => {
    const { q, id } = withCard();
    const r = setServiceLevel(q, id, "Contractor", card).quote;
    expect(cleanEditorQuote(JSON.parse(JSON.stringify(r)))?.options[0].serviceLevel).toBe("Contractor");
  });
});

describe("a flat card row starts at one (Albert, 2026-11-04)", () => {
  it("puts a bin in at quantity 1 from the editor's picker, and leaves a measured row blank", () => {
    const bin = { ...RATE, id: "recRateBin0000000", labourType: "Disposal", spec: "Bin", uom: "flat", rate: 400, cost: 250 } as RateRow;
    const [binEntry, installEntry] = buildCatalogue([bin, RATE], []).sort((a) => (a.kind === "rate" && a.uom === "flat" ? -1 : 1));
    expect(lineFromEntry(binEntry, "Disposal")).toMatchObject({ qty: 1, uom: "flat", unitPriceSnap: 400 });
    expect(lineFromEntry(installEntry, "Install").qty).toBeNull();
  });
});

describe("the accepted price is held, firmly (Albert, 2026-11-04)", () => {
  // INVENTED: $1,000 of work costing $600, accepted at $900.
  const held = () => {
    const { q, id } = withWork();
    return { id, q: setAcceptedPrice(q, id, 900) };
  };
  const apply = (before: EditorQuote, next: EditorQuote) => holdAccepted(before, settleContractor(next));

  it("keeps the price while a discount item comes and goes; the margin and total discount move", () => {
    const { q, id } = held();
    let r = addDiscount(q, id, "Senior", 50);
    expect(subtotal(r)).toBe(900);
    expect(summary(r)).toMatchObject({ itemsTotal: 50, adjustment: 50, totalDiscountPct: 10, pinned: true });
    r = removeDiscount(r, id, r.options[0].lines.find((l) => l.description === "Senior")!.id);
    expect(subtotal(r)).toBe(900);
  });

  it("keeps the price across any line change, the accepted discount taking it up", () => {
    const { q, id } = held();
    const work = q.options[0].lines.find((l) => l.description === "Work")!;
    const bigger = apply(q, updateLine(q, id, work.id, { qty: 120 }));
    expect(bigger.refused).toBeNull();
    expect(subtotal(bigger.quote)).toBe(900);
    expect(summary(bigger.quote).adjustment).toBe(300);
    const extra = apply(bigger.quote, addLine(bigger.quote, id, { ...manualLine("Prep", "Patch"), qty: 1, uom: "flat", unitPrice: 75 }));
    expect(subtotal(extra.quote)).toBe(900);
  });

  it("refuses a change that would take the price under the accepted price, and changes nothing", () => {
    const { q, id } = held();
    const work = q.options[0].lines.find((l) => l.description === "Work")!;
    const smaller = apply(q, updateLine(q, id, work.id, { qty: 80 })); // 800 before the accepted discount
    expect(smaller.refused).toMatchObject({ optionId: id, price: 900 });
    expect(smaller.quote).toBe(q);
    const tooMuch = apply(q, addDiscount(q, id, "Senior", 150));
    expect(tooMuch.refused).toMatchObject({ price: 900 });
  });

  it("pins a price typed at the price as it stands, and lets the accepted price itself be set, reset or cleared", () => {
    const { q, id } = withWork();
    const same = setAcceptedPrice(q, id, 1000);
    expect(acceptedIsSet(same, same.options[0])).toBe(true);
    // Pinned at the full price, a new discount item could only be held with a markup: refused.
    expect(apply(same, addDiscount(same, id, "Senior", 50)).refused).toMatchObject({ price: 1000 });
    // A bigger list price is absorbed: still 1,000.
    const work = same.options[0].lines.find((l) => l.description === "Work")!;
    expect(subtotal(apply(same, updateLine(same, id, work.id, { qty: 110 })).quote)).toBe(1000);
    const { q: h, id: hid } = held();
    expect(subtotal(apply(h, setAcceptedPrice(h, hid, 850)).quote)).toBe(850);
    expect(subtotal(apply(h, resetAccepted(h, hid)).quote)).toBe(1000);
  });

  it("holds each option apart: a change on one never moves another's accepted price", () => {
    const { q, id } = held();
    const two = addOption(q);
    const id2 = two.options[1].id;
    const both = setAcceptedPrice(addLine(two, id2, { ...manualLine("Install", "Other"), qty: 10, unitPrice: 100 }), id2, 700);
    const work = both.options[0].lines.find((l) => l.description === "Work")!;
    const r = apply(both, updateLine(both, id, work.id, { qty: 150 }));
    expect(r.quote.options.map((o) => optionTotals(o.lines, r.quote.discountRate, r.quote.showHst).subtotal)).toEqual([900, 700]);
  });
});
