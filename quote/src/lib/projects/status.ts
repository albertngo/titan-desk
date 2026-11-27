import { paidTotal, planProgress, type PlanProgress } from "@/lib/calc";
import type { Payment } from "@/lib/billing/doc";
import type { CopyStage } from "@/lib/send/copy";

/**
 * Won and finished projects on All quotes (Albert, 2026-11-27; vault 05_decisions/2026-11-27-quote-complete-filter-
 * and-final-payment and its amendments). Pure, no I/O: src/lib/notion/projectStatus.ts reads the Notion rows and
 * src/lib/quotes/projects.ts the payments; this shapes them. Tested in tests/projects.test.ts.
 *
 * - **Complete** is a won project whose Notion **Project End Date** is today or earlier (Toronto); **Won** is one with
 *   no end date yet, or one still ahead ("end date it enough to count as complete").
 * - **Ready to collect** is Notion's own Ready to Collect formula, read as it is and never worked out again here, so the
 *   two can't disagree ("make the app mirror so it doesnt go out of sync"). Its text says "Ready…" when it is, and
 *   lists what is still open otherwise; that text is shown as it is.
 * - **Ready for second payment** is a won project on site (Confirmed Start Date today or earlier) and not finished whose
 *   payments are still below every stage of the contract's payment plan but the final one ("second payment happens on
 *   the start of the first day").
 * - Invoice / Cash is Notion's Type of Deal, shown as it is.
 */

/** A Titan Projects row, as the list needs it. Payments are null when they couldn't be read. */
export type ProjectStatus = {
  /** Confirmed Start Date and Project End Date, YYYY-MM-DD. */
  start: string | null;
  end: string | null;
  /** Final Walkthrough: Not started, In progress, In progress [Auto], None, Completed. */
  walkthrough: string | null;
  /** The status of each of its QA work orders (Work Order Statuses). */
  workOrders: string[];
  /** Ready to Collect, the formula's text. */
  ready: string | null;
  /** Type of Deal: Invoice, Cash or Warranty. */
  deal: string | null;
  /** Value Approx: what Notion tracks the balance against, used only when the quote has no contract in the app. */
  valueApprox: number | null;
  payments: Payment[] | null;
};

export type ProjectsResult = { ok: true; byQuote: Record<string, ProjectStatus>; today: string; paymentsRead: boolean } | { ok: false; message: string };

type Prop = Record<string, unknown> | undefined;

const dashed = (id: string) => {
  const h = id.replace(/-/g, "").toLowerCase();
  return h.length === 32 ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : id.toLowerCase();
};

const dateOf = (p: Prop): string | null => {
  const s = (p?.date as { start?: unknown } | null | undefined)?.start;
  return typeof s === "string" ? s.slice(0, 10) : null;
};
const nameOf = (p: Prop): string | null => {
  const v = (p?.select ?? p?.status) as { name?: unknown } | null | undefined;
  return typeof v?.name === "string" && v.name.trim() ? v.name.trim() : null;
};
/** A formula's value as text: a string as it is, a boolean as Ready / Not ready, a number as its digits. */
export function formulaText(p: Prop): string | null {
  const f = p?.formula as { type?: string; string?: unknown; boolean?: unknown; number?: unknown } | undefined;
  if (!f) return null;
  if (f.type === "string") return typeof f.string === "string" && f.string.trim() ? f.string.trim() : null;
  if (f.type === "boolean") return f.boolean === true ? "Ready" : f.boolean === false ? "Not ready" : null;
  if (f.type === "number") return typeof f.number === "number" ? String(f.number) : null;
  return null;
}
/** A status rollup's names (Work Order Statuses). */
export function rollupNames(p: Prop): string[] {
  const r = p?.rollup as { type?: string; array?: Record<string, unknown>[] } | undefined;
  if (r?.type !== "array" || !Array.isArray(r.array)) return [];
  return r.array.flatMap((x) => {
    const n = nameOf(x);
    return n ? [n] : [];
  });
}

/** The Titan Projects property names read (Titan's own names in Notion). */
export const PROJECT_PROPS = {
  start: "Confirmed Start Date",
  end: "Project End Date",
  walkthrough: "Final Walkthrough",
  workOrders: "Work Order Statuses",
  ready: "Ready to Collect",
  deal: "Type of Deal",
  valueApprox: "Value Approx",
} as const;

/** One Titan Projects page: its id (dashed) and what the list shows. Payments come separately. */
export function projectRow(page: { id: string; properties?: Record<string, Record<string, unknown>> }): { id: string; status: Omit<ProjectStatus, "payments"> } {
  const p = page.properties ?? {};
  const value = p[PROJECT_PROPS.valueApprox]?.number;
  return {
    id: dashed(page.id),
    status: {
      start: dateOf(p[PROJECT_PROPS.start]),
      end: dateOf(p[PROJECT_PROPS.end]),
      walkthrough: nameOf(p[PROJECT_PROPS.walkthrough]),
      workOrders: rollupNames(p[PROJECT_PROPS.workOrders]),
      ready: formulaText(p[PROJECT_PROPS.ready]),
      deal: nameOf(p[PROJECT_PROPS.deal]),
      valueApprox: typeof value === "number" ? value : null,
    },
  };
}

/** Finished: Notion has a Project End Date and it is today or earlier. */
export const isFinished = (p: Pick<ProjectStatus, "end"> | null | undefined, today: string) => Boolean(p?.end && p.end <= today);
/** On site: the Confirmed Start Date is today or earlier. */
export const hasStarted = (p: Pick<ProjectStatus, "start"> | null | undefined, today: string) => Boolean(p?.start && p.start <= today);

/** Notion's Ready to Collect says it is ready: its text says "Ready", and not "Not ready". */
export const readyToCollect = (text: string | null | undefined) => Boolean(text && /ready/i.test(text) && !/not\s+ready/i.test(text));

/** A work order that is still open: anything but Done or Dropped. */
const closedWo = (s: string) => /^(done|dropped)\b/i.test(s.trim());
export const openWorkOrders = (statuses: string[]) => statuses.filter((s) => !closedWo(s)).length;

/** "None", "2 done", "1 open", "1 open · 1 done". */
export function workOrderWords(statuses: string[]): { text: string; open: boolean } {
  if (statuses.length === 0) return { text: "None", open: false };
  const open = openWorkOrders(statuses);
  const done = statuses.length - open;
  return { text: [open ? `${open} open` : null, done ? `${done} done` : null].filter(Boolean).join(" · "), open: open > 0 };
}

/** The Final Walkthrough as the list words it: None is "Not needed". */
export function walkthroughWords(s: string | null): { text: string; tone: "good" | "warn" | "plain" } {
  if (!s) return { text: "Not set", tone: "plain" };
  if (/^completed$/i.test(s)) return { text: "Completed", tone: "good" };
  if (/^none$/i.test(s)) return { text: "Not needed", tone: "plain" };
  if (/progress/i.test(s)) return { text: "In progress", tone: "warn" };
  return { text: s, tone: "warn" };
}

/** What the quote's contract says, as the list carries it. */
export type ContractMoney = { total: number | null; stages: Pick<CopyStage, "label" | "when" | "pay" | "amount">[] };

/**
 * The project's payment plan against what has come in: the contract's own stages and total; a project won outside the
 * app (no contract here) takes Notion's Value Approx with no stages. Null when there is no total, or the payments
 * couldn't be read.
 */
export function projectPlan(contract: ContractMoney, p: Pick<ProjectStatus, "payments" | "valueApprox">): PlanProgress | null {
  const total = contract.total ?? p.valueApprox;
  if (total === null || !p.payments) return null;
  return planProgress(contract.total !== null ? contract.stages : [], total, paidTotal(p.payments.map((x) => x.amount)));
}

/** Ready for second payment: on site, not finished, and paid below every stage but the final one. */
export const secondPaymentDue = (p: ProjectStatus | null | undefined, plan: PlanProgress | null, today: string) =>
  Boolean(p && plan && hasStarted(p, today) && !isFinished(p, today) && plan.secondOwing > 0);

/** Where a finished project sits on the Complete view: paid in full, ready to collect, or not ready yet. */
export type CollectGroup = "ready" | "waiting" | "paid";
export function collectGroup(p: ProjectStatus, plan: PlanProgress | null): CollectGroup {
  if (plan && plan.balance === 0) return "paid";
  return readyToCollect(p.ready) ? "ready" : "waiting";
}

export const COLLECT_GROUPS: { key: CollectGroup; title: string; rule: string }[] = [
  { key: "ready", title: "Ready to collect", rule: "Notion's Ready to Collect says it is ready, and there is a balance" },
  { key: "waiting", title: "Not ready to collect", rule: "Finished, but Notion's Ready to Collect still lists something open" },
  { key: "paid", title: "Paid in full", rule: "Nothing left on the contract" },
];
