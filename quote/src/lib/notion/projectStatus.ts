import "server-only";
import { memberOf } from "@/lib/projectWeek/rows";
import { pmFor, projectRow, type ProjectStatus } from "@/lib/projects/status";
import { DS, normalId, notionPayout, payoutNotionOn, queryAll, type NotionPage } from "./payoutApi";

/**
 * Won and finished projects on All quotes (Albert, 2026-11-27): the Titan Projects rows the list shows, read through
 * the Project Week integration (2f'), which is already shared with Titan Projects, Titan Team and QA Work Orders. Reads
 * only: queries of Titan Projects (made on or after `since`, so the read stays small) and Titan Team (for each project's
 * PM, cc'd on a payment request), and one project page read by id for a payment request. Reached only from
 * src/lib/quotes/projects.ts and src/lib/quotes/paymentRequest.ts.
 */

export const projectStatusOn = payoutNotionOn;

const team = async () => (await queryAll(DS.titanTeam, undefined, 500)).map((r) => memberOf(r));

export async function projectRowsSince(since: string): Promise<Map<string, Omit<ProjectStatus, "payments">>> {
  const [pages, members] = await Promise.all([queryAll(DS.titanProjects, { timestamp: "created_time", created_time: { on_or_after: since } }, 2000), team().catch(() => [])]);
  return new Map(pages.filter((p) => !p.archived && !p.in_trash).map((p) => {
    const r = projectRow(p);
    return [r.id, { ...r.status, pm: pmFor(r.pmIds, members) }] as const;
  }));
}

/** One project's PM (a payment request's cc), read the moment it is sent. Null when the project has none on the team. */
export async function projectPm(projectUrl: string | null | undefined): Promise<{ name: string; email: string } | null> {
  const id = normalId(projectUrl);
  if (!id) return null;
  const page = (await notionPayout("GET", `/pages/${id}`)) as NotionPage;
  return pmFor(projectRow(page).pmIds, await team());
}
