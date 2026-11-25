import { dayLabel, firstName, type Board } from "./model";
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


/**
 * The page's "What changed" summary (Albert, 2026-11-25: "When a date changes; a little summary at the top page is
 * good"): one line per change, naming the job by the customer's first name and its day, against the same snapshot
 * the text compares with. Jobs that left the list are counted, not named (the snapshot keeps no names). Pure.
 */
export function changeDetails(prev: Snapshot, b: Board, today: string): string[] {
  const out: string[] = [];
  const label = (j: Board["jobs"][number]["job"]) => [firstName(j.customer) || "A job", j.city].filter(Boolean).join(", ");
  const day = (d: string) => (d ? dayLabel(d) : "date to be confirmed");
  const now = snapshotOf(b);
  for (const { job } of b.jobs) {
    const k = key(job.id);
    const p = prev.j[k];
    const n = now.j[k];
    if (!p) {
      out.push(`New job: ${label(job)}, starting ${day(n[0])}.`);
      continue;
    }
    if (p[0] !== n[0]) out.push(`${label(job)}: moved from ${day(p[0])} to ${day(n[0])}.`);
    else if (p[1] !== n[1]) out.push(`${label(job)}: end date now ${day(n[1])}.`);
    if (p[2] !== n[2]) out.push(`${label(job)}: the address changed.`);
    if (p[3] !== n[3]) out.push(`${label(job)}: the scope changed.`);
    if (p[4] !== n[4]) out.push(`${label(job)}: payout updated.`);
    if (!p[5] && n[5]) out.push(`${label(job)}: photos added.`);
  }
  const gone = Object.entries(prev.j).filter(([id, p]) => !now.j[id] && !((p[1] || p[0]) && (p[1] || p[0]) < today)).length;
  if (gone) out.push(`${gone} job${gone === 1 ? " was" : "s were"} taken off your list.`);
  const paid = now.r.filter((r) => !prev.r.includes(r)).length;
  if (paid) out.push(`${paid} finished job${paid === 1 ? " is" : "s are"} now ready to be paid.`);
  return out;
}

const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The 3-day heads-up (Albert, 2026-11-25: "Build the Friday 3pm send and 3-day heads-up"): true when a job starting
 * today to 3 days from now was added, removed, moved or changed address since the last live text. Scope, payout and
 * photo changes never trigger it on their own; they wait for Friday's send or a button. Pure.
 */
export function needsHeadsUp(prev: Snapshot, now: Snapshot, today: string, days = 3): boolean {
  const last = plusDays(today, days);
  const near = (d: string) => Boolean(d) && d >= today && d <= last;
  for (const [id, n] of Object.entries(now.j)) {
    const p = prev.j[id];
    if (!p) {
      if (near(n[0])) return true;
      continue;
    }
    if ((near(n[0]) || near(p[0])) && (p[0] !== n[0] || p[2] !== n[2])) return true;
  }
  for (const [id, p] of Object.entries(prev.j)) if (!now.j[id] && near(p[0])) return true;
  return false;
}

/** Toronto weekday (1 Mon .. 7 Sun) and hour, for the automatic sends' own check of the clock. */
export function torontoClock(now: Date): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return { weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd) + 1, hour };
}
