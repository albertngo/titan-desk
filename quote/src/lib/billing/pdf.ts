import { quotePdf } from "@/lib/send/pdf";
import { billingTotals, type BillingSnapshot } from "./doc";

/** The invoice or receipt as a PDF, drawn from its frozen snapshot only: the staff download and the emailed file are the same. */
export function billingPdf(s: BillingSnapshot): Uint8Array<ArrayBuffer> {
  const t = billingTotals(s);
  return quotePdf(s.copy, null, {
    title: s.kind === "invoice" ? "INVOICE" : "RECEIPT",
    number: s.number,
    issuedOn: s.issuedOn,
    asOf: s.asOf,
    project: s.project,
    hstNumber: s.hstNumber,
    payments: s.payments,
    paid: t.paid,
    balance: t.balance,
    credit: t.credit,
  });
}
