import { projectJobs, REVIVE_WINDOW_DAYS } from "./booking";

/**
 * Linking a quote that says Needs linking (2026-10-15). Pure, no I/O: which of the customer's
 * GHL opportunities staff may link it to. src/lib/quotes/link.ts carries the link out.
 *
 * - Project jobs only, never a STORE order.
 * - Open jobs, and jobs lost or abandoned in the last 90 days (linking one reopens it: the
 *   booking found no open job, so the work may be that one coming back). Never a won job.
 * - One opportunity, one quote: a job another quote is on is shown, but can't be picked.
 */

export type JobCandidate = {
  id: string;
  name: string | null;
  status: string | null;
  pipelineId: string | null;
  stageId: string | null;
  statusChangedAt: string | null;
  siteAddress: string | null;
  companyCamUrl: string | null;
};

export type LinkChoice = JobCandidate & {
  /** Linking it sets it back to open. */
  reopen: boolean;
  /** The quote already on this job, if another quote has it. */
  takenBy: string | null;
};

/** `taken` maps an opportunity id to the number of the OTHER quote already on it. */
export function linkChoices<T extends JobCandidate>(opps: T[], taken: Map<string, string | null>, now: Date): (T & LinkChoice)[] {
  const since = now.getTime() - REVIVE_WINDOW_DAYS * 86_400_000;
  const closedLately = (o: T) => (o.status === "lost" || o.status === "abandoned") && Date.parse(o.statusChangedAt ?? "") >= since;
  return projectJobs(opps)
    .filter((o) => o.status === "open" || closedLately(o))
    .map((o) => ({ ...o, reopen: o.status !== "open", takenBy: taken.has(o.id) ? (taken.get(o.id) ?? "another quote") : null }))
    .sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || (b.statusChangedAt ?? "").localeCompare(a.statusChangedAt ?? ""));
}
