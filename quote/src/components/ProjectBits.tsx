"use client";

import type { PlanProgress } from "@/lib/calc";
import { PAY_LABELS } from "@/lib/pricing/schedule";
import { hasStarted, isFinished, readyToCollect, walkthroughWords, workOrderWords, type ProjectStatus } from "@/lib/projects/status";
import { money as cad } from "@/lib/format";
import { money } from "@/lib/quotes/pipeline";

/**
 * Won and finished projects on All quotes (Albert, 2026-11-27; vault 05_decisions/2026-11-27-quote-complete-filter-
 * and-final-payment): the Invoice / Cash tag, the project's line under its row on the Won and Complete views, the
 * payment plan popout, and the strip over those views. Everything here only reads.
 */

const dayWords = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "");

/** Notion's Type of Deal beside the customer's name, plain grey (Albert, 2026-11-27: "less colorful"). */
export function DealTag({ deal }: { deal: string | null }) {
  if (!deal) return null;
  return (
    <span className="pj-deal" title="Type of Deal in Notion">
      {deal}
    </span>
  );
}

const STATE_WORDS = { paid: "Paid", part: "Part paid", open: "Not paid yet" } as const;

/** The contract's payment plan, stage by stage, and the payments received (2026-11-27: "an info popout can assist with what was given"). */
export function PlanPopover({ id, plan, p, name }: { id: string; plan: PlanProgress | null; p: ProjectStatus; name: string }) {
  return (
    <>
      <button type="button" className="pj-info" popoverTarget={id} aria-label={`Payment plan for ${name}`} title="Payment plan">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 7.2v3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="5" r=".9" fill="currentColor" />
        </svg>
      </button>
      <div id={id} popover="auto" className="pj-pop">
        <div className="pj-pop-h">
          <strong>Payment plan</strong>
          <span>
            {name}
            {p.deal ? ` · ${p.deal}` : ""}
          </span>
          <button type="button" className="pj-x" popoverTarget={id} popoverTargetAction="hide" aria-label="Close">
            ×
          </button>
        </div>
        {!plan ? (
          <p className="pj-pop-none">{p.payments === null ? "The payments couldn't be read from Notion." : "No contract total to follow."}</p>
        ) : (
          <>
            {plan.stages.length === 0 ? (
              <p className="pj-pop-none">No payment plan on the app&apos;s contract (won outside the app). The total is Notion&apos;s Value Approx.</p>
            ) : (
              <ol className="pj-stages">
                {plan.stages.map((s, i) => (
                  <li key={i} className={s.state}>
                    <span className="dot" aria-hidden />
                    <span className="what">
                      <span className="l">{s.label}</span>
                      <span className="w">{[s.when, s.pay ? PAY_LABELS[s.pay] : null].filter(Boolean).join(" · ")}</span>
                      <span className="st">{STATE_WORDS[s.state]}{s.state === "part" ? `, ${cad(s.paid)} in` : ""}</span>
                    </span>
                    <span className="amt">{cad(s.amount)}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="pj-received">
              <span className="k">Received (Master Payments Log)</span>
              {(p.payments ?? []).length === 0 ? (
                <span className="faint">Nothing yet</span>
              ) : (
                [...(p.payments ?? [])]
                  .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
                  .map((x, i) => (
                    <span key={i} className="pay">
                      <span>{dayWords(x.date)}</span>
                      <span className="faint">{[x.method, x.reference].filter(Boolean).join(" · ")}</span>
                      <span className="amt">{cad(x.amount)}</span>
                    </span>
                  ))
              )}
            </div>
            <div className="pj-pop-f">
              <span>Contract {cad(plan.total)}</span>
              <strong>{plan.balance === 0 ? "Paid in full" : `Left ${cad(plan.balance)}`}</strong>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/**
 * The project's line under its row on the Won and Complete views: when it started or ended, the walkthrough and work
 * orders (Complete), the contract, paid and what is left or due now, Notion's Ready to Collect, and the plan.
 */
export function ProjectLine({ id, p, plan, today, name, view }: { id: string; p: ProjectStatus; plan: PlanProgress | null; today: string; name: string; view: "won" | "complete" }) {
  const wt = walkthroughWords(p.walkthrough);
  const wo = workOrderWords(p.workOrders);
  const ready = readyToCollect(p.ready);
  const due = view === "won" ? plan?.secondOwing ?? null : plan?.balance ?? null;
  return (
    <div className="pj-line">
      {view === "complete" ? (
        <span className="pj-cell">
          <span className="k">Ended</span>
          {dayWords(p.end)}
        </span>
      ) : (
        <span className="pj-cell">
          <span className="k">{hasStarted(p, today) ? "Started" : "Starts"}</span>
          {p.start ? dayWords(p.start) : <span className="faint">No date</span>}
          {p.end && !isFinished(p, today) ? <span className="faint"> · ends {dayWords(p.end)}</span> : null}
        </span>
      )}
      {view === "complete" && (
        <>
          <span className="pj-cell">
            <span className="k">Walkthrough</span>
            <span className={`chip ${wt.tone === "plain" ? "" : wt.tone}`}>{wt.text}</span>
          </span>
          <span className="pj-cell">
            <span className="k">Work orders</span>
            <span className={`chip ${wo.open ? "warn" : ""}`}>{wo.text}</span>
          </span>
        </>
      )}
      <span className="pj-cell num">
        <span className="k">Contract</span>
        {plan ? cad(plan.total) : <span className="faint">n/a</span>}
      </span>
      <span className="pj-cell num">
        <span className="k">Paid</span>
        {p.payments === null ? <span className="faint">Couldn&apos;t read</span> : `${cad(plan?.paid ?? 0)} · ${p.payments.length} ${p.payments.length === 1 ? "payment" : "payments"}`}
      </span>
      <span className="pj-cell num">
        <span className="k">{view === "won" ? "Due now" : "Balance"}</span>
        <span className="pj-due">
          <strong>{due === null ? "n/a" : due === 0 ? (view === "won" ? "Nothing" : "Paid in full") : cad(due)}</strong>
          <PlanPopover id={`plan-${id}`} plan={plan} p={p} name={name} />
        </span>
      </span>
      {view === "complete" && (
        <span className={`pj-ready${ready ? " yes" : ""}`} title="Ready to Collect, from the Notion project">
          {ready ? "Ready to collect" : `Notion: ${p.ready ?? "Ready to Collect is blank"}`}
        </span>
      )}
    </div>
  );
}

export type CollectTotals = { count: number; sum: number };

/** The strip over the Won and Complete views. */
export function CollectStrip({ view, left, ready, waiting, second, starting, read, onRefresh, busy }: { view: "won" | "complete"; left: CollectTotals; ready: CollectTotals; waiting: CollectTotals; second: CollectTotals; starting: number; read: string; onRefresh: () => void; busy: boolean }) {
  const n = (c: CollectTotals) => (c.count ? `${c.count} · ${money(c.sum, true)}` : "0");
  return (
    <section className="qp pj-strip" aria-label={view === "won" ? "Won projects" : "Collecting"}>
      {view === "complete" ? (
        <>
          <div className="qp-t">
            <span className="k">Left to collect</span>
            <span className="big">{money(left.sum, true)}</span>
            <span className="sub">{left.count === 1 ? "1 finished project with a balance" : `${left.count} finished projects with a balance`}</span>
          </div>
          <div className="qp-t">
            <span className="k">Ready to collect</span>
            <span className="big">{n(ready)}</span>
            <span className="sub">as Notion&apos;s Ready to Collect says</span>
          </div>
          <div className="qp-t warn">
            <span className="k">Not ready to collect</span>
            <span className="big">{n(waiting)}</span>
            <span className="sub">Notion lists what is still open</span>
          </div>
        </>
      ) : (
        <>
          <div className="qp-t">
            <span className="k">Ready for second payment</span>
            <span className="big">{n(second)}</span>
            <span className="sub">on site, second payment not in yet</span>
          </div>
          <div className="qp-t">
            <span className="k">Starting in the next 7 days</span>
            <span className="big">{starting}</span>
            <span className="sub">second payment due on day one</span>
          </div>
        </>
      )}
      <div className="qp-t">
        <span className="k">From Notion</span>
        <span className="sub">{read}</span>
        <button type="button" className="btn small" onClick={onRefresh} disabled={busy}>
          {busy ? "Reading…" : "Refresh"}
        </button>
      </div>
    </section>
  );
}
