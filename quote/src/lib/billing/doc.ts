import { round2 } from "@/lib/calc";
import type { CustomerCopy } from "@/lib/send/copy";

/**
 * Invoices and receipts (Albert, 2026-10-30). One numbered document per won project, for the customer:
 *
 * - an **invoice** (INV-82571, INV-82572…) when the contract charges HST on every line;
 * - a **receipt** (R-10245, R-10246…) when it charges HST on part of it (the floor material) or on none.
 *
 * Both show the contract as accepted (or as last changed), HST as charged, every payment received so far from
 * Notion's Master Payments Log, and the balance owing. Exporting again keeps the number and shows newer payments.
 * They are customer documents only: Lightspeed stays the sale of record and the A/R, and nothing here posts to
 * QuickBooks or Lightspeed. Pure; tested in tests/billing.test.ts.
 */

export type BillingKind = "invoice" | "receipt";

/** One payment as it goes on the document. Who sent it, their message and staff notes are never read. */
export type Payment = { date: string | null; amount: number; method: string | null; reference: string | null };

/** The document as last exported, frozen on its Invoices / Receipts row; the customer's PDF is drawn from it. */
export type BillingSnapshot = {
  v: 1;
  kind: BillingKind;
  number: string;
  /** YYYY-MM-DD, Toronto: the day the number was issued. */
  issuedOn: string;
  /** YYYY-MM-DD: the day the payments were read. */
  asOf: string;
  copy: CustomerCopy;
  payments: Payment[];
  hstNumber: string | null;
  /** The project number once won (PP-509), else null. */
  project: string | null;
};

/**
 * Invoice or receipt: an invoice only when the quote's Charge HST is on and no included line is marked as
 * carrying none (a material ticked No HST). Anything less is a receipt.
 */
export function billingKind(copy: Pick<CustomerCopy, "showHst" | "options">): BillingKind {
  if (!copy.showHst) return "receipt";
  const untaxed = copy.options.some((o) => o.sections.some((s) => s.lines.some((l) => l.kind === "item" && !l.optional && l.hst === "none")));
  return untaxed ? "receipt" : "invoice";
}

/** Why it is the one it is, for staff. */
export const kindReason = (k: BillingKind, copy: Pick<CustomerCopy, "showHst">) =>
  k === "invoice" ? "HST is charged on every line." : copy.showHst ? "Some lines carry no HST." : "HST is charged on the materials only, or not at all.";

export const kindTitle = (k: BillingKind) => (k === "invoice" ? "Invoice" : "Receipt");

/** The number as Airtable's formula makes it: INV-82571, R-10245. Anything else is refused. */
export const isBillingNumber = (k: BillingKind, n: unknown): n is string => typeof n === "string" && (k === "invoice" ? /^INV-\d{3,9}$/ : /^R-\d{3,9}$/).test(n);

/** The file name: Invoice-INV-82571.pdf, Receipt-R-10245.pdf. */
export const billingFile = (k: BillingKind, number: string) => `${kindTitle(k)}-${number}.pdf`;
export const BILLING_FILE = /^(Invoice-INV-\d{3,9}|Receipt-R-\d{3,9})\.pdf$/;

/**
 * The contract the document is for, from the contract's joined copy (src/lib/contract/model.ts: the picks joined,
 * ticked add-ons added; after a change, that change's option). The "what changed" box belongs to the change email, not the invoice, and an optional
 * add-on that wasn't taken is left off.
 */
export function contractCopy(c: CustomerCopy): CustomerCopy {
  const { change: _change, ...rest } = c;
  void _change;
  // An add-on nobody took isn't on an invoice: acceptance already drops those, a change's copy can still carry one.
  const options = c.options.slice(0, 1).map((o) => ({
    ...o,
    sections: o.sections.map((sec) => ({ ...sec, lines: sec.lines.filter((l) => l.kind !== "item" || !l.optional) })).filter((sec) => sec.lines.some((l) => l.kind === "item")),
  }));
  return { ...rest, options };
}

/** What was paid and what is left. An overpayment shows as a credit, never a negative balance. */
export function billingTotals(s: Pick<BillingSnapshot, "copy" | "payments">): { total: number; paid: number; balance: number; credit: number } {
  const total = s.copy.options[0]?.totals.total ?? 0;
  const paid = round2(s.payments.reduce((a, p) => a + p.amount, 0));
  const left = round2(total - paid);
  return { total, paid, balance: Math.max(0, left), credit: Math.max(0, -left) };
}

/** Payments in date order, undated last; amounts of zero or less are dropped (a refund is a person's call). */
export function cleanPayments(rows: Payment[]): Payment[] {
  return rows
    .filter((p) => Number.isFinite(p.amount) && p.amount > 0)
    .map((p) => ({ ...p, amount: round2(p.amount) }))
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}

export function serializeSnapshot(s: BillingSnapshot): string {
  return JSON.stringify(s);
}

export function parseSnapshot(raw: string | null | undefined): BillingSnapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as BillingSnapshot;
    if (s?.v !== 1 || (s.kind !== "invoice" && s.kind !== "receipt") || !isBillingNumber(s.kind, s.number) || !s.copy?.options?.length || !Array.isArray(s.payments)) return null;
    return s;
  } catch {
    return null;
  }
}

/** One line for the row's Log and the version's Edit Log. */
export const billingLogWhat = (s: Pick<BillingSnapshot, "kind" | "number" | "payments">, did: "exported" | "emailed") =>
  `${s.kind} ${s.number} ${did}, ${s.payments.length} payment${s.payments.length === 1 ? "" : "s"}`;
