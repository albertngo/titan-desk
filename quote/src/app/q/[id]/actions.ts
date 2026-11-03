"use server";

import { acceptForCustomer, cancelAcceptance, retryHandoff, type CancelResult, type StaffAcceptResult } from "@/lib/accept/staff";
import { confirmAddress, createJobForQuote, linkToJob } from "@/lib/quotes/link";
import { makeChange, type SaveResult } from "@/lib/quotes/save";
import { saveRooms } from "@/lib/quotes/rooms";
import { saveDescription } from "@/lib/quotes/describe";
import { saveFloorSheet, saveSiteSheet, sheetCamPhotos } from "@/lib/quotes/sitesheet";
import { floorOptions, type FloorOptionsResult } from "@/lib/quotes/quickOption";
import { resendQuote, sendQuote } from "@/lib/quotes/send";
import { emailBilling, issueBilling, type BillingChoice, type BillingResult } from "@/lib/quotes/billing";
import type { CamSheetPhotosResult, ConfirmAddressResult, LinkJobResult, ResendResult, SaveDescriptionResult, SaveRoomsResult, SendResult, SiteSheetResult } from "@/lib/quotes/types";

/** Server actions for the quote page. Each checks the quoter allowlist inside. */

export async function linkToJobAction(quoteRecordId: string, opportunityId: string): Promise<LinkJobResult> {
  return linkToJob(String(quoteRecordId ?? ""), String(opportunityId ?? ""));
}

export async function createJobAction(quoteRecordId: string, pick: { pipelineId: string; stageId: string }): Promise<LinkJobResult> {
  return createJobForQuote(String(quoteRecordId ?? ""), pick);
}

export async function confirmAddressAction(quoteRecordId: string, shown: string): Promise<ConfirmAddressResult> {
  return confirmAddress(String(quoteRecordId ?? ""), String(shown ?? ""));
}

export async function sendQuoteAction(versionId: string, input: unknown): Promise<SendResult> {
  return sendQuote(String(versionId ?? ""), input);
}

export async function resendQuoteAction(versionId: string, input: unknown): Promise<ResendResult> {
  return resendQuote(String(versionId ?? ""), input);
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

/** The quote's description (2026-11-03): a staff-only label shown under the customer on All quotes. */
export async function saveDescriptionAction(quoteRecordId: string, seen: string, description: string): Promise<SaveDescriptionResult> {
  return saveDescription(String(quoteRecordId ?? ""), String(seen ?? ""), String(description ?? ""));
}

/** The Site sheet tab's Save check (2026-10-28): the fields as a person corrected them. */
export async function saveSiteSheetAction(quoteRecordId: string, seen: string, sheet: unknown, checked: boolean = true): Promise<SiteSheetResult> {
  return saveSiteSheet(String(quoteRecordId ?? ""), String(seen ?? ""), sheet, checked !== false);
}

/* Invoices and receipts (2026-10-30). */

/** The job's CompanyCam photos for picking the site sheet (2026-11-03). The quote's own link is read in Airtable. */
export async function camSheetPhotosAction(quoteRecordId: string): Promise<CamSheetPhotosResult> {
  return sheetCamPhotos(String(quoteRecordId ?? ""));
}

export async function saveFloorSheetAction(quoteRecordId: string, seen: string, sheet: unknown, checked: boolean = true): Promise<SiteSheetResult> {
  return saveFloorSheet(String(quoteRecordId ?? ""), String(seen ?? ""), sheet, checked !== false);
}

/** The checked flooring sheet priced into options for the editor's draft (2026-11-03). Writes nothing. */
export async function floorOptionsAction(sheet: unknown, taken: unknown): Promise<FloorOptionsResult> {
  return floorOptions(sheet, taken);
}

export async function issueBillingAction(versionId: string, choice: BillingChoice): Promise<BillingResult> {
  return issueBilling(String(versionId ?? ""), { showCredit: choice?.showCredit === true });
}

export async function emailBillingAction(versionId: string, choice: BillingChoice): Promise<BillingResult> {
  return emailBilling(String(versionId ?? ""), { showCredit: choice?.showCredit === true });
}
