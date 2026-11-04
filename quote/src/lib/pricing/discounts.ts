import { lineCost, lineTotal, optionTotals, PRIVATE_SECTION, round, round2, sectionOf, type LineInput } from "@/lib/calc";

/**
 * Discount items and the accepted price's money (Albert, 2026-11-04). Pure; tested in
 * tests/discounts.test.ts. Money is still computed only by calc.ts: a discount item is an ordinary
 * Quote Line priced below zero, so Airtable's formulas and the parity check need no change.
 *
 * An option's price is built in three layers:
 *   1. the list price, its lines at the option's service level (the "gross");
 *   2. its discount items, lines in the Discounts section, each a fixed amount off, which stay put;
 *   3. the accepted price's adjustment, which moves to land the option on the price typed: below the list
 *      a discount line of this option's own, "Accepted price discount" (2026-11-04, Albert: "it should only
 *      apply to the selected option and not carry over to the other items. Same as the discount section"),
 *      above it the private "Accepted price adjustment" line. A version saved before that may still carry
 *      a Discount Rate, which every option follows until the accepted price is next touched.
 * The total discount is everything between 1 and the price before HST.
 */

/** Quote Lines → Section for discount items. Airtable gets the choice by typecast on the first save. */
export const DISCOUNTS_SECTION = "Discounts";

/** The private line the accepted price adds when it is above the list price (2026-10-22). Known by its words. */
export const PRICE_ADJUSTMENT = "Accepted price adjustment";

/**
 * The discount line the accepted price keeps on its own option (2026-11-04). Known by its words; its
 * Client Note holds the reason the customer sees. Rename it and it is an ordinary discount item.
 */
export const ACCEPTED_LINE = "Accepted price discount";

/** Contractor pricing (Albert, 2026-11-04: "an automatic 10% decrease on the overall price"). */
export const CONTRACTOR_DISCOUNT = 0.1;
export const CONTRACTOR_LINE = "Contractor pricing (10% off)";

/** The margin a quote should not go under (Albert, 2026-11-04: "the 20% margin minimum"). */
export const MIN_MARGIN_PCT = 20;

type Described = LineInput & { description?: string | null; sourceKind?: string; clientNote?: string | null };

export const isDiscountLine = (l: Pick<LineInput, "section">) => sectionOf(l) === DISCOUNTS_SECTION;
export const isContractorLine = (l: Described) => isDiscountLine(l) && l.description === CONTRACTOR_LINE;
export const isAcceptedLine = (l: Described) => isDiscountLine(l) && (l.sourceKind ?? "manual") === "manual" && l.description === ACCEPTED_LINE;
export const isAdjustmentLine = (l: Described) => l.section === PRIVATE_SECTION && (l.sourceKind ?? "manual") === "manual" && l.description === PRICE_ADJUSTMENT;

/** The list price: every included line but the discount items and the accepted price's adjustment. */
export function grossOf(lines: Described[]): number {
  return round2(lines.filter((l) => !isDiscountLine(l) && !isAdjustmentLine(l)).reduce((a, l) => a + (lineTotal(l) ?? 0), 0));
}

/**
 * What the customer reads for an accepted price discount: "Discount", and the reason when one was given
 * ("Discount · Fall promotion"). A dollar line like every discount, so no percent (Albert, 2026-11-04:
 * "discounts are dollar line values only. not % by the way").
 */
export function acceptedLabel(reason?: string | null): string {
  const why = (reason ?? "").trim();
  return `Discount${why ? ` · ${why}` : ""}`;
}

/** The Contractor level's discount on a list price, in dollars (positive). */
export const contractorAmount = (gross: number) => (gross > 0 ? round2(gross * CONTRACTOR_DISCOUNT) : 0);

/**
 * The lowest price before HST that keeps `pct` margin on `cost`, rounded up to the cent so it never
 * lands a hair under. Null when there is no cost to keep a margin on.
 */
export function priceForMargin(cost: number, pct = MIN_MARGIN_PCT): number | null {
  if (!(cost > 0) || !(pct < 100)) return null;
  return Math.ceil(round((cost / (1 - pct / 100)) * 100, 4)) / 100;
}

/** The price before HST that a margin percent implies on a cost. */
export const priceAtMargin = (cost: number, pct: number): number | null => (cost > 0 && pct < 100 ? round2(cost / (1 - pct / 100)) : null);

/** The price before HST that a total discount percent implies on a list price. */
export const priceAtTotalDiscount = (gross: number, pct: number): number | null => (gross > 0 && pct <= 100 ? round2(gross * (1 - pct / 100)) : null);

export type PriceSummary = {
  /** The list price at the option's service level, before anything comes off. */
  gross: number;
  /**
   * Each discount row as a positive amount off, in the order the lines are: the discount items and, marked
   * `accepted`, the accepted price discount (labelled as the customer reads it), so totals list both.
   */
  items: { label: string; amount: number; contractor: boolean; accepted: boolean }[];
  /** The discount items alone, the accepted price discount left out. */
  itemsTotal: number;
  /** What the accepted price changed: its discount line and any old version rate (positive) or, above the list, the private line (negative). 0 = none. */
  adjustment: number;
  /** Whether an accepted price is set: its discount line, the above-list private line, or an old version rate. */
  pinned: boolean;
  subtotal: number;
  cost: number;
  profit: number;
  marginPct: number | null;
  /** Everything off the list price, as a percent of it (one decimal). Negative above the list. Null with nothing priced. */
  totalDiscountPct: number | null;
  /** The price before HST that keeps MIN_MARGIN_PCT. */
  minPrice: number | null;
};

/** One option's price, layer by layer, for the accepted price card. */
export function priceSummary(lines: Described[], discountRate: number, hstOn: boolean): PriceSummary {
  const t = optionTotals(lines, discountRate, hstOn);
  const gross = grossOf(lines);
  const items = lines
    .filter((l) => isDiscountLine(l) && l.include)
    .map((l) => {
      const accepted = isAcceptedLine(l);
      const label = accepted ? acceptedLabel(l.clientNote) : (l.description ?? "").trim() || "Discount";
      return { label, amount: round2(-(lineTotal(l) ?? 0)), contractor: isContractorLine(l), accepted };
    })
    .filter((x) => x.amount !== 0);
  const itemsTotal = round2(items.filter((x) => !x.accepted).reduce((a, x) => a + x.amount, 0));
  const acceptedOff = round2(items.filter((x) => x.accepted).reduce((a, x) => a + x.amount, 0));
  const adjLine = lines.find((l) => isAdjustmentLine(l));
  const adjustment = round2(-t.discount + acceptedOff - (adjLine ? (lineTotal(adjLine) ?? 0) : 0));
  const cost = round2(lines.reduce((a, l) => a + (lineCost(l) ?? 0), 0));
  return {
    gross,
    items,
    itemsTotal,
    adjustment,
    pinned: discountRate !== 0 || !!adjLine || lines.some((l) => isAcceptedLine(l)),
    subtotal: t.subtotal,
    cost,
    profit: t.profit,
    marginPct: t.marginPct,
    totalDiscountPct: gross > 0 ? round(((gross - t.subtotal) / gross) * 100, 1) : null,
    minPrice: priceForMargin(cost),
  };
}
