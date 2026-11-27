"use server";

import { coPicks, quickChange, type CoPick, type QuickChangeInput, type QuickChangeResult } from "@/lib/quotes/quickChange";

/** +C/O (2026-11-27): add lines to the project's change, saved as a draft to review and send. Checks the quoter inside. */
export async function quickChangeAction(versionId: string, input: QuickChangeInput): Promise<QuickChangeResult> {
  if (typeof versionId !== "string" || !versionId) return { ok: false, message: "No quote." };
  return quickChange(versionId, input).catch((e) => {
    console.error("quickChangeAction", e);
    return { ok: false as const, message: "The C/O couldn't be saved. Try again, or use the full editor." };
  });
}

/** The Rate Card rows and Stair Items the +C/O card offers. */
export async function coPicksAction(): Promise<CoPick[]> {
  return coPicks().catch((e) => {
    console.error("coPicksAction", e);
    return [];
  });
}
