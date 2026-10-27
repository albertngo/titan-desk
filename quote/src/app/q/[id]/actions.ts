"use server";

import { acceptForCustomer, cancelAcceptance, retryHandoff, type CancelResult, type StaffAcceptResult } from "@/lib/accept/staff";
import { confirmAddress, linkToJob } from "@/lib/quotes/link";
import { makeChange, type SaveResult } from "@/lib/quotes/save";
import { saveRooms } from "@/lib/quotes/rooms";
import { sendQuote } from "@/lib/quotes/send";
import type { ConfirmAddressResult, LinkJobResult, SaveRoomsResult, SendResult } from "@/lib/quotes/types";

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

/** Make a change after acceptance (2026-10-27): a new version, from the contract as it stands, opened in the editor. */
export async function makeChangeAction(versionId: string): Promise<SaveResult> {
  return makeChange(String(versionId ?? ""));
}

export async function saveRoomsAction(quoteRecordId: string, seen: string, rooms: unknown): Promise<SaveRoomsResult> {
  return saveRooms(String(quoteRecordId ?? ""), String(seen ?? ""), rooms);
}
