"use server";

import { requestPayment, type RequestInput, type RequestResult } from "@/lib/quotes/paymentRequest";
import { officeEmail, sendAsForCard } from "@/lib/quotes/send";

/** Request payment on All quotes (2026-11-27). The amount is worked out on the server; checks the quoter inside. */
export async function requestPaymentAction(versionId: string, input: RequestInput): Promise<RequestResult> {
  if (typeof versionId !== "string" || !versionId) return { ok: false, message: "No quote." };
  return requestPayment(versionId, input).catch((e) => {
    console.error("requestPaymentAction", e);
    return { ok: false as const, message: "The request couldn't be sent. Try again in a moment." };
  });
}

/** Who a payment request may go out as (2026-11-27): the office first and by default, then the Send card's people. */
export type PaymentSendAs = { office: string | null; people: { email: string; label: string }[] };

export async function paymentSendAsAction(): Promise<PaymentSendAs> {
  const [card, office] = await Promise.all([sendAsForCard(null), Promise.resolve(officeEmail())]).catch(() => [null, officeEmail()] as const);
  return { office, people: card ? card.choices.map((c) => ({ email: c.email, label: c.label })) : [] };
}
