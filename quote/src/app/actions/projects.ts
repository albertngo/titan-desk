"use server";

import { listProjectStatuses } from "@/lib/quotes/projects";
import type { ProjectsResult } from "@/lib/projects/status";

/** Won and finished projects on All quotes (2026-11-27): the list asks once it has drawn, and on Refresh. Read only; checks the quoter allowlist inside. */
export async function projectStatusesAction(): Promise<ProjectsResult> {
  return listProjectStatuses().catch((e) => {
    console.error("projectStatusesAction", e);
    return { ok: false as const, message: "Notion projects couldn't be read. Try again in a moment." };
  });
}
