import { SECTIONS, chargesHst, isPriced, lineTotal, optionTotals, priceUsed, round2, sectionOf } from "@/lib/calc";
import type { Quote, QuoteLine, QuoteOption } from "@/lib/quotes/types";

/**
 * The customer copy: exactly what a customer is sent, frozen on the version at send time
 * (Quote Versions → Customer Copy). The customer page and the PDF are drawn from it and from
 * nothing else, so what the customer sees can never drift from what was sent, and the public
 * side of the app never touches a live line.
 *
 * It is built from a whitelist. Cost, margin, profit, contractor, card rates, flags and
 * internal notes are never copied in; tests/send.test.ts checks that none of them can reach it.
 */

export const COPY_VERSION = 1;

export type CopyItem = {
  kind: "item";
  /** Running number across the option; optional add-ons are not numbered. */
  n: number | null;
  description: string;
  /** Room or area, and the note for the customer, joined. */
  note: string | null;
  /** Quantity including any waste allowance, so quantity × unit price is the amount. */
  qty: number | null;
  uom: string | null;
  /** Whole percent of waste included in `qty`, when there is any. */
  wastePct: number | null;
  /**
   * Null when a minimum charge sets the amount instead. On an option with a private adjustment
   * (2026-10-20) the lines carry their share of it, and this is the amount over the quantity to
   * the cent, so quantity × unit price can be a few cents off the amount.
   */
  unitPrice: number | null;
  minimum: boolean;
  amount: number;
  /** An add-on the customer can choose: priced, not in the total. */
  optional: boolean;
  /**
   * Only where a material's HST differs from the rest of the quote (2026-10-16): "none" = no HST on
   * it while the quote charges HST; "plus" = HST on it while the quote does not. Absent otherwise.
   */
  hst?: "none" | "plus";
};
export type CopyText = { kind: "text"; text: string; note: string | null };
export type CopySection = { name: string; total: number; lines: (CopyItem | CopyText)[] };

export type CopyTotals = {
  preDiscount: number;
  discount: number;
  subtotal: number;
  hst: number;
  total: number;
  payment1: number;
  payment2: number;
  paymentFinal: number;
};

export type CopyOption = {
  name: string;
  description: string | null;
  recommended: boolean;
  sections: CopySection[];
  exclusions: string[];
  totals: CopyTotals;
};

export type Letterhead = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hstNumber: string | null;
};

/**
 * How much pricing the customer sees (Albert, 2026-10-20): "total" = each option's lines with their
 * quantities, and the price at the end only; "rates" = every line with its unit price and amount, and
 * each section's subtotal. New sends default to "total". Absent on copies sent before this existed,
 * which showed rates, so absent reads as "rates".
 */
export type CopyPricing = "rates" | "total";
export const isPricing = (s: unknown): s is CopyPricing => s === "rates" || s === "total";
export const DEFAULT_PRICING: CopyPricing = "total";

export type CustomerCopy = {
  v: typeof COPY_VERSION;
  quoteNumber: string;
  version: number | null;
  basis: string | null;
  /** YYYY-MM-DD, Toronto. */
  sentOn: string;
  validUntil: string;
  customer: { name: string | null; siteAddress: string | null; siteCity: string | null };
  /** "When are they planning to do the project?" as answered (2026-10-18); absent on older copies. */
  timing?: string | null;
  /** See CopyPricing; absent on older copies. */
  pricing?: CopyPricing;
  /** Fraction, e.g. 0.11. */
  discountRate: number;
  showHst: boolean;
  company: Letterhead;
  options: CopyOption[];
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim() || null;

/** Priced sections in work order, as the quote page shows them; exclusions are listed separately. */
function sectionNames(lines: QuoteLine[]): string[] {
  const present = new Set(lines.filter((l) => isPriced(l) || l.lineType === "Note" || l.lineType === "Section").map(sectionOf));
  present.delete("Exclusions");
  const out: string[] = SECTIONS.filter((s) => present.has(s));
  if (present.has("Unsorted")) out.push("Unsorted");
  return out;
}

/**
 * Private lines (Albert, 2026-10-20) are never listed; what they add is spread over the lines the
 * customer does see, in proportion to their amounts, to the cent, so the lines still add up to the
 * subtotal. The only time one shows is when there is nothing to fold it into.
 */
function foldable(o: QuoteOption): { listed: QuoteLine[]; fold: number } {
  const hidden = o.lines.filter((l) => l.private === true && isPriced(l) && l.include);
  const fold = round2(hidden.reduce((s, l) => s + (lineTotal(l) ?? 0), 0));
  const visible = o.lines.filter((l) => l.private !== true);
  const base = visible.filter((l) => isPriced(l) && l.include).reduce((s, l) => s + (lineTotal(l) ?? 0), 0);
  if (fold === 0) return { listed: visible, fold: 0 };
  return base > 0 && base + fold >= 0 ? { listed: visible, fold } : { listed: o.lines, fold: 0 };
}

function spread(sections: CopySection[], fold: number): void {
  const items = sections.flatMap((s) => s.lines).filter((l): l is CopyItem => l.kind === "item" && !l.optional && l.amount > 0);
  const base = items.reduce((s, l) => s + l.amount, 0);
  const targets = items.map((l) => (l.amount + (fold * l.amount) / base) * 100);
  const cents = targets.map((t) => Math.floor(t + 1e-7));
  let left = Math.round((base + fold) * 100) - cents.reduce((s, c) => s + c, 0);
  // The cents the floors dropped go to the lines that lost the most, one each.
  for (const i of targets.map((t, i) => [t - cents[i], i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i)) {
    if (left <= 0) break;
    cents[i] += 1;
    left -= 1;
  }
  items.forEach((l, i) => {
    l.amount = cents[i] / 100;
    l.unitPrice = l.minimum ? null : l.qty !== null && l.qty > 0 ? round2(l.amount / l.qty) : l.amount;
  });
  for (const s of sections) s.total = round2(s.lines.reduce((t, l) => t + (l.kind === "item" && !l.optional ? l.amount : 0), 0));
}

function copyOption(o: QuoteOption, discountRate: number, showHst: boolean): CopyOption {
  let n = 0;
  const sections: CopySection[] = [];
  const { listed, fold } = foldable(o);
  for (const name of sectionNames(listed)) {
    const lines: (CopyItem | CopyText)[] = [];
    let total = 0;
    for (const l of listed.filter((x) => sectionOf(x) === name)) {
      const note = clean([l.area, l.clientNote].filter(Boolean).join(" · "));
      if (!isPriced(l)) {
        const text = clean(l.description);
        if (text) lines.push({ kind: "text", text, note: clean(l.clientNote) });
        continue;
      }
      // An add-on is shown at the price it would add; it is not counted.
      const amount = lineTotal({ ...l, include: true }) ?? 0;
      if (amount === 0 && !l.include) continue;
      const extent = (l.qty ?? 0) * (1 + (l.waste ?? 0));
      const price = priceUsed(l);
      // calc.ts charges the minimum when the line comes in under it; say so rather than show a price that doesn't multiply out.
      const minimum = (l.minChargeSnap ?? 0) > 0 && extent * price > 0 && extent * price < (l.minChargeSnap ?? 0);
      const qty = l.qty === null ? null : round2(extent);
      if (l.include) total += amount;
      lines.push({
        kind: "item",
        n: l.include ? ++n : null,
        description: clean(l.description) ?? "Item",
        note,
        qty,
        uom: clean(l.uom),
        wastePct: l.waste ? Math.round(l.waste * 100) : null,
        unitPrice: minimum ? null : price,
        minimum,
        amount,
        optional: !l.include,
        ...(chargesHst(l, showHst) !== showHst ? { hst: showHst ? ("none" as const) : ("plus" as const) } : {}),
      });
    }
    if (lines.length) sections.push({ name: name === "Unsorted" ? "Other" : name, total: round2(total), lines });
  }
  if (fold !== 0) spread(sections, fold);
  const t = optionTotals(o.lines, discountRate, showHst);
  return {
    name: clean(o.name) ?? "Option",
    description: o.description?.trim() || null,
    recommended: o.recommended,
    sections,
    exclusions: o.lines.filter((l) => l.section === "Exclusions").flatMap((l) => clean(l.description) ?? []),
    totals: {
      preDiscount: t.preDiscount,
      discount: t.discount,
      subtotal: t.subtotal,
      hst: t.hst,
      total: t.total,
      payment1: t.payment1,
      payment2: t.payment2,
      paymentFinal: t.paymentFinal,
    },
  };
}

export function customerCopy(quote: Quote, at: { sentOn: string; validUntil: string; company: Letterhead; pricing?: CopyPricing }): CustomerCopy {
  const name = clean([quote.link?.firstName, quote.link?.lastName].filter(Boolean).join(" ")) ?? clean(quote.customerName);
  return {
    v: COPY_VERSION,
    quoteNumber: quote.link?.quoteNumber ?? quote.quoteId ?? "Quote",
    version: quote.version,
    basis: quote.basis,
    sentOn: at.sentOn,
    validUntil: at.validUntil,
    customer: { name, siteAddress: clean(quote.siteAddress), siteCity: clean(quote.siteCity) },
    ...(quote.link?.projectTiming ? { timing: quote.link.projectTiming } : {}),
    pricing: at.pricing ?? DEFAULT_PRICING,
    discountRate: quote.discountRate,
    showHst: quote.showHst,
    company: at.company,
    options: quote.options.map((o) => copyOption(o, quote.discountRate, quote.showHst)),
  };
}

/** Whether the page and PDF print each line's unit price and amount, and section subtotals. */
export const showsRates = (copy: Pick<CustomerCopy, "pricing">) => (copy.pricing ?? "rates") === "rates";

/** The HST row of an option's totals: a quote with HST off may still charge it on some materials. */
export function hstRow(copy: Pick<CustomerCopy, "showHst">, t: Pick<CopyTotals, "hst">): { label: string; amount: number | null } {
  if (copy.showHst) return { label: "HST (13%)", amount: t.hst };
  if (t.hst !== 0) return { label: "HST (13%) on materials", amount: t.hst };
  return { label: "HST", amount: null };
}

/** Under an option's total: what it includes. */
export const hstWord = (copy: Pick<CustomerCopy, "showHst">, t: Pick<CopyTotals, "hst">) =>
  copy.showHst ? "incl. HST" : t.hst !== 0 ? "incl. HST on materials" : "before HST";

/** The words a line carries when its HST differs from the quote's. */
export const itemHstNote = (l: Pick<CopyItem, "hst">) => (l.hst === "none" ? "no HST" : l.hst === "plus" ? "plus HST" : null);

/** Airtable long text holds 100,000 characters; a copy that won't fit is refused, never cut. */
export const COPY_MAX_CHARS = 95_000;

export function serializeCopy(copy: CustomerCopy): string {
  return JSON.stringify(copy);
}

/** Read a stored copy back. Anything that isn't a copy this code wrote reads as null. */
export function parseCopy(raw: string | null): CustomerCopy | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as CustomerCopy;
    if (c?.v !== COPY_VERSION || typeof c.quoteNumber !== "string" || !Array.isArray(c.options) || !c.company) return null;
    return c;
  } catch {
    return null;
  }
}

/* ---------- dates (Toronto) ---------- */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s: unknown): s is string => typeof s === "string" && ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Today in Toronto, YYYY-MM-DD. */
export function torontoToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "November 14, 2026". */
export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
}

/** A quote is good for 30 days unless staff choose otherwise (Albert, 2026-10-15). */
export const VALID_DAYS = 30;

/* ---------- what the customer link shows ---------- */

/**
 * What a customer opening the link should see, from the version's status today.
 * A version that was never sent is not shown at all, even if it has a token: a send that
 * failed half way must not leave a working link behind.
 */
export type CopyState = "open" | "expired" | "accepted" | "closed" | "replaced" | "hidden";

export function copyState(status: string | null, validUntil: string | null, today: string): CopyState {
  switch (status) {
    case "Sent":
      return validUntil && today > validUntil ? "expired" : "open";
    case "Accepted":
    case "Won":
      return "accepted";
    case "Lost":
    case "Expired":
      return "closed";
    case "Superseded":
      return "replaced";
    default:
      return "hidden";
  }
}

/** The PDF's file name, which is also the end of its link: GHL names the email attachment from it. */
export function pdfName(copy: Pick<CustomerCopy, "quoteNumber" | "version">): string {
  const q = copy.quoteNumber.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "Quote";
  return `Titan-Flooring-Quote-${q}${copy.version !== null ? `-v${copy.version}` : ""}.pdf`;
}
