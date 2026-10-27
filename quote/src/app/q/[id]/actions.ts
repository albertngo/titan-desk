"use server";

import { acceptForCustomer, cancelAcceptance, retryHandoff, type CancelResult, type StaffAcceptResult } from "@/lib/accept/staff";
import { confirmAddress, linkToJob } from "@/lib/quotes/link";
import { sendQuote } from "@/lib/quotes/send";
import type { ConfirmAddressResult, LinkJobResult, SendResult } from "@/lib/quotes/types";

/** Server actions for the quote page. Each checks the quoter allowlist inside. */

export async function linkToJobAction(quoteRecordId: string, opportunityId: string): Promise<LinkJobResult> {
  return linkToJob(String(quoteRecordId ?? ""), String(opportunityId ?? ""));
}

export async function confirmAddressAction(quoteRecordId: string, shown: string): Promise<ConfirmAddressResult> {
  return confirmAddress(String(quoteRecordId ?? ""), String(shown ?? ""));
}

export async function sendQuoteAction(versionId: string, input: unknown): Promise<SendResult> {
  return sendQuote(String(versionId ?? ""), input);
}

/* Acceptance (2026-10-27): on the customer's behalf, retrying the hand-off, cancelling. */

export async function acceptForCustomerAction(versionId: string, input: unknown): Promise<StaffAcceptResult> {
  return acceptForCustomer(String(versionId ?? ""), input);
}

export async function retryHandoffAction(versionId: string): Promise<StaffAcceptResult> {
  return retryHandoff(String(versionId ?? ""));
}

export async function cancelAcceptanceAction(versionId: string, reason: string): Promise<CancelResult> {
  return cancelAcceptance(String(versionId ?? ""), String(reason ?? ""));
}
