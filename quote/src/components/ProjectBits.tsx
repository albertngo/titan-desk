"use client";

import { useState } from "react";
import type { PlanProgress } from "@/lib/calc";
import { paymentSendAsAction, requestPaymentAction, type PaymentSendAs } from "@/app/actions/paymentRequest";
import { coPicksAction, quickChangeAction } from "@/app/actions/quickChange";
import { coLineAmount } from "@/lib/calc";
import { CO_SECTIONS, type CoLine } from "@/lib/change/quick";
import type { CoPick } from "@/lib/quotes/quickChange";
import { lastAsked, OFFICE, REQUEST_WORDS, requestAmount, type PaymentRequest, type RequestKind } from "@/lib/projects/request";
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


const askedWords = (r: PaymentRequest | null) => (r ? `Asked ${dayWords(r.at.slice(0, 10))} by ${[r.email ? "email" : null, r.text ? "text" : null].filter(Boolean).join(" and ")}` : null);

/**
 * Request payment (Albert, 2026-11-27): the button on a Won row whose second payment is due, or a Complete row with a
 * balance, and its card. The amount shown is the plan's; the server works it out again from the contract and today's
 * payments before anything goes. While Settings' "Payment requests go to customers" is off, it goes to the sender's own
 * GHL contact, marked Test.
 */
export function RequestPayment({ id, kind, versionId, plan, name, deal, pm, requests, live, onDone }: { id: string; kind: RequestKind; versionId: string; plan: PlanProgress; name: string; deal: string | null; pm: { name: string; email: string } | null; requests: PaymentRequest[]; live: boolean; onDone: () => void }) {
  const w = REQUEST_WORDS[kind];
  // Who it goes out as (Albert, 2026-11-27: "default is office, cc'd the PM. But able to select who to send it out as").
  const [asWho, setAsWho] = useState<string>(OFFICE);
  const [senders, setSenders] = useState<PaymentSendAs | null>(null);
  const loadSenders = () => {
    if (!senders) paymentSendAsAction().then(setSenders).catch(() => setSenders({ office: null, people: [] }));
  };
  const [email, setEmail] = useState(true);
  const [text, setText] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const due = requestAmount(kind, plan);
  const asked = lastAsked(requests, kind);
  const lastTest = [...requests].reverse().find((r) => r.kind === kind && r.test) ?? null;
  const send = async () => {
    setBusy(true);
    setMsg(null);
    const r = await requestPaymentAction(versionId, { kind, email, text, as: asWho }).catch(() => ({ ok: false as const, message: "The request couldn't be sent. Try again in a moment." }));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    setMsg({ ok: true, text: `${r.test ? "Test sent to you" : "Sent to the customer"} by ${r.sent.join(" and ")}: ${cad(r.amount)}.${r.warning ? ` ${r.warning}` : ""}` });
    onDone();
  };
  return (
    <>
      <span className="pj-req">
        <button type="button" className="btn small primary" popoverTarget={id} onClick={loadSenders}>
          {w.button}
        </button>
        {asked ? <span className="faint">{askedWords(asked)}</span> : lastTest ? <span className="faint">Test sent {dayWords(lastTest.at.slice(0, 10))}</span> : null}
      </span>
      <div id={id} popover="auto" className="pj-pop pj-reqcard">
        <div className="pj-pop-h">
          <strong>{w.title}</strong>
          <span>
            {name}
            {deal ? ` · ${deal}` : ""}
          </span>
          <button type="button" className="pj-x" popoverTarget={id} popoverTargetAction="hide" aria-label="Close">
            ×
          </button>
        </div>
        <div className="pj-req-body">
          {!live && <p className="pj-test">Test: this goes to your own GHL contact, not the customer, so you can read it. Settings, Payment requests turns it on for customers.</p>}
          <div className="pj-req-nums">
            <span><span className="k">Contract</span>{cad(plan.total)}</span>
            <span><span className="k">Paid</span>{cad(plan.paid)}</span>
            <span className="due"><span className="k">{kind === "second" ? "Due now" : "Balance"}</span>{cad(due)}</span>
          </div>
          <p className="faint">
            {kind === "final" ? "The invoice or receipt is refreshed with today's payments and attached. " : "Asks for every payment due by the first day on site that isn't in yet. "}
            The amount is checked again against Notion before it goes.
          </p>
          <label className="pj-req-as">
            <span className="k">Send as</span>
            <select value={asWho} onChange={(e) => setAsWho(e.target.value)}>
              <option value={OFFICE}>Office{senders?.office ? ` (${senders.office})` : ""}</option>
              {(senders?.people ?? []).map((p) => (
                <option key={p.email} value={p.email}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <p className="faint">{pm ? `CC ${pm.name} (${pm.email}), the project's PM${live ? "" : ", once requests go to customers"}.` : "No PM on the Notion project to cc."}</p>
          <div className="pj-req-ch" role="group" aria-label="Send by">
            <label><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email</label>
            <label><input type="checkbox" checked={text} onChange={(e) => setText(e.target.checked)} /> Text, from {asWho === OFFICE ? "the office's" : "their own"} number</label>
          </div>
          {asked && <p className="faint">{askedWords(asked)}.</p>}
          {msg && <p className={msg.ok ? "pj-ok" : "pj-bad"} role="status">{msg.text}</p>}
        </div>
        <div className="pj-req-f">
          <button type="button" className="btn" popoverTarget={id} popoverTargetAction="hide">Close</button>
          <button type="button" className="btn primary" onClick={send} disabled={busy || due <= 0 || (!email && !text)}>
            {busy ? "Sending…" : `${live ? "Send request" : "Send test"} · ${cad(due)}`}
          </button>
        </div>
      </div>
    </>
  );
}


/**
 * +C/O, the quick change order (Albert, 2026-11-27: "make the Change wording to +C/O"; the mockup's card): add work or a
 * credit, line by line, to the project's change. Saved as a draft on the change (the open one, else the next), to review
 * and send for the record on the quote page, as every change goes.
 */
export function ChangeOrder({ id, versionId, name, paid }: { id: string; versionId: string; name: string; paid: number | null }) {
  const [picks, setPicks] = useState<CoPick[] | null>(null);
  const [lines, setLines] = useState<CoLine[]>([]);
  const [credit, setCredit] = useState(false);
  const [section, setSection] = useState<string>("Install");
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [uom, setUom] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; versionId?: string } | null>(null);
  const load = () => {
    if (!picks) coPicksAction().then(setPicks).catch(() => setPicks([]));
  };
  const pick = (picks ?? []).find((p) => p.label === item) ?? null;
  const choose = (v: string) => {
    setItem(v);
    const p = (picks ?? []).find((x) => x.label === v);
    if (p) {
      if (p.uom) setUom(p.uom);
      if (p.rate !== null) setRate(String(p.rate));
      if (p.stairs) setSection("Stairs");
    }
  };
  const n = (s: string) => Number(s.replace(/[$,\s]/g, ""));
  const draft: CoLine = { section, entryKey: !credit && pick ? pick.key : null, description: item.trim(), qty: n(qty), uom: uom.trim() || null, rate: n(rate), credit };
  const draftOk = draft.description && draft.qty > 0 && draft.rate > 0;
  const add = () => {
    if (!draftOk) return;
    setLines((ls) => [...ls, draft]);
    setItem("");
    setQty("1");
    setUom("");
    setRate("");
    setMsg(null);
  };
  const total = lines.reduce((a, l) => a + coLineAmount(l), 0);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    const r = await quickChangeAction(versionId, { lines }).catch(() => ({ ok: false as const, message: "The C/O couldn't be saved. Try again, or use the full editor." }));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    setLines([]);
    const was = r.before !== null ? `${cad(r.before)} to ` : "";
    const left = paid !== null ? `; final payment now ${cad(Math.max(0, r.after - paid))}` : "";
    setMsg({ ok: true, versionId: r.versionId, text: `Saved on the change as a draft: contract ${was}${cad(r.after)}, HST in${left}. Review it and send it for the record.` });
  };
  return (
    <>
      <button type="button" className="btn small" popoverTarget={id} onClick={load}>
        +C/O
      </button>
      <div id={id} popover="auto" className="pj-pop pj-reqcard pj-co">
        <div className="pj-pop-h">
          <strong>Change order</strong>
          <span>{name}</span>
          <button type="button" className="pj-x" popoverTarget={id} popoverTargetAction="hide" aria-label="Close">
            ×
          </button>
        </div>
        <div className="pj-req-body">
          <p className="pj-test pj-info-note">Changes after the yes are taken as accepted and sent for the record. Talk it through with the customer first.</p>
          <div className="pj-co-form">
            <div role="group" aria-label="Kind of line" className="pj-co-kind">
              <button type="button" className="ql-f" aria-pressed={!credit} onClick={() => setCredit(false)}>Add work</button>
              <button type="button" className="ql-f" aria-pressed={credit} onClick={() => setCredit(true)}>Credit</button>
            </div>
            <label className="pj-req-as">
              <span className="k">Section</span>
              <select value={section} onChange={(e) => setSection(e.target.value)}>
                {CO_SECTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="pj-req-as">
              <span className="k">{credit ? "What is credited" : "Item, from the Rate Card or typed"}</span>
              <input list={`${id}-picks`} value={item} onChange={(e) => choose(e.target.value)} placeholder={picks === null ? "Loading the Rate Card…" : "Start typing"} />
              <datalist id={`${id}-picks`}>
                {(credit ? [] : picks ?? []).map((p) => (
                  <option key={p.key} value={p.label} />
                ))}
              </datalist>
            </label>
            <div className="pj-co-nums">
              <label className="pj-req-as"><span className="k">Qty</span><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
              <label className="pj-req-as"><span className="k">Unit</span><input value={uom} onChange={(e) => setUom(e.target.value)} /></label>
              <label className="pj-req-as"><span className="k">Rate</span><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
              <button type="button" className="btn" onClick={add} disabled={!draftOk}>
                Add {draftOk ? cad(coLineAmount(draft)) : ""}
              </button>
            </div>
          </div>
          {lines.length > 0 && (
            <ul className="pj-co-lines">
              {lines.map((l, i) => (
                <li key={i}>
                  <span className={`sign${l.credit ? " credit" : ""}`} aria-hidden>{l.credit ? "−" : "+"}</span>
                  <span className="what">
                    <span>{l.credit ? `Credit: ${l.description}` : l.description}</span>
                    <span className="faint">{l.section} · {l.qty} {l.uom ?? ""} × {cad(l.rate)}</span>
                  </span>
                  <span className="amt">{cad(coLineAmount(l))}</span>
                  <button type="button" className="pj-x" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</button>
                </li>
              ))}
              <li className="sum">
                <span className="what">This C/O, before HST</span>
                <span className="amt">{cad(total)}</span>
              </li>
            </ul>
          )}
          {msg && (
            <p className={msg.ok ? "pj-ok" : "pj-bad"} role="status">
              {msg.text}{" "}
              {msg.versionId && (
                <>
                  <a href={`/q/${msg.versionId}`}>Review and send</a> · <a href={`/q/${msg.versionId}/edit`}>Full editor</a>
                </>
              )}
            </p>
          )}
        </div>
        <div className="pj-req-f">
          <button type="button" className="btn" popoverTarget={id} popoverTargetAction="hide">Close</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy || lines.length === 0}>
            {busy ? "Saving…" : "Save C/O"}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * The project's line under its row on the Won and Complete views: when it started or ended, the walkthrough and work
 * orders (Complete), the contract, paid and what is left or due now, Notion's Ready to Collect, and the plan.
 */
export function ProjectLine({ id, p, plan, today, name, view, request, coVersionId }: { id: string; p: ProjectStatus; plan: PlanProgress | null; today: string; name: string; view: "won" | "complete"; coVersionId?: string | null; request?: { kind: RequestKind; versionId: string; requests: PaymentRequest[]; live: boolean; onDone: () => void } | null }) {
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
      {coVersionId && <ChangeOrder id={`co-${id}`} versionId={coVersionId} name={name} paid={plan?.paid ?? null} />}
      {request && plan && <RequestPayment id={`req-${id}`} kind={request.kind} versionId={request.versionId} plan={plan} name={name} deal={p.deal} pm={p.pm} requests={request.requests} live={request.live} onDone={request.onDone} />}
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
export function CollectStrip({ view, left, ready, requested, waiting, second, starting, read, onRefresh, busy }: { view: "won" | "complete"; left: CollectTotals; ready: CollectTotals; requested: CollectTotals; waiting: CollectTotals; second: CollectTotals; starting: number; read: string; onRefresh: () => void; busy: boolean }) {
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
          <div className="qp-t">
            <span className="k">Requested, not paid</span>
            <span className="big">{n(requested)}</span>
            <span className="sub">final payment asked from the app</span>
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
