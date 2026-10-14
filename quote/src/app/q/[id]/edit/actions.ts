"use server";

import { saveAsNewVersion, saveVersion, type SaveResult } from "@/lib/quotes/save";

/** Server actions for the editor. Both check the quoter allowlist inside. Quote pages are dynamic, so nothing needs revalidating. */

export async function saveVersionAction(versionId: string, quote: unknown, base: string): Promise<SaveResult> {
  return saveVersion(String(versionId ?? ""), quote, String(base ?? ""));
}

export async function saveAsNewVersionAction(versionId: string, quote: unknown, basis: string): Promise<SaveResult> {
  return saveAsNewVersion(String(versionId ?? ""), quote, String(basis ?? ""));
}
