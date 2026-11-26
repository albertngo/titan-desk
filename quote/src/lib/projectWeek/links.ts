import "server-only";
import { notionPayout } from "@/lib/notion/payoutApi";
import type { Job } from "./model";
import { PROJECT } from "./rows";

/**
 * Filling a project's links from its quote (Albert, 2026-11-25: "If it locates the companycam link, can it add it to the
 * Notion field if it is empty? The link should match to the quote app one", and "is the quote link in notion supposed to
 * be the link to the app? Not the folder"). The only Titan Projects write: CompanyCam Link when it is empty, and Quote
 * Link when it is empty or isn't the app's page (an old OneDrive folder). Never anything else, never another value over
 * an app link or a CompanyCam link already there. Pure planning in `linkUpdates`, the write in `fillProjectLinks`.
 */

export type LinkFacts = { camUrl: string | null; quoteLink?: string | null };

export function linkUpdates(job: Pick<Job, "camUrl" | "quoteLink">, facts: LinkFacts | undefined, appBase: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!facts) return out;
  if (!job.camUrl?.trim() && facts.camUrl) out[PROJECT.camUrl] = facts.camUrl;
  const isApp = Boolean(appBase && job.quoteLink?.startsWith(`${appBase}/q/`));
  if (facts.quoteLink && !isApp && job.quoteLink !== facts.quoteLink) out[PROJECT.quoteLink] = facts.quoteLink;
  return out;
}

export async function fillProjectLinks(jobId: string, updates: Record<string, string>): Promise<boolean> {
  if (!Object.keys(updates).length) return false;
  const properties = Object.fromEntries(Object.entries(updates).map(([k, v]) => [k, { url: v }]));
  await notionPayout("PATCH", `/pages/${jobId}`, { properties });
  return true;
}
