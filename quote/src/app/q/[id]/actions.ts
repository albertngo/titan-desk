"use server";

import { confirmAddress, editAddress, linkToJob } from "@/lib/quotes/link";
import { sendQuote } from "@/lib/quotes/send";
import type { ConfirmAddressResult, EditAddressResult, LinkJobResult, SendResult } from "@/lib/quotes/types";

/** Server actions for the quote page. Each checks the quoter allowlist inside. */

export async function linkToJobAction(quoteRecordId: string, opportunityId: string): Promise<LinkJobResult> {
  return linkToJob(String(quoteRecordId ?? ""), String(opportunityId ?? ""));
}

export async function confirmAddressAction(quoteRecordId: string, shown: string): Promise<ConfirmAddressResult> {
  return confirmAddress(String(quoteRecordId ?? ""), String(shown ?? ""));
}

export async function editAddressAction(quoteRecordId: string, shown: unknown, next: unknown): Promise<EditAddressResult> {
  return editAddress(String(quoteRecordId ?? ""), shown, next);
}

export async function sendQuoteAction(versionId: string, input: unknown): Promise<SendResult> {
  return sendQuote(String(versionId ?? ""), input);
}
