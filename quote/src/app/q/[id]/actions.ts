"use server";

import { linkToJob } from "@/lib/quotes/link";
import type { LinkJobResult } from "@/lib/quotes/types";

/** Server action for the quote page. It checks the quoter allowlist inside. */

export async function linkToJobAction(quoteRecordId: string, opportunityId: string): Promise<LinkJobResult> {
  return linkToJob(String(quoteRecordId ?? ""), String(opportunityId ?? ""));
}
