import { DEFAULT_PRIVATE_LABEL, LUMP_QTY_SECTIONS, PRIVATE_SECTION, SECTIONS, chargesHst, isPriced, lineTotal, optionTotals, priceUsed, privateRollup, round2, sectionOf, stageAmounts } from "@/lib/calc";
import type { CopyChange } from "@/lib/change/diff";
import { defaultSchedule, payWords, type PayHow, type PaymentSchedule } from "@/lib/pricing/schedule";
import { optionScope } from "@/lib/quotes/scope";
import type { Quote, QuoteLine, QuoteOption, Scope } from "@/lib/quotes/types";
import { copyKind } from "./summary";

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
  /** An add-on the customer ticked when accepting (2026-10-27): now part of the work, at the price shown. Only on an accepted copy. */
  added?: boolean;
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

/**
 * One stage of the payment schedule as the customer was sent it (2026-10-27). `amount` is null on a
 * preliminary's range, where the final price isn't known: a share then says its percent, the balance
 * says "the balance", and a material deposit says it is for the material.
 */
export type CopyStage = { label: string; when: string; pay: PayHow; amount: number | null; pct: number | null; kind: "share" | "materials" | "amount" | "balance" };

/** A preliminary's price as a range (2026-10-27): whole dollars, before HST and with it. */
export type CopyRange = { low: number; high: number; lowWithHst: number; highWithHst: number };

export type CopyOption = {
  /** The Quote Options record it was made from (2026-10-27), so an acceptance can name it. Never shown. Absent on older copies. */
  ref?: string;
  name: string;
  description: string | null;
  recommended: boolean;
  sections: CopySection[];
  exclusions: string[];
  totals: CopyTotals;
  /** On a preliminary only (Albert, 2026-10-27): what the customer is shown instead of one price. Absent on a copy frozen before then. */
  range?: CopyRange;
  /** The payment schedule (2026-10-27). Absent on a copy frozen before then: 35 / 35 / balance from `totals`. */
  schedule?: CopyStage[];
  /** "Stairs" on a stairs option (2026-10-28); absent = Flooring, which every copy frozen before then is. */
  scope?: "Stairs";
};

export type Letterhead = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
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
  /**
   * Whether the quote page offers the PDF (Albert, 2026-10-27): the sender's tick on the Send card, off by
   * default. Off = no Download PDF button and the file's link answers 404. The PDF is never attached to
   * the email. Absent = offered, for copies frozen before the choice existed.
   */
  pdf?: boolean;
  showHst: boolean;
  company: Letterhead;
  /** The payment schedule it was sent with (2026-10-27), so ticked add-ons can be scheduled the same way. Absent = 35 / 35 / balance. */
  paymentSchedule?: PaymentSchedule;
  /**
   * A change after acceptance (2026-10-27): what changed since the contract it updates. Sent for the
   * customer's records; there is nothing to accept. Absent on every other copy.
   */
  change?: CopyChange;
  options: CopyOption[];
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim() || null;

/* ---------- a preliminary's range ---------- */

/**
 * A preliminary goes out as a range (Albert, 2026-10-27). Customers took a preliminary's one number
 * as the price, so a measured quote that came in higher read as a change. A measured quote rarely
 * comes in lower, and people read a range from its low end, so the calculated price sits just above
 * the bottom: 3% under it to 10% over it, the top never more than $3,000 over (a big job's range
 * would otherwise be too wide to mean anything), each end rounded outward to a round figure. It is
 * frozen on the copy like every other figure: a copy frozen before this has no range and keeps
 * showing its one price.
 */
export const RANGE_BELOW = 0.03;
export const RANGE_ABOVE = 0.1;
export const RANGE_ABOVE_CAP = 3000;

/** Round figures for a range's ends: $10 under $1,000, $50 under $10,000, $100 above. */
const rangeStep = (amount: number) => (amount < 1000 ? 10 : amount < 10000 ? 50 : 100);

/** Low rounded down and high rounded up; round2 first, so 1,000 × 1.1 is 1,100 and not a float a hair over it rounded up a step. */
const outward = (low: number, high: number, step: number) => ({ low: Math.max(0, Math.floor(round2(low) / step) * step), high: Math.ceil(round2(high) / step) * step });

export function priceRange(amount: number): { low: number; high: number } {
  return outward(amount * (1 - RANGE_BELOW), amount + Math.min(amount * RANGE_ABOVE, RANGE_ABOVE_CAP), rangeStep(amount));
}

/**
 * The range before HST from the price before HST; the range with HST is that range with the quote's
 * HST on it, so the two always agree (the cap applies to the price, not to the tax on it).
 */
export function copyRange(t: Pick<CopyTotals, "subtotal" | "total">): CopyRange {
  const before = priceRange(t.subtotal);
  const ratio = t.subtotal > 0 ? t.total / t.subtotal : 1;
  const after = outward(before.low * ratio, before.high * ratio, rangeStep(t.total));
  return { low: before.low, high: before.high, lowWithHst: after.low, highWithHst: after.high };
}

const whole = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** "$4,400": a range's ends are whole dollars. */
export const dollars = (n: number) => whole.format(n);

/** "$4,400 – $5,450". The text passes " to ": an en dash is not GSM-7 and would halve each segment. */
export function rangeText(low: number, high: number, sep = " – "): string {
  return `${dollars(low)}${sep}${dollars(high)}`;
}

/** A copy whose prices go as ranges: a preliminary frozen since 2026-10-27. */
export const isRange = (copy: Pick<CustomerCopy, "options">) => copy.options.some((o) => !!o.range);

/**
 * What the range means, in the same words on the page, the PDF and the email (Albert, 2026-10-27:
 * "it can be expected to be within this range"). It says where the price lands is decided at the
 * measure, never that it may come down: the range barely reaches below the price. A stairs-only
 * quote names stair things.
 */
export function rangeWhy(copy: Pick<CustomerCopy, "options">): string {
  const what = copyKind(copy) === "stairs" ? "the exact step count and the condition of the stairs" : "the exact square footage and the condition of the subfloor";
  return `Your final price can be expected to fall within the range below. What we confirm when we measure, like ${what}, decides where in it you land.`;
}

/** The preliminary note at the top of the page and the PDF. */
export const prelimNote = (copy: Pick<CustomerCopy, "options">) =>
  isRange(copy)
    ? `This is a preliminary estimate, based on what we know so far. ${rangeWhy(copy)} We confirm the final price once we have measured the space.`
    : "This is a preliminary estimate, based on what we know so far. We confirm the final price once we have measured the space.";

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

/** The schedule as the customer sees it: exact amounts, or on a range shares of the final price. */
function copyStages(schedule: PaymentSchedule, o: QuoteOption, discountRate: number, showHst: boolean, total: number, ranged: boolean): CopyStage[] {
  const stages = stageAmounts(schedule, o.lines, discountRate, showHst, total);
  return stages.map((s, i) => {
    const part = schedule.stages[i].part;
    return {
      label: s.label,
      when: s.when,
      pay: s.pay,
      amount: ranged ? null : s.amount,
      pct: ranged ? (part.kind === "share" ? part.pct : null) : s.pct,
      kind: s.kind,
    };
  });
}

/** "35%", "$4,898.00", "the balance": a stage's figure on the page, the PDF and the email. */
export function stageFigure(s: CopyStage, money: (n: number) => string): string {
  if (s.amount !== null) return money(s.amount);
  if (s.kind === "balance") return "The balance";
  if (s.kind === "materials") return "Your materials";
  return s.pct !== null ? `${s.pct}%` : "";
}

/** The line under a stage's name: when it is due, and how it is paid when that is said. */
export const stageNote = (s: Pick<CopyStage, "when" | "pay">) => [s.when, payWords(s.pay)].filter(Boolean).join(", ");

/** A copy frozen before schedules existed reads as the old 35 / 35 / balance, from its own totals. */
export function stagesOf(o: CopyOption): CopyStage[] {
  if (o.schedule?.length) return o.schedule;
  const t = o.totals;
  const share = (part: number) => (t.total > 0 ? Math.round((part / t.total) * 100) : 35);
  const range = Boolean(o.range);
  return [
    { label: "Deposit", when: "", pay: null, amount: range ? null : t.payment1, pct: range ? 35 : share(t.payment1), kind: "share" },
    { label: "Second payment", when: "", pay: null, amount: range ? null : t.payment2, pct: range ? 35 : share(t.payment2), kind: "share" },
    { label: "Final payment", when: "", pay: null, amount: range ? null : t.paymentFinal, pct: null, kind: "balance" },
  ];
}

function copyOption(o: QuoteOption, discountRate: number, showHst: boolean, lumpSum = false, ranged = false, schedule: PaymentSchedule = defaultSchedule()): CopyOption {
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
    ref: o.id,
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
    // A preliminary is shown as a range (2026-10-27); the totals stay exact underneath for the record.
    ...(ranged && t.subtotal > 0 ? { range: copyRange(t) } : {}),
    schedule: copyStages(schedule, o, discountRate, showHst, t.total, ranged && t.subtotal > 0),
    ...(optionScope(o) === "Stairs" ? { scope: "Stairs" as const } : {}),
  };
}

/* ---------- scopes (2026-10-28) ---------- */

/** The scope a frozen option counts as. */
export const scopeOf = (o: Pick<CopyOption, "scope">): Scope => (o.scope === "Stairs" ? "Stairs" : "Flooring");

/** The scopes a copy offers, flooring first. */
export const scopesOf = (copy: Pick<CustomerCopy, "options">): Scope[] => (["Flooring", "Stairs"] as Scope[]).filter((s) => copy.options.some((o) => scopeOf(o) === s));

/** A copy with both flooring and stairs options: the customer takes up to one of each, and the page groups them. */
export const isSplit = (copy: Pick<CustomerCopy, "options">) => scopesOf(copy).length > 1;

/**
 * Each scope's price on its own (Albert, 2026-10-28: "The preliminary price should show separately for
 * each scope"), for the email and the text: one option's range or price, or the lowest of several as
 * "from". `phrase` is "$5,800 – $6,600 + HST" or "from $2,100 + HST"; the text passes " to ".
 */
export function scopeLeads(copy: Pick<CustomerCopy, "options" | "showHst">, money: (n: number) => string, sep = " – "): { scope: Scope; count: number; phrase: string }[] {
  return scopesOf(copy).map((scope) => {
    const mine = copy.options.filter((o) => scopeOf(o) === scope);
    const leads = mine.map((o) => leadPrice(copy, o.totals));
    const tag = leads[0].tag;
    if (mine.length === 1) return { scope, count: 1, phrase: `${mine[0].range ? rangeText(mine[0].range.low, mine[0].range.high, sep) : money(leads[0].amount)} ${tag}` };
    const low = Math.min(...mine.map((o, i) => o.range?.low ?? leads[i].amount));
    return { scope, count: mine.length, phrase: `from ${mine.some((o) => o.range) ? dollars(low) : money(low)} ${tag}` };
  });
}

/** "Flooring options", "Stairs option": the heading over a scope's options. */
export const scopeHeading = (scope: Scope, count: number) => `${scope} option${count === 1 ? "" : "s"}`;

/**
 * `at.range`: false when the sender chose the exact price for a preliminary instead of its range
 * (Albert, 2026-10-27: "an option to give the customer no range and just the quote, but default is
 * always the range"). Absent = the range. A measured quote never has one.
 */
export function customerCopy(quote: Quote, at: { sentOn: string; validUntil: string | null; company: Letterhead; range?: boolean; pdf?: boolean }): CustomerCopy {
  const prelim = quote.basis === "Preliminary";
  // A preliminary is always a lump sum (Albert, 2026-10-27): its line prices would add up to the one
  // price inside the range. Only a measured quote can go with the breakdown.
  const lump = prelim || quote.itemised !== true;
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
    pricing: lump ? "lump" : "itemised",
    pdf: at.pdf === true,
    showHst: quote.showHst,
    company: at.company,
    ...(quote.schedule ? { paymentSchedule: quote.schedule } : {}),
    // Flooring options first, then stairs (2026-10-28), so each scope reads as one group; order within a scope is kept.
    options: [...quote.options]
      .sort((a, b) => (optionScope(a) === optionScope(b) ? 0 : optionScope(a) === "Flooring" ? -1 : 1))
      .map((o) => copyOption(o, quote.discountRate, quote.showHst, lump, prelim && at.range !== false, quote.schedule ?? defaultSchedule())),
  };
}

/** The HST row of an option's totals: a quote with HST off may still charge it on some materials. */
export function hstRow(copy: Pick<CustomerCopy, "showHst">, t: Pick<CopyTotals, "hst">): { label: string; amount: number | null } {
  if (copy.showHst) return { label: "HST (13%)", amount: t.hst };
  if (t.hst !== 0) return { label: "HST (13%) on materials", amount: t.hst };
  return { label: "HST", amount: null };
}

/** The quote page offers the PDF: ticked when sent, or frozen before the choice existed (2026-10-27). */
export const offersPdf = (copy: Pick<CustomerCopy, "pdf">) => copy.pdf !== false;

/** A lump-sum copy: descriptions, then the price. A copy with no `pricing` was frozen before the choice existed and is itemised. */
export const isLump = (copy: Pick<CustomerCopy, "pricing">) => copy.pricing === "lump";

/** The Discount row's label: the rate, and the reason when one was given ("Discount (10%) · Fall promotion"). */
export const discountLabel = (copy: Pick<CustomerCopy, "discountRate" | "discountReason">) =>
  `Discount (${Math.round(copy.discountRate * 1000) / 10}%)${copy.discountReason ? ` · ${copy.discountReason}` : ""}`;

/** Under an option's total: what it includes. */
export const hstWord = (copy: Pick<CustomerCopy, "showHst">, t: Pick<CopyTotals, "hst">) =>
  copy.showHst ? "incl. HST" : t.hst !== 0 ? "incl. HST on materials" : "before HST";

/**
 * The price the email and the text lead with (Albert, 2026-10-24): before HST, with "+ HST" after it,
 * the way contractors quote and customers compare. HST charged only on materials says so; a quote
 * that charges no HST at all says "before HST", as everywhere else. The customer page and PDF keep
 * their own totals block (hstWord / hstRow).
 */
export function leadPrice(copy: Pick<CustomerCopy, "showHst">, t: Pick<CopyTotals, "subtotal" | "hst" | "total">): { amount: number; tag: string; addsHst: boolean } {
  if (copy.showHst) return { amount: t.subtotal, tag: "+ HST", addsHst: true };
  if (t.hst !== 0) return { amount: t.subtotal, tag: "+ HST on materials", addsHst: true };
  return { amount: t.subtotal, tag: "before HST", addsHst: false };
}

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

/** The stamped accepted PDF's name (2026-10-27), served beside the quote's own on the same link. */
export const acceptedPdfName = (copy: Pick<CustomerCopy, "quoteNumber" | "version">) => pdfName(copy).replace(/\.pdf$/, "-accepted.pdf");
