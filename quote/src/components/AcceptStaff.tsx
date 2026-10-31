"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptForCustomerAction, cancelAcceptanceAction, makeChangeAction, retryHandoffAction } from "@/app/q/[id]/actions";
import type { Acceptance } from "@/lib/accept/plan";
import { termsLabel } from "@/lib/accept/terms";
import { money } from "@/lib/format";
import { isAddition, partKeys, partWords } from "@/lib/send/copy";

/**
 * Acceptance on the staff quote page (Albert, 2026-10-27). Two cards:
 * - on a measured version out with the customer: **Accept with customer** (their own link, opened
 *   on the store tablet, which also takes a drawn signature) and **Record acceptance for them**
 *   (only with a reason saying where their written yes is);
 * - on an accepted version: what was accepted, the hand-off to GHL and Notion, Retry, Make a
 *   change and Cancel acceptance.
 */

export type StaffAcceptOption = { index: number; name: string; subtotal: number; part: string; addOns: { key: string; description: string; amount: number }[] };

export function AcceptForCustomer({
  versionId,
  link,
  options,
  customerName,
  terms,
  off,
}: {
  versionId: string;
  /** The customer's link; null when this deployment has no customer address. */
  link: string | null;
  options: StaffAcceptOption[];
  customerName: string | null;
  /** The Project Expectations the customer agrees to today; null while acceptance is off. */
  terms: { id: string; label: string } | null;
  /** Why acceptance is off on this deployment; null when it is on. */
  off: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // One option per Part (2026-10-30; per scope before then); nothing starts chosen unless there is one option.
  const parts = partKeys(options);
  const [picks, setPicks] = useState<number[]>(options.length === 1 ? [options[0].index] : []);
  const [ticked, setTicked] = useState<string[]>([]);
  const [name, setName] = useState(customerName ?? "");
  const [reason, setReason] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad: boolean; problems?: string[] } | null>(null);
  const chosen = options.filter((x) => picks.includes(x.index));
  const choose = (part: string, index: number) => {
    const next = [...options.filter((x) => x.part !== part && picks.includes(x.index)).map((x) => x.index), ...(index >= 0 ? [index] : [])];
    setPicks(next);
    setTicked(ticked.filter((k) => next.some((i) => k.startsWith(`${i}.`))));
  };

  const submit = () => {
    if (chosen.length === 0) return;
    setMsg(null);
    start(async () => {
      const r = await acceptForCustomerAction(versionId, { optionIndexes: picks, addOns: ticked, name, terms: agreed, termsId: terms?.id ?? null, signature: null, reason });
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
                {options.length > 1 &&
                  parts.map((part) => (
                    <label key={part}>
                      {isAddition(part) ? "Addition" : parts.length > 1 ? partWords(part).label : "Option"}
                      <select value={options.find((x) => x.part === part && picks.includes(x.index))?.index ?? -1} onChange={(e) => choose(part, Number(e.target.value))}>
                        <option value={-1}>{isAddition(part) ? "Not added" : parts.length > 1 ? partWords(part).none : "Choose…"}</option>
                        {options
                          .filter((x) => x.part === part)
                          .map((x) => (
                            <option key={x.index} value={x.index}>
                              Option {x.index + 1}: {x.name} · {money(x.subtotal)} before HST
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                {chosen.flatMap((x) => x.addOns).map((a) => (
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
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> They have the Project Expectations{terms ? ` (${terms.label})` : ""} and agree to them
                </label>
                <button type="button" className="btn primary" disabled={busy || chosen.length === 0 || !agreed || !reason.trim() || name.trim().length < 2} onClick={submit}>
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
        <div className="acc-grp">
          <h4>Price</h4>
          <dl className="acc-dl">
            <div><dt>Price before HST</dt><dd>{money(a.totals.subtotal)}</dd></div>
            <div><dt>HST</dt><dd>{money(a.totals.hst)}</dd></div>
            <div className="tot"><dt>Total with HST</dt><dd>{money(a.totals.total)}</dd></div>
          </dl>
        </div>
        {a.stages.length > 0 && (
          <div className="acc-grp">
            <h4>Payments</h4>
            <dl className="acc-dl">
              {a.stages.map((s, i) => (
                <div key={i} className={i === 0 ? "dep" : undefined}>
                  <dt>
                    {s.label}
                    {s.when && <span className="when">{s.when}</span>}
                  </dt>
                  <dd>{money(s.amount)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div className="acc-grp">
          <h4>Project Expectations</h4>
          <p className="acc-line">{termsLabel(a.terms)}</p>
          {a.signature && (
            <svg className="acc-sig" viewBox="0 0 1000 300" role="img" aria-label={`${a.name}'s signature`}>
              <path d={a.signature} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        {a.cancelled ? (
          <p className="banner warn">Cancelled by {a.cancelled.by}: {a.cancelled.reason}</p>
        ) : (
          <div className="acc-grp">
            <h4>Hand-off</h4>
            <ul className="handoff">
              <li className={h?.ghl === "done" ? "good" : "warn"}>{h?.ghl === "done" ? (a.base ? "GHL: value updated to the new total" : "GHL: Project Won") : `GHL not moved yet${h?.ghlMessage ? `: ${h.ghlMessage}` : ""}`}</li>
              <li className={projectNumber ? "good" : "faint"}>{projectNumber ? `Notion project ${projectNumber}` : "Notion project: waiting for its PP number"}</li>
              <li className={h?.told.length ? "good" : "warn"}>{h?.told.length ? `Customer told by ${h.told.join(" and ").toLowerCase()}` : "Customer not told yet"}{h?.tellFailed ? ` (${h.tellFailed})` : ""}</li>
            </ul>
          </div>
        )}
        {links.length > 0 && (
          <div className="acc-grp">
            <h4>Links</h4>
            <ul className="acc-links">
              {links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noreferrer">
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
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
          <p>Edit it, then send it from the Send card. The customer gets the updated quote with what changed at the top, for their records; GHL&apos;s value follows the new total. The payment schedule is worked out again on the new total.</p>
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

/**
 * Put on contract (Albert, 2026-10-30: one working quote, "On a contract basis, I will select which options from
 * there I would like to go for"). On an option that isn't on the contract, in a Part that is: opens the change (Make
 * a change, or the one already open) with this option chosen in Swap option. Nothing is saved until the change is.
 */
export function PutOnContract({ contractVersionId, optionId, part }: { contractVersionId: string; optionId: string; part: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <p className="put-contract">
      <button
        type="button"
        className="btn"
        disabled={busy}
        title={`Opens a change to the accepted quote with this option in place of the ${part.toLowerCase()} option on the contract. It goes to the customer for their records.`}
        onClick={() =>
          start(async () => {
            const r = await makeChangeAction(contractVersionId);
            if (r.ok) router.push(`/q/${r.versionId}/edit?swap=${optionId}`);
            else setMsg(r.message);
          })
        }
      >
        {busy ? "Opening…" : "Put on contract"}
      </button>
      <span className="faint"> in place of the {part.toLowerCase()} option the customer has</span>
      {msg && <span className="banner warn">{msg}</span>}
    </p>
  );
}
