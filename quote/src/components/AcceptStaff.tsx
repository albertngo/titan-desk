"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptForCustomerAction, cancelAcceptanceAction, makeChangeAction, retryHandoffAction } from "@/app/q/[id]/actions";
import type { Acceptance } from "@/lib/accept/plan";
import { money } from "@/lib/format";

/**
 * Acceptance on the staff quote page (Albert, 2026-10-27). Two cards:
 * - on a measured version out with the customer: **Accept with customer** (their own link, opened
 *   on the store tablet, which also takes a drawn signature) and **Record acceptance for them**
 *   (only with a reason saying where their written yes is);
 * - on an accepted version: what was accepted, the hand-off to GHL and Notion, Retry, Make a
 *   change and Cancel acceptance.
 */

export type StaffAcceptOption = { index: number; name: string; subtotal: number; addOns: { key: string; description: string; amount: number }[] };

export function AcceptForCustomer({
  versionId,
  link,
  options,
  customerName,
  termsVersion,
  off,
}: {
  versionId: string;
  /** The customer's link; null when this deployment has no customer address. */
  link: string | null;
  options: StaffAcceptOption[];
  customerName: string | null;
  termsVersion: string | null;
  /** Why acceptance is off on this deployment; null when it is on. */
  off: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(options.length === 1 ? 0 : -1);
  const [ticked, setTicked] = useState<string[]>([]);
  const [name, setName] = useState(customerName ?? "");
  const [reason, setReason] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad: boolean; problems?: string[] } | null>(null);
  const o = options.find((x) => x.index === index) ?? null;

  const submit = () => {
    if (!o) return;
    setMsg(null);
    start(async () => {
      const r = await acceptForCustomerAction(versionId, { optionIndex: o.index, addOns: ticked, name, terms: agreed, signature: null, reason });
      if (r.ok) {
        setMsg({ text: r.warning ? `Recorded. ${r.warning}` : "Recorded. GHL is at Project Won and the customer has the accepted quote.", bad: Boolean(r.warning) });
        router.refresh();
      } else setMsg({ text: r.message, bad: true, problems: r.problems });
    });
  };

  return (
    <section className="card accept-card" aria-labelledby="acc-staff-h">
      <div className="card-h" id="acc-staff-h">
        Acceptance
      </div>
      <div className="card-b">
        {off ? (
          <p className="faint">{off}</p>
        ) : (
          <>
            <p className="acc-actions">
              {link && (
                <a className="btn primary" href={`${link}?store=1`} target="_blank" rel="noreferrer" title="Opens their link in store mode: hand the tablet over, they tick, type their name and sign.">
                  Accept with customer ↗
                </a>
              )}
              <button type="button" className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>
                Record acceptance for them
              </button>
            </p>
            {open && (
              <div className="form acc-form">
                <p className="faint">For a yes in writing that didn&apos;t come through their link: a signed paper, an email. Say where it is.</p>
                {options.length > 1 && (
                  <label>
                    Option
                    <select value={index} onChange={(e) => (setIndex(Number(e.target.value)), setTicked([]))}>
                      <option value={-1}>Choose…</option>
                      {options.map((x) => (
                        <option key={x.index} value={x.index}>
                          Option {x.index + 1}: {x.name} · {money(x.subtotal)} before HST
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {o?.addOns.map((a) => (
                  <label key={a.key} className="check-in">
                    <input type="checkbox" checked={ticked.includes(a.key)} onChange={(e) => setTicked(e.target.checked ? [...ticked, a.key] : ticked.filter((k) => k !== a.key))} /> Add {a.description} (+ {money(a.amount)})
                  </label>
                ))}
                <label>
                  Customer&apos;s full name
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                </label>
                <label>
                  How they said yes, and where the written yes is
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} placeholder="e.g. Signed the printed quote in store; scan in the job folder" />
                </label>
                <label className="check-in">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> They have the Project Expectations{termsVersion ? ` (version ${termsVersion})` : ""} and agree to them
                </label>
                <button type="button" className="btn primary" disabled={busy || !o || !agreed || !reason.trim() || name.trim().length < 2} onClick={submit}>
                  {busy ? "Recording…" : "Record acceptance"}
                </button>
              </div>
            )}
          </>
        )}
        {msg && (
          <div className={`banner ${msg.bad ? "warn" : "ok"}`} role="status">
            {msg.text}
            {msg.problems && (
              <ul>
                {msg.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

const METHOD: Record<Acceptance["method"], string> = { link: "on their link", store: "in store, signed", staff: "recorded by staff" };

export function AcceptedCard({
  versionId,
  a,
  when,
  projectNumber,
  links,
  canChange,
  current,
}: {
  versionId: string;
  a: Acceptance;
  /** "Wednesday, November 4, 2026 at 2:14 pm". */
  when: string;
  projectNumber: string | null;
  links: { label: string; href: string }[];
  /** Make a change can start from this version: it is the contract now. */
  canChange: boolean;
  /** This version is still the contract. */
  current: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const h = a.handoff;

  const retry = () =>
    start(async () => {
      const r = await retryHandoffAction(versionId);
      setMsg(r.ok ? { text: r.warning ?? "Done: GHL is at Project Won and the customer has the accepted quote.", bad: Boolean(r.warning) } : { text: r.message, bad: true });
      router.refresh();
    });
  const cancel = () => {
    const reason = window.prompt("Why is this acceptance cancelled? (The customer backed out, the deposit never came…)");
    if (!reason?.trim()) return;
    start(async () => {
      const r = await cancelAcceptanceAction(versionId, reason);
      setMsg(r.ok ? { text: `Cancelled. ${r.ghl} If a Notion project was made, archive it there.`, bad: false } : { text: r.message, bad: true });
      router.refresh();
    });
  };

  return (
    <section className="card accept-card done" aria-labelledby="acc-done-h">
      <div className="card-h" id="acc-done-h">
        {a.cancelled ? "Acceptance cancelled" : "Accepted"}
        {projectNumber && <span className="right chip good">{projectNumber}</span>}
      </div>
      <div className="card-b">
        <p>
          <b>{a.name}</b> accepted <b>{a.option.name}</b> {METHOD[a.method]} on {when}.
        </p>
        {a.reason && <p className="faint">{a.reason}</p>}
        {a.addOns.length > 0 && <p>Added: {a.addOns.map((x) => `${x.description} (${money(x.amount)})`).join(", ")}</p>}
        <dl className="acc-dl">
          <div><dt>Price before HST</dt><dd>{money(a.totals.subtotal)}</dd></div>
          <div><dt>Total with HST</dt><dd>{money(a.totals.total)}</dd></div>
          {a.stages.map((s, i) => (
            <div key={i}><dt>{s.label}</dt><dd>{money(s.amount)}</dd></div>
          ))}
          <div><dt>Project Expectations</dt><dd>version {a.terms}</dd></div>
        </dl>
        {a.signature && (
          <svg className="acc-sig" viewBox="0 0 1000 300" role="img" aria-label={`${a.name}'s signature`}>
            <path d={a.signature} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {a.cancelled ? (
          <p className="banner warn">Cancelled by {a.cancelled.by}: {a.cancelled.reason}</p>
        ) : (
          <ul className="handoff">
            <li className={h?.ghl === "done" ? "good" : "warn"}>{h?.ghl === "done" ? "GHL: Project Won" : `GHL not moved yet${h?.ghlMessage ? `: ${h.ghlMessage}` : ""}`}</li>
            <li className={projectNumber ? "good" : "faint"}>{projectNumber ? `Notion project ${projectNumber}` : "Notion project: waiting for its PP number"}</li>
            <li className={h?.told.length ? "good" : "warn"}>{h?.told.length ? `Customer told by ${h.told.join(" and ").toLowerCase()}` : "Customer not told yet"}{h?.tellFailed ? ` (${h.tellFailed})` : ""}</li>
          </ul>
        )}
        {links.length > 0 && (
          <p className="acc-links">
            {links.map((l, i) => (
              <span key={l.href}>
                {i > 0 && " · "}
                <a href={l.href} target="_blank" rel="noreferrer">
                  {l.label} ↗
                </a>
              </span>
            ))}
          </p>
        )}
        {!a.cancelled && current && (
          <p className="acc-actions">
            {canChange && (
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                title="A new version from the contract as it stands. Edit it, then send it: the customer gets the updated quote with what changed at the top, for their records."
                onClick={() =>
                  start(async () => {
                    const r = await makeChangeAction(versionId);
                    if (r.ok) router.push(`/q/${r.versionId}/edit`);
                    else setMsg({ text: r.message, bad: true });
                  })
                }
              >
                Make a change
              </button>
            )}
            {(h?.ghl !== "done" || !h?.told.length) && (
              <button type="button" className="btn" disabled={busy} onClick={retry}>
                {busy ? "Working…" : "Retry hand-off"}
              </button>
            )}
            <button type="button" className="linkbtn danger" disabled={busy} onClick={cancel}>
              Cancel acceptance
            </button>
          </p>
        )}
        {msg && (
          <p className={`banner ${msg.bad ? "warn" : "ok"}`} role="status">
            {msg.text}
          </p>
        )}
      </div>
    </section>
  );
}

/** A change after acceptance (2026-10-27), on its own page: what it is, and Make a change once it is the contract. */
export function ChangeCard({ versionId, changeNo, status, sentAt, current }: { versionId: string; changeNo: number; status: string | null; sentAt: string | null; current: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="card accept-card" aria-labelledby="chg-staff-h">
      <div className="card-h" id="chg-staff-h">
        Change {changeNo} to the accepted quote
      </div>
      <div className="card-b">
        {status === "Draft" ? (
          <p>Edit it, then send it from the Send card. The customer gets the updated quote with what changed at the top, for their records; GHL&apos;s value follows the new total. The difference goes on the final payment.</p>
        ) : current ? (
          <p>Sent{sentAt ? ` ${sentAt}` : ""}. This is the contract now: GHL&apos;s value and the Notion project follow its total.</p>
        ) : (
          <p className="faint">A later change replaced this one.</p>
        )}
        {current && status !== "Draft" && (
          <p className="acc-actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const r = await makeChangeAction(versionId);
                  if (r.ok) router.push(`/q/${r.versionId}/edit`);
                  else setMsg(r.message);
                })
              }
            >
              Make another change
            </button>
          </p>
        )}
        {msg && <p className="banner warn">{msg}</p>}
      </div>
    </section>
  );
}
