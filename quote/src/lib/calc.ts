/**
 * Quote maths. Pure, no I/O, and the ONLY place the app computes money.
 *
 * Every rule here mirrors a formula in the Airtable base, field for field, so the app and
 * Airtable agree to the cent (the quote page shows a parity check against Airtable's own
 * rollups). Change a formula here and in Airtable together, never one alone.
 *
 *   Quote Lines.Price Used   = IF({Unit Price}, {Unit Price}, {Unit Price Snap})
 *   Quote Lines.Cost Used    = IF({Cost Override}, {Cost Override}, {Unit Cost Snap})
 *   Quote Lines.Line Total   = blank for Note/Section/Exclusions; 0 when Include is off;
 *                              ROUND(min-charge-or Qty*(1+Waste)*PriceUsed, 2)
 *   Quote Lines.Line Cost    = blank/0 as above; Manual Cost wins; else ROUND(Qty*(1+Waste)*CostUsed, 2)
 *   Quote Options.*          = the option-level formulas in `optionTotals` below
 *
 * Airtable's IF({x}, …) treats blank AND 0 as false; `firstSet` reproduces that.
 */

/** Ontario HST and the 35 / 35 / remainder payment split, as hard-coded in the Airtable formulas. */
export const HST_RATE = 0.13;
export const PAYMENT_SPLIT = 0.35;

/**
 * Work-type sections, in the order they appear everywhere: the quote view, the editor, the
 * "Add work" buttons and the Analysis tab. Order set by Albert (2026-10-12): Install,
 * Removal, Disposal, Prep, Materials, Delivery; the sections he did not place sit before
 * Other; Exclusions are always last.
 */
export const SECTIONS = [
  "Install",
  "Removal",
  "Disposal",
  "Prep",
  "Materials",
  "Delivery",
  "Stairs",
  "Refinish",
  "Paint",
  "Sand",
  "Other",
  "Exclusions",
] as const;

export type LineInput = {
  lineType: string | null;
  section: string | null;
  include: boolean;
  qty: number | null;
  /** Fraction, e.g. 0.1 for 10%. */
  waste: number | null;
  /** Rate override; blank means use the card (snap). */
  unitPrice: number | null;
  unitPriceSnap: number | null;
  unitCostSnap: number | null;
  /** Cost override; blank means use the card (snap). */
  costOverride: number | null;
  /** Whole-line cost; wins over everything when set. */
  manualCost: number | null;
  minChargeSnap: number | null;
  /** True when the line links to a Rate Card row, a Stair Item or a catalogue product. */
  hasSource: boolean;
};

export type OptionTotals = {
  preDiscount: number;
  discount: number;
  subtotal: number;
  cost: number;
  profit: number;
  /** Percent, one decimal (21.7 means 21.7%). Null when the subtotal is not positive. */
  marginPct: number | null;
  hst: number;
  total: number;
  payment1: number;
  payment2: number;
  paymentFinal: number;
};

export type Flag = "OVR" | "UNIT" | "NOSRC";

/** Round half away from zero, like Airtable's ROUND. The nudge absorbs binary noise (1.005 → 1.01). */
export function round(x: number, places: number): number {
  const f = 10 ** places;
  const r = (Math.sign(x) * Math.round(Math.abs(x) * f + 1e-7)) / f;
  return r === 0 ? 0 : r; // never -0
}

export const round2 = (x: number) => round(x, 2);

function firstSet(a: number | null, b: number | null): number {
  return a ? a : (b ?? 0);
}

/** Note, Section and Exclusions rows carry text only: no price, no cost, no number. */
export function isPriced(l: Pick<LineInput, "lineType" | "section">): boolean {
  return !(l.lineType === "Note" || l.lineType === "Section" || l.section === "Exclusions");
}

export const priceUsed = (l: LineInput) => firstSet(l.unitPrice, l.unitPriceSnap);
export const costUsed = (l: LineInput) => firstSet(l.costOverride, l.unitCostSnap);

function extent(l: LineInput): number {
  return (l.qty ?? 0) * (1 + (l.waste ?? 0));
}

export function lineTotal(l: LineInput): number | null {
  if (!isPriced(l)) return null;
  if (!l.include) return 0;
  const base = extent(l) * priceUsed(l);
  const min = l.minChargeSnap ?? 0;
  return round2(min > 0 && base > 0 && base < min ? min : base);
}

export function lineCost(l: LineInput): number | null {
  if (!isPriced(l)) return null;
  if (!l.include) return 0;
  if (l.manualCost) return l.manualCost;
  return round2(extent(l) * costUsed(l));
}

export function lineFlags(l: LineInput): Flag[] {
  if (!isPriced(l)) return [];
  const flags: Flag[] = [];
  const rateOvr = !!l.unitPrice && !!l.unitPriceSnap && l.unitPrice !== l.unitPriceSnap;
  const costOvr = !!l.costOverride && !!l.unitCostSnap && l.costOverride !== l.unitCostSnap;
  if (rateOvr || costOvr) flags.push("OVR");
  const t = lineTotal(l) ?? 0;
  const c = lineCost(l) ?? 0;
  if (c > 0 && c > t) flags.push("UNIT");
  if (!l.hasSource && t > 0) flags.push("NOSRC");
  return flags;
}

/** Option-level totals. `discountRate` is a fraction (0.11), applied to the pre-discount total. */
export function optionTotals(lines: LineInput[], discountRate: number, hstOn: boolean): OptionTotals {
  let pre = 0;
  let cost = 0;
  for (const l of lines) {
    pre += lineTotal(l) ?? 0;
    cost += lineCost(l) ?? 0;
  }
  // Airtable: Discount = -ROUND(Pre * Rate, 2); Subtotal = ROUND(Pre - ROUND(Pre * Rate, 2), 2)
  const disc = round2(pre * discountRate);
  const subtotal = round2(pre - disc);
  const profit = round2(subtotal - cost);
  const marginPct = subtotal > 0 ? round(((subtotal - cost) / subtotal) * 100, 1) : null;
  const hst = hstOn ? round2(subtotal * HST_RATE) : 0;
  const total = round2(subtotal + hst);
  const payment1 = round2(total * PAYMENT_SPLIT);
  const payment2 = round2(total * PAYMENT_SPLIT);
  const paymentFinal = round2(total - payment1 - payment2);
  return {
    preDiscount: round2(pre),
    discount: disc === 0 ? 0 : -disc,
    subtotal,
    cost: round2(cost),
    profit,
    marginPct,
    hst,
    total,
    payment1,
    payment2,
    paymentFinal,
  };
}

/** Sum of line totals per section, in SECTIONS order; lines with no section land in "Unsorted". */
export function sectionTotals(lines: LineInput[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    const key = l.section ?? "Unsorted";
    out.set(key, round2((out.get(key) ?? 0) + (lineTotal(l) ?? 0)));
  }
  return out;
}

export type ParityRow = { key: keyof OptionTotals; app: number | null; airtable: number | null };

/**
 * Where the app and Airtable disagree on an option. Money must match to the cent; margin to
 * its one decimal. An empty result is the shadow-mode pass condition.
 */
export function parityDiffs(app: OptionTotals, airtable: Partial<OptionTotals>): ParityRow[] {
  const out: ParityRow[] = [];
  for (const key of Object.keys(app) as (keyof OptionTotals)[]) {
    const a = app[key];
    const b = airtable[key] ?? null;
    const tol = key === "marginPct" ? 0.05 : 0.005;
    const same = a === null || b === null ? a === b : Math.abs(a - b) < tol;
    if (!same) out.push({ key, app: a, airtable: b });
  }
  return out;
}
