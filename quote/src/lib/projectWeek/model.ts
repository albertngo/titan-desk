/**
 * Installer Project Week (Albert, 2026-11-24; vault `05_decisions/2026-11-24-installer-project-week-boards`). Pure: the
 * rows read from Notion in, each installer's page and text out. Tested in tests/projectWeek.test.ts.
 *
 * The rules, from the grilling:
 * - The window is every upcoming job (Albert, 2026-11-25: "can we make the time frame the entire list", "All upcoming
 *   jobs"; it was next Monday to Sunday): a job is in it when its Confirmed Start Date is today or later, or it started
 *   earlier and its Project End Date is today or later, and the installer is in its Contractor relation. Nobody sees a
 *   job they aren't on.
 * - A job's payout is that installer's own Project Costs lines on that project, never anyone else's: the Calculated,
 *   unpaid lines summed. No line yet, or none calculated, reads "pending" (Albert: "can be put as 'pending' if it isn't
 *   set by the PM yet"), and never blocks the page or the text.
 * - Ready to be paid: that installer's Calculated lines with no Paid Reference, on projects that have ended. A line is
 *   on hold while that installer has an open work order on that project (the QA dispatch's rule, ported from
 *   titan-agents `qa-weekly-dispatch/scripts/build_reports.py` `payout_for()`, not imported).
 * - A line on a week job assigned to someone who isn't on the job is left off every page and reported.
 */

import { mergeWork, parseWork, workKind, workLines, type Work } from "./work";

export type Member = {
  id: string;
  name: string;
  phone: string | null;
  /**
   * Titan Team → Project Week Channels (SMS, WhatsApp, WhatsApp Group), its own column, apart from the QA dispatch's
   * Dispatch Channels (Albert, 2026-11-24: "I might want the Project Week to be to another channel"). Empty means
   * nothing is sent; it never falls back to Dispatch Channels.
   */
  channels: string[];
  groupId: string | null;
  /** Titan Team → Email: used when Email is ticked in Project Week Channels (Albert, 2026-11-24: "Build email sending"). */
  email?: string | null;
  /** Titan Team → Project Week Link: this installer's page, once made. */
  boardUrl: string | null;
};

export type Job = {
  id: string;
  /** Titan Projects → Name, the customer. Only the first name goes on a page. */
  customer: string | null;
  street: string | null;
  city: string | null;
  phone: string | null;
  type: string | null;
  /** Confirmed Start Date, YYYY-MM-DD. */
  start: string | null;
  /** Project End Date, YYYY-MM-DD. */
  end: string | null;
  contractors: string[];
  /** Titan Projects → CCAM Share Link: the public CompanyCam link, pasted by staff. */
  shareLink: string | null;
  /** The accepted quote's scope (scope.ts), the fallback for Work until a payout card is final (2026-11-25). */
  quoteScope?: Work | null;
  /** Titan Projects → CompanyCam Link: the project's own (signed-in) address, used to find its embed feed. */
  camUrl?: string | null;
};

export type CostLine = {
  id: string;
  name: string;
  projectId: string | null;
  assignedTo: string[];
  cost: number | null;
  calculated: boolean;
  /** Paid Reference (3/3) has text: the QA dispatch's test for paid. */
  paid: boolean;
  /** Made by the quote app from a payout card (Notes carries the card marker). */
  fromCard: boolean;
  /** The work on that card, stored as text (work.ts serializeWork, 2026-11-25), or null. */
  work?: string | null;
};

export type OpenWorkOrder = { projectId: string; contractorIds: string[] };

export type Payout = { kind: "final"; amount: number } | { kind: "partial"; amount: number } | { kind: "pending" };

export type BoardJob = { job: Job; payout: Payout; cardLineIds: string[]; work: Work | null };
export type ReadyLine = { lineId: string; projectId: string; label: string; ended: string; amount: number; held: boolean };

export type Board = {
  member: Member;
  week: Week;
  jobs: BoardJob[];
  ready: ReadyLine[];
  /** Calculated payouts on this week's jobs. */
  weekTotal: number;
  pending: number;
  readyTotal: number;
};

export type Week = { mon: string; sun: string };

const DAY = 86_400_000;

/** Today in Toronto, YYYY-MM-DD. */
export function torontoToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The next Monday to Sunday after `today` (YYYY-MM-DD). On a Monday it is the one a week later. */
export function nextWeek(today: string): Week {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay() || 7; // Mon 1 .. Sun 7
  const mon = addDays(today, 8 - dow);
  return { mon, sun: addDays(mon, 6) };
}

export const inWeek = (d: string | null, w: Week) => d !== null && d >= w.mon && d <= w.sun;

/** Every upcoming job from `today` on (2026-11-25): the window has no end. */
export const OPEN_END = "9999-12-31";
export const upcoming = (today: string): Week => ({ mon: today, sun: OPEN_END });
const openEnded = (w: Week) => w.sun === OPEN_END;
/** A job is in the window when it starts in it, or started before it and is still running. */
export const jobInWindow = (j: Pick<Job, "start" | "end">, w: Week) => inWeek(j.start, w) || (j.start !== null && j.start < w.mon && j.end !== null && j.end >= w.mon);
/** "Wed Nov 25 on" for the open window, else "Mon Nov 30 to Sun Dec 6". */
export const periodLabel = (w: Week) => (openEnded(w) ? `${dayLabel(w.mon)} on` : `${dayLabel(w.mon)} to ${dayLabel(w.sun)}`);
/** The Monday of a date's week, for grouping the page by week. */
export function mondayOf(iso: string): string {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay() || 7;
  return addDays(iso, 1 - dow);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Mon Dec 1". */
export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function money(n: number): string {
  const r = Math.round(n * 100) / 100;
  const whole = Math.abs(r - Math.round(r)) < 0.005;
  return `$${r.toLocaleString("en-CA", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** That installer's payout on that job, from their own lines only. */
export function payoutFor(jobId: string, memberId: string, lines: CostLine[]): Payout {
  const mine = lines.filter((l) => l.projectId === jobId && l.assignedTo.includes(memberId) && !l.paid);
  const calc = mine.filter((l) => l.calculated && l.cost !== null);
  if (!calc.length) return { kind: "pending" };
  const amount = round2(calc.reduce((s, l) => s + (l.cost ?? 0), 0));
  return calc.length === mine.length ? { kind: "final", amount } : { kind: "partial", amount };
}

/** Lines on a week job assigned to someone who isn't on that job: left off every page, reported to the office. */
export function strayLines(jobs: Job[], lines: CostLine[]): { line: CostLine; job: Job }[] {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const out: { line: CostLine; job: Job }[] = [];
  for (const l of lines) {
    const job = l.projectId ? byId.get(l.projectId) : undefined;
    if (!job || l.paid) continue;
    if (l.assignedTo.some((a) => !job.contractors.includes(a))) out.push({ line: l, job });
  }
  return out;
}

/** Everyone a page is built for: on a job this week, or with something ready to be paid. */
export function membersToBuild(members: Member[], weekJobs: Job[], ready: CostLine[]): Member[] {
  const ids = new Set<string>();
  for (const j of weekJobs) for (const c of j.contractors) ids.add(c);
  for (const l of ready) for (const a of l.assignedTo) ids.add(a);
  return members.filter((m) => ids.has(m.id));
}

export const isReadyLine = (l: CostLine) => l.calculated && !l.paid && l.cost !== null;

/**
 * One installer's page. `jobs` is every job in the week; `projects` also holds the projects of their ready lines.
 * Only rows naming this installer are ever read into it.
 */
export function buildBoard(input: { member: Member; week: Week; today: string; jobs: Job[]; projects: Map<string, Job>; lines: CostLine[]; openWorkOrders: OpenWorkOrder[] }): Board {
  const { member, week, today } = input;
  const strays = new Set(strayLines(input.jobs, input.lines).map((s) => s.line.id));
  const lines = input.lines.filter((l) => !strays.has(l.id) && l.assignedTo.includes(member.id));
  const jobs: BoardJob[] = input.jobs
    .filter((j) => jobInWindow(j, week) && j.contractors.includes(member.id))
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "") || (a.city ?? "").localeCompare(b.city ?? ""))
    .map((job) => ({
      job,
      payout: payoutFor(job.id, member.id, lines),
      cardLineIds: lines.filter((l) => l.projectId === job.id && l.fromCard && !l.paid).map((l) => l.id),
      // Albert, 2026-11-25 ("Card, else quote"): the installer's own card work once final, else the accepted quote's scope.
      work: lines.filter((l) => l.projectId === job.id && !l.paid).reduce<Work | null>((acc, l) => mergeWork(acc, parseWork(l.work)), null) ?? job.quoteScope ?? null,
    }));
  const ready: ReadyLine[] = [];
  for (const l of lines) {
    if (!isReadyLine(l) || !l.projectId) continue;
    const p = input.projects.get(l.projectId);
    if (!p || !p.end || p.end > today) continue;
    const held = input.openWorkOrders.some((w) => w.projectId === l.projectId && w.contractorIds.includes(member.id));
    // Albert, 2026-11-25: "The payouts names should show the Name of the contact; the address; and Stairs/Flooring/Both".
    const address = [p.street, p.city].filter(Boolean).join(", ");
    const label = [p.customer?.trim(), address, p.type].filter(Boolean).join(" · ") || "A job";
    ready.push({ lineId: l.id, projectId: l.projectId, label, ended: p.end, amount: round2(l.cost ?? 0), held });
  }
  ready.sort((a, b) => a.ended.localeCompare(b.ended));
  const weekTotal = round2(jobs.reduce((s, j) => s + (j.payout.kind === "pending" ? 0 : j.payout.amount), 0));
  return {
    member,
    week,
    jobs,
    ready,
    weekTotal,
    pending: jobs.filter((j) => j.payout.kind !== "final").length,
    readyTotal: round2(ready.filter((r) => !r.held).reduce((s, r) => s + r.amount, 0)),
  };
}

/* ---------- the words ---------- */

export function payoutWords(p: Payout): string {
  if (p.kind === "final") return money(p.amount);
  if (p.kind === "partial") return `${money(p.amount)} so far, more pending (your project manager will confirm)`;
  return "Pending, your project manager will confirm";
}

/** The text that carries the link (the QA dispatch's opener). No em dashes. */
export function messageText(b: Board, link: string): string {
  const n = b.jobs.length;
  const parts = [`${n} job${n === 1 ? "" : "s"}`];
  if (b.weekTotal > 0) parts.push(`${money(b.weekTotal)} confirmed`);
  if (b.pending) parts.push(`${b.pending} payout${b.pending === 1 ? "" : "s"} still pending`);
  const ready = b.readyTotal > 0 ? `\n\nYour finished jobs are done and payment is on the way.` : "";
  return (
    `[Automated] Hello ${firstName(b.member.name)}. This is Titan Flooring.\n\n` +
    `${openEnded(b.week) ? "Your upcoming jobs" : `Your project week, ${periodLabel(b.week)}`}: ${parts.join(", ")}.${ready}\n\n` +
    `Your schedule, scope photos and payouts: ${link}`
  );
}

export type OutMessage = { channel: string; phone: string | null; whatsapp_group_id: string | null; email: string | null; subject: string | null; text: string };

/** The email's subject. */
export const emailSubject = (b: Board) => (openEnded(b.week) ? "Your upcoming jobs with Titan Flooring" : `Your project week, ${periodLabel(b.week)}`);

/**
 * One message per selected channel, as the QA dispatch's Make scenario (5030370) takes them. Email (since 2026-11-24)
 * goes from info@ through that scenario's Outlook route, to the Titan Team Email. A channel without its contact is skipped,
 * never swapped for another.
 */
export function messagesFor(b: Board, link: string): OutMessage[] {
  const text = messageText(b, link);
  const out: OutMessage[] = [];
  for (const channel of ["SMS", "WhatsApp", "WhatsApp Group"]) {
    if (!b.member.channels.includes(channel)) continue;
    if (channel === "WhatsApp Group" ? !b.member.groupId : !b.member.phone) continue;
    out.push({ channel, phone: channel === "WhatsApp Group" ? null : b.member.phone, whatsapp_group_id: channel === "WhatsApp Group" ? b.member.groupId : null, email: null, subject: null, text });
  }
  const email = (b.member.email ?? "").trim();
  if (b.member.channels.includes("Email") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.push({ channel: "Email", phone: null, whatsapp_group_id: null, email, subject: emailSubject(b), text });
  return out;
}

/* ---------- the page (Notion blocks) ---------- */

const rich = (content: string, link?: string | null) => [{ type: "text", text: { content: content.slice(0, 1900), ...(link ? { link: { url: link } } : {}) } }];
const para = (content: string) => ({ object: "block", type: "paragraph", paragraph: { rich_text: rich(content) } });
const heading = (level: 1 | 2 | 3, content: string) => ({ object: "block", type: `heading_${level}`, [`heading_${level}`]: { rich_text: rich(content) } });
const bullet = (label: string, value: string, link?: string | null) => ({
  object: "block",
  type: "bulleted_list_item",
  bulleted_list_item: { rich_text: [{ type: "text", text: { content: `${label}: ` }, annotations: { bold: true } }, ...rich(value, link)] },
});
const bulletWith = (label: string, value: string, children: object[]) => {
  const b = bullet(label, value) as { bulleted_list_item: Record<string, unknown> };
  return children.length ? { ...b, bulleted_list_item: { ...b.bulleted_list_item, children } } : b;
};
const divider = () => ({ object: "block", type: "divider", divider: {} });
const image = (uploadId: string) => ({ object: "block", type: "image", image: { type: "file_upload", file_upload: { id: uploadId } } });

/**
 * The page's content, rebuilt whole each time. `images` maps a job's id to the card pictures already uploaded for this
 * page. `updated` is a plain "Nov 24, 9:15 pm" from the caller.
 */
export function boardBlocks(b: Board, images: Map<string, string[]>, updated: string): object[] {
  const out: object[] = [
    heading(1, openEnded(b.week) ? "Your upcoming jobs" : `Project week: ${periodLabel(b.week)}`),
    para(`For ${firstName(b.member.name)} only. Updated ${updated}. This page updates itself when your schedule or payouts change.`),
  ];
  if (!openEnded(b.week)) out.push(heading(2, "This week"));
  if (!b.jobs.length) out.push(para(openEnded(b.week) ? "No upcoming jobs booked for you yet." : "No jobs booked for you this week yet."));
  // A line between jobs (Albert, 2026-11-25: "add some ui separation"); every upcoming job is grouped by its week.
  let lastWeek: string | null = null;
  b.jobs.forEach(({ job, payout, work }, n) => {
    const wk = openEnded(b.week) ? (job.start && job.start >= b.week.mon ? mondayOf(job.start) : "now") : null;
    if (wk !== null && wk !== lastWeek) {
      out.push(heading(2, wk === "now" ? "In progress" : `Week of ${dayLabel(wk)}`));
      lastWeek = wk;
    } else if (n > 0) out.push(divider());
    out.push(heading(3, `${job.start ? dayLabel(job.start) : "Date to be confirmed"}: ${job.city ?? "City to be confirmed"}`));
    if (firstName(job.customer)) out.push(bullet("Customer", firstName(job.customer)));
    out.push(bullet("Address", [job.street, job.city].filter(Boolean).join(", ") || "To be confirmed"));
    if (job.phone) out.push(bullet("Customer phone", job.phone));
    if (job.type && !work) out.push(bullet("Type", job.type));
    if (work) out.push(bulletWith("Work", workKind(work, job.type), workLines(work).map((w) => bullet(w.label, w.text))));
    out.push(job.shareLink ? bullet("Scope photos", "Open the job photos", job.shareLink) : bullet("Scope photos", "Scope link coming"));
    out.push(bullet("Your payout", payoutWords(payout)));
    for (const id of images.get(job.id) ?? []) out.push(image(id));
  });
  if (b.jobs.length) out.push(para(`${openEnded(b.week) ? "Total" : "Week total"}, confirmed: ${money(b.weekTotal)}${b.pending ? ` (plus ${b.pending} pending)` : ""}.`));
  out.push(divider(), heading(2, "Ready to be paid"));
  if (!b.ready.length) out.push(para("Nothing waiting right now."));
  for (const r of b.ready) out.push(bullet(`${r.label} (finished ${dayLabel(r.ended)})`, r.held ? "Done. Payment on hold until your open work order there is closed" : "Done. Payment is on the way"));
  out.push({ object: "block", type: "divider", divider: {} }, para("Questions about a job or a payout? Ask your project manager."));
  return out;
}

/** One send result for the send log on a Titan Team row (2026-11-25): a message that went, or one that needs a manual send. */
export type LogEntry = {
  memberId: string;
  name: string;
  status: "Sent Successfully" | "Needs Manual";
  channel: string;
  test: boolean;
  jobs: number;
  reason: string | null;
};

/** The row's Project Week Status after a press: Needs Manual if anything failed, else Sent Successfully. Pure. */
export const memberStatus = (entries: LogEntry[]): LogEntry["status"] => (entries.some((e) => e.status === "Needs Manual") ? "Needs Manual" : "Sent Successfully");

/** One dated line for the bottom of the person's Titan Team page. Pure; `when` is the Toronto time already formatted. */
export function logLine(e: LogEntry, week: { mon: string; sun: string }, pressedBy: string, when: string): string {
  const what = `Project Week ${periodLabel(week)}, ${e.jobs} job${e.jobs === 1 ? "" : "s"}`;
  const how = [e.channel === "None" ? null : e.channel, e.test ? "Test" : "Live", pressedBy].filter(Boolean).join(", ");
  return `${when}: ${e.status}. ${what} (${how}).${e.reason ? ` ${e.reason}` : ""}`;
}

/**
 * The Dispatch Log on a Titan Team page (Albert, 2026-11-25: "a 2 column field where the left is the project week, and
 * right is the QA"): a "Dispatch Log" heading over two columns, each headed by its name. The quote app writes the left,
 * the weekly QA dispatch the right; whichever writes first makes both. Pure.
 */
export const DISPATCH_COLUMNS = ["Project Week", "QA Dispatch"] as const;
export const isDispatchColumns = (firstHeadings: string[]): boolean =>
  firstHeadings.length === 2 && firstHeadings[0] === DISPATCH_COLUMNS[0] && firstHeadings[1] === DISPATCH_COLUMNS[1];
export function dispatchLogBlocks(): object[] {
  const h = (type: "heading_2" | "heading_3", t: string) => ({ object: "block", type, [type]: { rich_text: [{ type: "text", text: { content: t } }] } });
  return [
    h("heading_2", "Dispatch Log"),
    { object: "block", type: "column_list", column_list: { children: DISPATCH_COLUMNS.map((name) => ({ object: "block", type: "column", column: { children: [h("heading_3", name)] } })) } },
  ];
}
