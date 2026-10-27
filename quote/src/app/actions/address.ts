"use server";

import { scanAddresses } from "@/lib/quotes/address";
import type { AddressScanResult } from "@/lib/quotes/types";

/** Address arrived (2026-10-27): the quote list and a quote page ask once they have drawn. Checks the quoter allowlist inside. */
export async function scanAddressesAction(quoteRecordId: string | null = null): Promise<AddressScanResult> {
  return scanAddresses(quoteRecordId === null ? null : String(quoteRecordId));
}
