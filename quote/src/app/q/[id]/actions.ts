"use server";

import { confirmAddress, createOpportunity, linkToJob } from "@/lib/quotes/link";
import { saveRooms } from "@/lib/quotes/rooms";
import { sendQuote } from "@/lib/quotes/send";
import type { ConfirmAddressResult, LinkJobResult, SaveRoomsResult, SendResult } from "@/lib/quotes/types";

/** Server actions for the quote page. Each checks the quoter allowlist inside. */

export async function linkToJobAction(quoteRecordId: string, opportunityId: string): Promise<LinkJobResult> {
  return linkToJob(String(quoteRecordId ?? ""), String(opportunityId ?? ""));
}

export async function createOpportunityAction(quoteRecordId: string): Promise<LinkJobResult> {
  return createOpportunity(String(quoteRecordId ?? ""));
}

export async function confirmAddressAction(quoteRecordId: string, shown: string): Promise<ConfirmAddressResult> {
  return confirmAddress(String(quoteRecordId ?? ""), String(shown ?? ""));
}

export async function sendQuoteAction(versionId: string, input: unknown): Promise<SendResult> {
  return sendQuote(String(versionId ?? ""), input);
}

export async function saveRoomsAction(quoteRecordId: string, seen: string, rooms: unknown): Promise<SaveRoomsResult> {
  return saveRooms(String(quoteRecordId ?? ""), String(seen ?? ""), rooms);
}
