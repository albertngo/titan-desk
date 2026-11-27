"use server";

import { requestPayment, type RequestInput, type RequestResult } from "@/lib/quotes/paymentRequest";

/** Request payment on All quotes (2026-11-27). The amount is worked out on the server; checks the quoter inside. */
export async function requestPaymentAction(versionId: string, input: RequestInput): Promise<RequestResult> {
  if (typeof versionId !== "string" || !versionId) return { ok: false, message: "No quote." };
  return requestPayment(versionId, input).catch((e) => {
    console.error("requestPaymentAction", e);
    return { ok: false as const, message: "The request couldn't be sent. Try again in a moment." };
  });
}
