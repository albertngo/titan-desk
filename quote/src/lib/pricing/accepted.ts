import { optionTotals, round, type LineInput, type OptionTotals } from "@/lib/calc";

/**
 * What an option looks like at the price the customer actually accepts (Albert, 2026-10-22):
 * the discount that price implies against the list price, and the cost, profit and margin at
 * it. Analysis only: nothing here is stored or written to the quote. Pure; tested in
 * tests/accepted.test.ts.
 */

export type Accepted = {
  /** The discount the accepted price implies, as a fraction (0.11 = 11%). Negative when above list. */
  rate: number;
  /** The option priced at that discount, by the same maths as every quote. */
  t: OptionTotals;
};

/** The discount rate that lands an option's subtotal on `acceptedPreTax`, to four places. */
export function impliedRate(preDiscount: number, acceptedPreTax: number): number | null {
  if (!(preDiscount > 0) || !(acceptedPreTax >= 0)) return null;
  return round(1 - acceptedPreTax / preDiscount, 4);
}

/**
 * The discount rate that lands `round2(pre - round2(pre * rate))` on `acceptedPreTax` to the cent
 * (2026-11-04: the accepted price is the master, so it must land exactly, also when discount items
 * leave an awkward base). Eight places; a cent of float noise either way is nudged back.
 */
export function landingRate(preDiscount: number, acceptedPreTax: number): number | null {
  if (!(preDiscount > 0) || !(acceptedPreTax >= 0)) return null;
  const want = round(acceptedPreTax, 2);
  const lands = (r: number) => round(preDiscount - round(preDiscount * r, 2), 2) === want;
  const r = round(1 - want / preDiscount, 8);
  if (lands(r)) return r;
  for (const d of [1e-8, -1e-8, 1e-7, -1e-7, 1e-6, -1e-6]) if (lands(round(r + d, 8))) return round(r + d, 8);
  return r;
}

/** The option at an accepted pre-tax price. Null when the option has nothing priced or the price is not usable. */
export function atAcceptedPrice(lines: LineInput[], hstOn: boolean, acceptedPreTax: number): Accepted | null {
  const list = optionTotals(lines, 0, hstOn).preDiscount;
  const rate = impliedRate(list, acceptedPreTax);
  return rate === null ? null : { rate, t: optionTotals(lines, rate, hstOn) };
}

/** The option at a discount typed as a percent (11 = 11%). */
export function atDiscountPct(lines: LineInput[], hstOn: boolean, pct: number): Accepted | null {
  if (!Number.isFinite(pct) || pct >= 100) return null;
  const rate = round(pct / 100, 4);
  return { rate, t: optionTotals(lines, rate, hstOn) };
}

/**
 * The option at the final amount the customer agreed to pay, HST included where it is charged (Albert,
 * 2026-11-21: "It should be the FINAL value they pay, accounting for all labor and material HST if there is
 * any"). A discount rate scales the taxed lines with the rest, so the total is the list total times
 * (1 - rate); the price before HST that gets there is found to the cent, the nearest when HST's rounding
 * skips the exact one (the lower on a tie).
 */
export function atAcceptedTotal(lines: LineInput[], hstOn: boolean, total: number): Accepted | null {
  const list = optionTotals(lines, 0, hstOn);
  if (!(list.preDiscount > 0) || !(list.total > 0) || !(total >= 0)) return null;
  const want = round(total, 2);
  const guess = round((want * list.preDiscount) / list.total, 2);
  let best: Accepted | null = null;
  for (let i = -3; i <= 3; i++) {
    const p = round(guess + i / 100, 2);
    const rate = p >= 0 ? landingRate(list.preDiscount, p) : null;
    if (rate === null) continue;
    const t = optionTotals(lines, rate, hstOn);
    const d = Math.abs(t.total - want);
    const bd = best ? Math.abs(best.t.total - want) : Infinity;
    if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && best && t.total < best.t.total)) best = { rate, t };
  }
  return best;
}
