import "server-only";
import { notFound } from "next/navigation";
import { listRecords } from "@/lib/airtable/client";
import { OPTION, QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { isAdmin } from "@/lib/access";
import { requireQuoterPerson } from "@/lib/auth";
import { ownerOf, parseState } from "@/lib/followup/plan";
import { emptyPerson, hoursInTiers, lateness, median, needsYouResponse, type PersonPerf } from "@/lib/followup/perf";
import { loadFollowUps } from "./followup";
import { offerValue, torontoDay, type OptionMoney } from "./group";
import { firstNameOf } from "./history";
import { ids, num, str } from "./values";

/**
 * The Performance page (Albert, 2026-11-10), admin only (QUOTE_ADMIN_EMAILS): per person, over the last N days, reply
 * speed, on-time follow-ups, how Needs you was handled, and outcomes. Read only: it writes nothing.
 */

export const WINDOW_DAYS = 30;

export type PerfPage = { since: string; today: string; people: PersonPerf[]; everyone: PersonPerf; stateLogSince: string | null };

const nameOf = (email: string | null) => (email ? (firstNameOf({ email, name: null }) ?? email.split("@")[0]) : "Nobody");


export async function loadPerformance(): Promise<PerfPage> {
  const person = await requireQuoterPerson();
  if (!isAdmin(person.email)) notFound();
  const now = new Date();
  const today = torontoDay(now);
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
  const [page, versions, quotes, options] = await Promise.all([
    loadFollowUps(),
    listRecords(T.versions, { fields: [VERSION.quote, VERSION.status, VERSION.basis, VERSION.sentAt, VERSION.sentBy, VERSION.createdBy, VERSION.changeNo, VERSION.options] }),
    listRecords(T.quotes, { fields: [QUOTE.followUp, QUOTE.projectNumber] }),
    listRecords(T.options, { fields: [OPTION.total, OPTION.recommended, OPTION.notOffered, OPTION.scope, OPTION.part, OPTION.sortOrder, OPTION.version] }),
  ]);

  // Per person raw lists, then summarised.
  type Raw = { replies: (number | null)[]; late: (number | null)[]; needs: (number | null)[]; open: number; hours: { needs: number; watch: number; auto: number }; sent: number; accepted: number; lost: number; postponed: number; wonValue: number; reasons: Record<string, number> };
  const raw = new Map<string, Raw>();
  const of = (who: string) => {
    if (!raw.has(who)) raw.set(who, { replies: [], late: [], needs: [], open: 0, hours: { needs: 0, watch: 0, auto: 0 }, sent: 0, accepted: 0, lost: 0, postponed: 0, wonValue: 0, reasons: {} });
    return raw.get(who) as Raw;
  };
  let firstLog: string | null = null;

  // Open quotes: replies, lateness, Needs you, hours in each tier.
  for (const r of page.rows) {
    const p = of(r.ownerName ?? "Nobody");
    for (const g of r.replies) if (g.at >= since) p.replies.push(g.hours);
    const log = (r.state.events ?? []).filter((e) => e.at >= since);
    if (log[0] && (!firstLog || log[0].at < firstLog)) firstLog = log[0].at;
    const touchTimes = [...r.state.touches.map((t) => t.at), ...(r.due.lastTouch ? [`${r.due.lastTouch}T23:59:59Z`] : [])];
    p.late.push(...lateness(log, touchTimes.map((t) => t.slice(0, 10))));
    p.needs.push(...needsYouResponse(log, touchTimes));
    const h = hoursInTiers(log, now);
    p.hours.needs += h.needs;
    p.hours.watch += h.watch;
    p.hours.auto += h.auto;
    if (r.score.tier === "needs" && r.due.bucket === "due") p.open++;
  }

  // Outcomes: quotes first sent in the window, by who sent them.
  const optionsOf = new Map<string, OptionMoney[]>();
  for (const o of options) {
    const v = ids(o.fields[OPTION.version])[0];
    if (v) optionsOf.set(v, [...(optionsOf.get(v) ?? []), { id: o.id, total: num(o.fields[OPTION.total]), recommended: o.fields[OPTION.recommended] === true, notOffered: o.fields[OPTION.notOffered] === true, part: str(o.fields[OPTION.part]), scope: str(o.fields[OPTION.scope]), sortOrder: num(o.fields[OPTION.sortOrder]) }]);
  }
  const quoteState = new Map(quotes.map((q) => [q.id, { state: parseState(str(q.fields[QUOTE.followUp])), won: Boolean(str(q.fields[QUOTE.projectNumber])) }]));
  const byQuote = new Map<string, typeof versions>();
  for (const v of versions) {
    const q = ids(v.fields[VERSION.quote])[0];
    if (q && str(v.fields[VERSION.sentAt]) && !((num(v.fields[VERSION.changeNo]) ?? 0) > 0)) byQuote.set(q, [...(byQuote.get(q) ?? []), v]);
  }
  for (const [qid, vs] of byQuote) {
    const first = [...vs].sort((a, b) => (str(a.fields[VERSION.sentAt]) as string).localeCompare(str(b.fields[VERSION.sentAt]) as string))[0];
    if ((str(first.fields[VERSION.sentAt]) as string) < since.slice(0, 10)) continue;
    const latest = [...vs].sort((a, b) => (str(b.fields[VERSION.sentAt]) as string).localeCompare(str(a.fields[VERSION.sentAt]) as string))[0];
    const p = of(nameOf(ownerOf(str(latest.fields[VERSION.sentBy]), str(latest.fields[VERSION.createdBy]))));
    p.sent++;
    const qs = quoteState.get(qid);
    const accepted = qs?.won || vs.some((v) => ["Accepted", "Won"].includes(str(v.fields[VERSION.status]) ?? ""));
    if (accepted) {
      p.accepted++;
      const acc = vs.find((v) => ["Accepted", "Won"].includes(str(v.fields[VERSION.status]) ?? "")) ?? latest;
      p.wonValue += offerValue(optionsOf.get(acc.id))?.likely ?? 0;
    } else if (qs?.state.lost || str(latest.fields[VERSION.status]) === "Lost") {
      p.lost++;
      const why = qs?.state.lost?.reason ?? "No reason given";
      p.reasons[why] = (p.reasons[why] ?? 0) + 1;
    } else if (qs?.state.postpone) p.postponed++;
  }

  const summarise = (who: string, r: Raw): PersonPerf => {
    const done = r.replies.filter((x): x is number => x !== null);
    const lates = r.late.filter((x): x is number => x !== null);
    const acted = r.needs.filter((x): x is number => x !== null);
    const decided = r.accepted + r.lost;
    return {
      person: who,
      replies: { count: r.replies.length, medianHours: median(done), over24: done.filter((h) => h > 24).length, waiting: r.replies.length - done.length },
      onTime: { due: r.late.length, onDay: lates.filter((d) => d <= 0).length, late: lates.filter((d) => d > 0).length, open: r.late.length - lates.length, avgDaysLate: lates.some((d) => d > 0) ? Math.round((lates.filter((d) => d > 0).reduce((a, b) => a + b, 0) / lates.filter((d) => d > 0).length) * 10) / 10 : null },
      needsYou: { stints: r.needs.length, medianHours: median(acted), open: r.open, hours: { needs: Math.round(r.hours.needs), watch: Math.round(r.hours.watch), auto: Math.round(r.hours.auto) } },
      outcomes: { sent: r.sent, accepted: r.accepted, lost: r.lost, postponed: r.postponed, winRate: decided ? Math.round((r.accepted / decided) * 100) : null, wonValue: Math.round(r.wonValue), lostReasons: r.reasons },
    };
  };
  const all: Raw = { replies: [], late: [], needs: [], open: 0, hours: { needs: 0, watch: 0, auto: 0 }, sent: 0, accepted: 0, lost: 0, postponed: 0, wonValue: 0, reasons: {} };
  for (const r of raw.values()) {
    all.replies.push(...r.replies);
    all.late.push(...r.late);
    all.needs.push(...r.needs);
    all.open += r.open;
    all.hours.needs += r.hours.needs;
    all.hours.watch += r.hours.watch;
    all.hours.auto += r.hours.auto;
    all.sent += r.sent;
    all.accepted += r.accepted;
    all.lost += r.lost;
    all.postponed += r.postponed;
    all.wonValue += r.wonValue;
    for (const [k, n] of Object.entries(r.reasons)) all.reasons[k] = (all.reasons[k] ?? 0) + n;
  }
  return {
    since: since.slice(0, 10),
    today,
    people: [...raw.entries()].filter(([k]) => k !== "Nobody").map(([k, r]) => summarise(k, r)).sort((a, b) => a.person.localeCompare(b.person)),
    everyone: summarise("Everyone", all),
    stateLogSince: firstLog ? firstLog.slice(0, 10) : null,
  };
}
