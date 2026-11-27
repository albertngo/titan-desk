import "server-only";
import { requireQuoter } from "@/lib/auth";
import { listRecords } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { paymentsByProject, paymentsReaderOn } from "@/lib/notion/payments";
import { notionPageId } from "@/lib/notion/rows";
import { projectRowsSince, projectStatusOn } from "@/lib/notion/projectStatus";
import type { ProjectStatus, ProjectsResult } from "@/lib/projects/status";
import { str } from "./values";
import { torontoDay } from "./group";

/**
 * Won and finished projects on All quotes (Albert, 2026-11-27; vault 05_decisions/2026-11-27-quote-complete-filter-and-
 * final-payment): each linked quote's Notion project, read live every time the list asks (on open, on Refresh, and
 * when the tab comes back after a while), and its payments from the Master Payments Log. Read only, staff only.
 *
 * The read stays small: only projects made since 30 days before the oldest quote that has one, and payments received
 * since 60 days before that.
 */
export async function listProjectStatuses(): Promise<ProjectsResult> {
  await requireQuoter();
  if (!projectStatusOn()) return { ok: false, message: "Notion projects aren't set up on this deployment." };
  const quotes = await listRecords(T.quotes, { fields: [QUOTE.notionProjectUrl] });
  const linked = quotes.flatMap((q) => {
    const id = notionPageId(str(q.fields[QUOTE.notionProjectUrl]));
    return id ? [{ quote: q.id, page: id, created: q.createdTime }] : [];
  });
  const today = torontoDay(new Date());
  if (linked.length === 0) return { ok: true, byQuote: {}, today, paymentsRead: paymentsReaderOn() };
  const oldest = linked.map((l) => l.created).sort()[0];
  const back = (days: number) => torontoDay(new Date(Date.parse(oldest) - days * 86_400_000));
  const [rows, payments] = await Promise.all([
    projectRowsSince(back(30)),
    paymentsReaderOn() ? paymentsByProject(back(60)).catch((e) => (console.error("paymentsByProject", e), null)) : Promise.resolve(null),
  ]);
  const byQuote: Record<string, ProjectStatus> = {};
  for (const l of linked) {
    const row = rows.get(l.page);
    if (row) byQuote[l.quote] = { ...row, payments: payments ? (payments.get(l.page) ?? []) : null };
  }
  return { ok: true, byQuote, today, paymentsRead: payments !== null };
}
