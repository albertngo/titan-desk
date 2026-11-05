"use server";

import { quickFormForBrowser, quickOption, type QuickOptionResult } from "@/lib/quotes/quickOption";
import { autosaveVersion, saveAsNewVersion, saveVersion, type AutosaveResult, type SaveResult } from "@/lib/quotes/save";

/** Server actions for the editor. Each checks the quoter allowlist inside. Quote pages are dynamic, so nothing needs revalidating. */

export async function saveVersionAction(versionId: string, quote: unknown, base: string): Promise<SaveResult> {
  return saveVersion(String(versionId ?? ""), quote, String(base ?? ""));
}

/** Autosave (2026-11-05): a Draft saved in place while it is edited, then read back for the editor. */
export async function autosaveVersionAction(versionId: string, quote: unknown, base: string): Promise<AutosaveResult> {
  return autosaveVersion(String(versionId ?? ""), quote, String(base ?? ""));
}

export async function saveAsNewVersionAction(versionId: string, quote: unknown, basis: string): Promise<SaveResult> {
  return saveAsNewVersion(String(versionId ?? ""), quote, String(basis ?? ""));
}

/** "+ From quick form" (2026-10-31): the form's choices, opened on demand so the editor never waits for them. */
export async function quickFormAction() {
  return quickFormForBrowser();
}

/** One option priced from the quick form, for the editor to add to its unsaved changes. Writes nothing. */
export async function quickOptionAction(work: unknown, taken: unknown): Promise<QuickOptionResult> {
  return quickOption(work, taken);
}
