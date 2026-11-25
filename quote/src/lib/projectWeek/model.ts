/**
 * Installer Project Week (Albert, 2026-11-24; vault `05_decisions/2026-11-24-installer-project-week-boards`). Pure: the
 * rows read from Notion in, each installer's page and text out. Tested in tests/projectWeek.test.ts.
 *
 * The rules, from the grilling:
 * - The week is the next Monday to Sunday (Toronto). A job is in it when its Confirmed Start Date is, and the installer
 *   is in its Contractor relation. Nobody sees a job they aren't on.
 * - A job's payout is that installer's own Project Costs lines on that project, never anyone else's: the Calculated,
 *   unpaid lines summed. No line yet, or none calculated, reads "pending" (Albert: "can be put as 'pending' if it isn't
 *   set by the PM yet"), and never blocks the page or the text.
 * - Ready to be paid: that installer's Calculated lines with no Paid Reference, on projects that have ended. A line is
 *   on hold while that installer has an open work order on that project (the QA dispatch's rule, ported from
 *   titan-agents `qa-weekly-dispatch/scripts/build_reports.py` `payout_for()`, not imported).
 * - A line on a week job assigned to someone who isn't on the job is left off every page and reported.
 */

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
};

export type OpenWorkOrder = { projectId: string; contractorIds: string[] };

export type Payout = { kind: "final"; amount: number } | { kind: "partial"; amount: number } | { kind: "pending" };

export type BoardJob = { job: Job; payout: Payout; cardLineIds: string[] };
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
    .filter((j) => inWeek(j.start, week) && j.contractors.includes(member.id))
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "") || (a.city ?? "").localeCompare(b.city ?? ""))
    .map((job) => ({
      job,
      payout: payoutFor(job.id, member.id, lines),
      cardLineIds: lines.filter((l) => l.projectId === job.id && l.fromCard && !l.paid).map((l) => l.id),
    }));
  const ready: ReadyLine[] = [];
  for (const l of lines) {
    if (!isReadyLine(l) || !l.projectId) continue;
    const p = input.projects.get(l.projectId);
    if (!p || !p.end || p.end > today) continue;
    const held = input.openWorkOrders.some((w) => w.projectId === l.projectId && w.contractorIds.includes(member.id));
    const label = [firstName(p.customer), p.city].filter(Boolean).join(", ") || "A job";
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
  const ready = b.readyTotal > 0 ? `\n\n${money(b.readyTotal)} from finished jobs is ready to be paid to you.` : "";
  return (
    `[Automated] Hello ${firstName(b.member.name)}. This is Titan Flooring.\n\n` +
    `Your project week, ${dayLabel(b.week.mon)} to ${dayLabel(b.week.sun)}: ${parts.join(", ")}.${ready}\n\n` +
    `Your schedule, scope photos and payouts: ${link}`
  );
}

export type OutMessage = { channel: string; phone: string | null; whatsapp_group_id: string | null; email: string | null; subject: string | null; text: string };

/** The email's subject. */
export const emailSubject = (b: Board) => `Your project week, ${dayLabel(b.week.mon)} to ${dayLabel(b.week.sun)}`;

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
const image = (uploadId: string) => ({ object: "block", type: "image", image: { type: "file_upload", file_upload: { id: uploadId } } });

/** The seven days of the week, YYYY-MM-DD. */
export function weekDays(w: Week): string[] {
  return Array.from({ length: 7 }, (_, n) => new Date(Date.parse(`${w.mon}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10));
}

const cell = (content: string, bold = false) => [{ type: "text", text: { content: content.slice(0, 500) }, ...(bold ? { annotations: { bold: true } } : {}) }];
const tableRow = (cells: { text: string; bold?: boolean }[]) => ({ object: "block", type: "table_row", table_row: { cells: cells.map((c) => cell(c.text, c.bold)) } });
const table = (width: number, rows: object[]) => ({ object: "block", type: "table", table: { table_width: width, has_column_header: true, has_row_header: false, children: rows } });
const callout = (title: string, emoji: string, color: string, children: object[]) => ({
  object: "block",
  type: "callout",
  callout: { rich_text: [{ type: "text", text: { content: title.slice(0, 1900) }, annotations: { bold: true } }], icon: { type: "emoji", emoji }, color, children },
});

/** The Mon to Sun grid (Albert, 2026-11-24: "Any way to have a calendar view there?"): each day's jobs by city and type. */
export function weekGrid(b: Board): object | null {
  if (!b.jobs.length) return null;
  const days = weekDays(b.week);
  const byDay = days.map((d) => b.jobs.filter((j) => j.job.start === d).map((j) => [j.job.city, j.job.type].filter(Boolean).join(", ") || "Job"));
  const depth = Math.max(1, ...byDay.map((d) => d.length));
  const rows = [tableRow(days.map((d) => ({ text: dayLabel(d), bold: true })))];
  for (let r = 0; r < depth; r++) rows.push(tableRow(byDay.map((d) => ({ text: d[r] ?? (r === 0 ? "Free" : "") }))));
  return table(7, rows);
}

/**
 * The page's content, rebuilt whole each time: the week grid, one card per job, the week's total, then Ready to be
 * paid as a small table. `images` maps a job's id to the card pictures already uploaded for this page. `updated` is a
 * plain "Nov 24, 9:15 pm" from the caller.
 */
export function boardBlocks(b: Board, images: Map<string, string[]>, updated: string): object[] {
  const out: object[] = [
    heading(1, `Project week: ${dayLabel(b.week.mon)} to ${dayLabel(b.week.sun)}`),
    para(`For ${firstName(b.member.name)} only. Updated ${updated}. This page updates itself when your schedule or payouts change.`),
  ];
  const grid = weekGrid(b);
  if (grid) out.push(grid);
  out.push(heading(2, "Your jobs"));
  if (!b.jobs.length) out.push(para("No jobs booked for you this week yet."));
  for (const { job, payout } of b.jobs) {
    const title = [job.start ? dayLabel(job.start) : "Date to be confirmed", job.city ?? "City to be confirmed", job.type].filter(Boolean).join(" · ");
    const inside: object[] = [];
    if (firstName(job.customer)) inside.push(bullet("Customer", firstName(job.customer)));
    inside.push(bullet("Address", [job.street, job.city].filter(Boolean).join(", ") || "To be confirmed"));
    if (job.phone) inside.push(bullet("Customer phone", job.phone));
    inside.push(job.shareLink ? bullet("Scope photos", "Open in CompanyCam", job.shareLink) : bullet("Scope photos", "Scope link coming"));
    inside.push(bullet("Your payout", payoutWords(payout)));
    for (const id of images.get(job.id) ?? []) inside.push(image(id));
    out.push(callout(title, "📍", payout.kind === "final" ? "blue_background" : "yellow_background", inside));
  }
  if (b.jobs.length) out.push(callout(`Week total, confirmed: ${money(b.weekTotal)}${b.pending ? ` (plus ${b.pending} pending)` : ""}`, "💵", "green_background", []));
  out.push(heading(2, "Ready to be paid"));
  if (!b.ready.length) out.push(para("Nothing waiting right now."));
  else {
    const rows = [tableRow([{ text: "Job", bold: true }, { text: "Finished", bold: true }, { text: "Amount", bold: true }, { text: "Status", bold: true }])];
    for (const r of b.ready) rows.push(tableRow([{ text: r.label }, { text: dayLabel(r.ended) }, { text: money(r.amount) }, { text: r.held ? "On hold: open work order" : "Ready" }]));
    out.push(table(4, rows), para(`Ready now: ${money(b.readyTotal)}.`));
  }
  out.push({ object: "block", type: "divider", divider: {} }, para("Questions about a job or a payout? Ask your project manager."));
  return out;
}
