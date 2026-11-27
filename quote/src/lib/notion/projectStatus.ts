import "server-only";
import { projectRow, type ProjectStatus } from "@/lib/projects/status";
import { DS, payoutNotionOn, queryAll } from "./payoutApi";

/**
 * Won and finished projects on All quotes (Albert, 2026-11-27): the Titan Projects rows the list shows, read through
 * the Project Week integration (2f'), which is already shared with Titan Projects and QA Work Orders. One query, never
 * a write: only projects made on or after `since` (YYYY-MM-DD), so the read stays small. Reached only from
 * src/lib/quotes/projects.ts.
 */

export const projectStatusOn = payoutNotionOn;

export async function projectRowsSince(since: string): Promise<Map<string, Omit<ProjectStatus, "payments">>> {
  const pages = await queryAll(DS.titanProjects, { timestamp: "created_time", created_time: { on_or_after: since } }, 2000);
  return new Map(pages.filter((p) => !p.archived && !p.in_trash).map((p) => {
    const r = projectRow(p);
    return [r.id, r.status] as const;
  }));
}
