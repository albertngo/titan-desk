import { DEFAULT_PRIVATE_LABEL, LUMP_QTY_SECTIONS, PRIVATE_SECTION, SECTIONS, chargesHst, isPriced, lineTotal, optionTotals, priceUsed, privateRollup, round2, sectionOf } from "@/lib/calc";
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
  /** Null when a minimum charge sets the amount instead, or on a lump-sum quote. */
  unitPrice: number | null;
  minimum: boolean;
  /** Null on a lump-sum quote (2026-10-22) for a counted line: the customer gets one price. An add-on keeps its price. */
  amount: number | null;
  /** An add-on the customer can choose: priced, not in the total. */
  optional: boolean;
  /**
   * Only where a material's HST differs from the rest of the quote (2026-10-16): "none" = no HST on
   * it while the quote charges HST; "plus" = HST on it while the quote does not. Absent otherwise.
   */
  hst?: "none" | "plus";
};
export type CopyText = { kind: "text"; text: string; note: string | null };
/** `total` is null on a lump-sum quote. */
export type CopySection = { name: string; total: number | null; lines: (CopyItem | CopyText)[] };

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
  /** The logo in the email's header band (2026-10-22), an https URL; absent = the company name set as a wordmark. */
  logoUrl?: string | null;
};

export type CustomerCopy = {
  v: typeof COPY_VERSION;
  quoteNumber: string;
  version: number | null;
  basis: string | null;
  /** YYYY-MM-DD, Toronto. */
  sentOn: string;
  /** YYYY-MM-DD; null on a preliminary (Albert, 2026-10-22): an estimate has no good-until date and its link never expires. */
  validUntil: string | null;
  customer: { name: string | null; siteAddress: string | null; siteCity: string | null };
  /** "When are they planning to do the project?" as answered (2026-10-18); absent on older copies. */
  timing?: string | null;
  /** Fraction, e.g. 0.11. */
  discountRate: number;
  /** Why, in the customer's words, beside the Discount row (2026-10-22); absent when none was given. */
  discountReason?: string;
  /**
   * How the price is shown (2026-10-22). "lump", the default for every version since that day: the
   * customer sees what the work includes and one price for the project; counted lines carry no
   * unit price or amount, quantities stay on the scope sections only, sections carry no total,
   * there are no discount rows, add-ons keep their price. "itemised": everything. Absent = itemised,
   * for copies frozen before this existed.
   */
  pricing?: "lump" | "itemised";
  showHst: boolean;
  company: Letterhead;
  options: CopyOption[];
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim() || null;

/** Priced sections in work order, as the quote page shows them; exclusions are listed separately. */
function sectionNames(lines: QuoteLine[]): string[] {
  const present = new Set(lines.filter((l) => isPriced(l) || l.lineType === "Note" || l.lineType === "Section").map(sectionOf));
  present.delete("Exclusions");
  // Private lines are never itemised: they roll up into one row in Other (copyOption, below).
  present.delete(PRIVATE_SECTION);
  const out: string[] = SECTIONS.filter((s) => present.has(s));
  if (present.has("Unsorted")) out.push("Unsorted");
  return out;
}

function copyOption(o: QuoteOption, discountRate: number, showHst: boolean, lumpSum = false): CopyOption {
  let n = 0;
  const sections: CopySection[] = [];
  for (const name of sectionNames(o.lines)) {
    const lines: (CopyItem | CopyText)[] = [];
    let total = 0;
    for (const l of o.lines.filter((x) => sectionOf(x) === name)) {
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
      // Lump sum: a counted line shows what it is, never what it costs; how much only for the scope sections. An add-on must still say its price.
      const lump = lumpSum && l.include;
      const showQty = !lump || LUMP_QTY_SECTIONS.has(name);
      lines.push({
        kind: "item",
        n: l.include ? ++n : null,
        description: clean(l.description) ?? "Item",
        note,
        qty: showQty ? qty : null,
        uom: showQty ? clean(l.uom) : null,
        wastePct: showQty && l.waste ? Math.round(l.waste * 100) : null,
        unitPrice: minimum || lump ? null : price,
        minimum: lump ? false : minimum,
        amount: lump ? null : amount,
        optional: !l.include,
        ...(chargesHst(l, showHst) !== showHst ? { hst: showHst ? ("none" as const) : ("plus" as const) } : {}),
      });
    }
    if (lines.length) sections.push({ name: name === "Unsorted" ? "Other" : name, total: lumpSum ? null : round2(total), lines });
  }
  // The Private section as the customer sees it (2026-10-22): one row in Other, the option's name for it, the total, nothing else.
  // On a lump sum there is no row at all (Albert, 2026-10-22): the amount is already inside the one price.
  const hidden = lumpSum ? 0 : privateRollup(o.lines);
  if (hidden > 0) {
    let other = sections.find((s) => s.name === "Other");
    if (!other) {
      other = { name: "Other", total: lumpSum ? null : 0, lines: [] };
      sections.push(other);
    }
    other.lines.push({ kind: "item", n: ++n, description: clean(o.privateLabel) ?? DEFAULT_PRIVATE_LABEL, note: null, qty: null, uom: null, wastePct: null, unitPrice: null, minimum: false, amount: lumpSum ? null : hidden, optional: false });
    if (other.total !== null) other.total = round2(other.total + hidden);
  }
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

export function customerCopy(quote: Quote, at: { sentOn: string; validUntil: string | null; company: Letterhead }): CustomerCopy {
  const name = clean([quote.link?.firstName, quote.link?.lastName].filter(Boolean).join(" ")) ?? clean(quote.customerName);
  return {
    v: COPY_VERSION,
    quoteNumber: quote.link?.quoteNumber ?? quote.quoteId ?? "Quote",
    version: quote.version,
    basis: quote.basis,
    sentOn: at.sentOn,
    validUntil: quote.basis === "Preliminary" ? null : at.validUntil,
    customer: { name, siteAddress: clean(quote.siteAddress), siteCity: clean(quote.siteCity) },
    ...(quote.link?.projectTiming ? { timing: quote.link.projectTiming } : {}),
    discountRate: quote.discountRate,
    ...(clean(quote.discountReason) ? { discountReason: clean(quote.discountReason)! } : {}),
    pricing: quote.itemised === true ? "itemised" : "lump",
    showHst: quote.showHst,
    company: at.company,
    options: quote.options.map((o) => copyOption(o, quote.discountRate, quote.showHst, quote.itemised !== true)),
  };
}

/** The HST row of an option's totals: a quote with HST off may still charge it on some materials. */
export function hstRow(copy: Pick<CustomerCopy, "showHst">, t: Pick<CopyTotals, "hst">): { label: string; amount: number | null } {
  if (copy.showHst) return { label: "HST (13%)", amount: t.hst };
  if (t.hst !== 0) return { label: "HST (13%) on materials", amount: t.hst };
  return { label: "HST", amount: null };
}

/** A lump-sum copy: descriptions, then the price. A copy with no `pricing` was frozen before the choice existed and is itemised. */
export const isLump = (copy: Pick<CustomerCopy, "pricing">) => copy.pricing === "lump";

/** The Discount row's label: the rate, and the reason when one was given ("Discount (10%) · Fall promotion"). */
export const discountLabel = (copy: Pick<CustomerCopy, "discountRate" | "discountReason">) =>
  `Discount (${Math.round(copy.discountRate * 1000) / 10}%)${copy.discountReason ? ` · ${copy.discountReason}` : ""}`;

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
