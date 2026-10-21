import { ghlContactUrl, ghlOpportunityUrl } from "@/lib/ghl/ids";
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

// ---------- fixing a wrong address ----------

export type AddressHome = {
  addressStatus: string | null;
  projectNumber: string | null;
  ghlContactId: string | null;
  ghlOpportunityId: string | null;
  notionProjectUrl: string | null;
};

export type FixAddressLink = { href: string; hint: string };

/**
 * Where a wrong address is put right (Albert, 2026-10-21), by the rule of 2026-10-15: an
 * unconfirmed address follows the GHL contact; a confirmed site is fixed on the opportunity's
 * Project Address (a booking with the wrong contact address confirms the wrong site, and the
 * contact alone can no longer change it); a won job's address lives on the Notion project. The
 * quote follows the right place the next time it opens. Null when there is nowhere to send
 * the person.
 */
export function fixAddressLink(q: AddressHome): FixAddressLink | null {
  if (q.projectNumber?.trim()) {
    return q.notionProjectUrl ? { href: q.notionProjectUrl, hint: "This job is won: its address lives on the Notion project. Fix it there." } : null;
  }
  if (q.addressStatus === "Confirmed") {
    if (q.ghlOpportunityId) {
      return {
        href: ghlOpportunityUrl(q.ghlOpportunityId),
        hint: "A confirmed site is fixed on the opportunity's Project Address and Project City in GHL. The quote follows it the next time it opens. Fix the contact's address too so the next booking is right.",
      };
    }
    return q.ghlContactId
      ? { href: ghlContactUrl(q.ghlContactId), hint: "This quote isn't linked to an opportunity yet. Link it, then fix the Project Address on the opportunity." }
      : null;
  }
  return q.ghlContactId
    ? { href: ghlContactUrl(q.ghlContactId), hint: "An unconfirmed address follows the GHL contact. Change it there; the quote follows it the next time it opens." }
    : null;
}

// ---------- confirming an address by hand ----------

export type AddressCheck = { siteAddress: string | null; addressStatus: string | null; projectNumber: string | null };

/**
 * Whether staff may confirm a quote's address from its page (Albert, 2026-10-15): it has an
 * address, it isn't confirmed yet, and the job isn't won (Notion owns a won job's address).
 * `shown` is the address the person saw when they pressed the button; if the quote's address
 * has changed since, nothing is confirmed.
 */
export function confirmAddressCheck(q: AddressCheck, shown: string): { ok: true } | { ok: false; message: string } {
  const now = q.siteAddress?.trim() || null;
  if (!now) return { ok: false, message: "This quote has no address to confirm. Add it on the GHL contact first." };
  if (q.addressStatus === "Confirmed") return { ok: false, message: "This address is already confirmed." };
  if (q.projectNumber?.trim()) return { ok: false, message: "This job is won: its address is kept on the Notion project." };
  if (now.toLowerCase() !== shown.trim().toLowerCase()) return { ok: false, message: "The address changed since this page opened. Reload and check it again." };
  return { ok: true };
}
