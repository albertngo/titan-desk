import type { Board } from "./model";
import { serializeWork } from "./work";

/**
 * What changed since an installer's last Project Week text (Albert, 2026-11-25: "in the SMS itself, lets say whats
 * changed. a super short summary Phrase like: Some dates changed, Extra job, Scope Changed, Payout"; vault
 * `05_decisions/2026-11-25-project-week-whats-new`). After a live text the run keeps a small snapshot of what was sent
 * on the person's Titan Team row (Project Week Last Sent); the next text compares against it. Pure.
 *
 * The snapshot holds short fingerprints, never the address, scope or amount itself: a job's dates as dates, and
 * one hash each for its address, work and payout, and whether it had a photos link; plus the ready-to-pay line ids.
 */

export type Snapshot = { v: 1; j: Record<string, [string, string, string, string, string, 0 | 1]>; r: string[] };

/** A short, stable fingerprint (djb2, base 36). Not for security: only "same or not". */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
const key = (id: string) => id.replace(/-/g, "").slice(0, 12);

export function snapshotOf(b: Board): Snapshot {
  const j: Snapshot["j"] = {};
  for (const { job, payout, work } of b.jobs) {
    const pay = payout.kind === "pending" ? "pending" : `${payout.kind}:${payout.amount}`;
    j[key(job.id)] = [job.start ?? "", job.end ?? "", hash(`${job.street ?? ""}|${job.city ?? ""}`), work ? hash(serializeWork(work)) : "", hash(pay), job.shareLink ? 1 : 0];
  }
  return { v: 1, j, r: b.ready.filter((r) => !r.held).map((r) => key(r.lineId)) };
}

export const serializeSnapshot = (s: Snapshot) => JSON.stringify(s);
export function parseSnapshot(raw: string | null | undefined): Snapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Snapshot;
    return s && s.v === 1 && s.j && typeof s.j === "object" && Array.isArray(s.r) ? s : null;
  } catch {
    return null;
  }
}

/** The phrases, in this order, only those that apply. */
export const CHANGE_PHRASES = ["Extra job", "Job removed", "Some dates changed", "Address changed", "Scope changed", "Payout updated", "Photos added", "Payment on the way"] as const;

export function changesSince(prev: Snapshot, now: Snapshot, today: string): string[] {
  const found = new Set<string>();
  for (const [id, n] of Object.entries(now.j)) {
    const p = prev.j[id];
    if (!p) {
      found.add("Extra job");
      continue;
    }
    if (p[0] !== n[0] || p[1] !== n[1]) found.add("Some dates changed");
    if (p[2] !== n[2]) found.add("Address changed");
    if (p[3] !== n[3]) found.add("Scope changed");
    if (p[4] !== n[4]) found.add("Payout updated");
    if (!p[5] && n[5]) found.add("Photos added");
  }
  // A job that left the list because it simply ended isn't "removed"; one still to come that's gone is.
  for (const [id, p] of Object.entries(prev.j)) if (!now.j[id] && !((p[1] || p[0]) && (p[1] || p[0]) < today)) found.add("Job removed");
  if (now.r.some((r) => !prev.r.includes(r))) found.add("Payment on the way");
  return CHANGE_PHRASES.filter((c) => found.has(c));
}

