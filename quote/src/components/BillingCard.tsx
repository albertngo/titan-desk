"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { emailBillingAction, issueBillingAction } from "@/app/q/[id]/actions";
import type { BillingState } from "@/lib/quotes/billing";

/**
 * The project's invoice or receipt (Albert, 2026-10-30), on its contract version. An invoice when HST is on every
 * line (INV-82571…), a receipt otherwise (R-10245…). The number is issued the first time it is exported and kept
 * after; each export reads the payments again. Staff only.
 */

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", year: "numeric" }) : null);

export function BillingCard({ versionId, s }: { versionId: string; s: BillingState }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const word = s.title.toLowerCase();
  const blocked = Boolean(s.conflict) || s.payments === null;

  function go(email: boolean) {
    setMsg(null);
    start(async () => {
      const r = email ? await emailBillingAction(versionId) : await issueBillingAction(versionId);
      setAsking(false);
      if (!r.ok) return setMsg({ text: r.message, bad: true });
      setMsg({ text: `${r.title} ${r.number} ${email ? "emailed" : "ready"}, with ${r.payments} payment${r.payments === 1 ? "" : "s"}.${r.warning ? ` ${r.warning}` : ""}`, bad: false });
      router.refresh();
    });
  }

  return (
    <section className="card bill" aria-labelledby="bill-h">
      <div className="card-h" id="bill-h">
        {s.title}
        {s.number && <span className="right">{s.number}</span>}
      </div>
      <div className="card-b">
        <p className="faint bill-why">{s.reason} {s.number ? `Issued ${day(s.issuedAt)}.` : `The number is issued the first time it's exported (${s.kind === "invoice" ? "INV-" : "R-"}…).`}</p>
        {s.conflict && <p className="sq-msg warn">{s.conflict}</p>}
        {s.payments === null ? (
          <p className="sq-msg warn">{s.paymentsProblem}</p>
        ) : (
          <>
            <dl className="bill-dl">
              <div><dt>Total</dt><dd>{cad.format(s.total)}</dd></div>
              {s.payments.map((p, i) => (
                <div key={i} className="bill-pay"><dt>{p.date ?? "no date"} · {p.method ?? "payment"}</dt><dd>{cad.format(p.amount)}</dd></div>
              ))}
              {s.payments.length === 0 && <div className="bill-pay"><dt>No payments linked to the project yet</dt><dd /></div>}
              <div className="bill-left"><dt>{s.credit ? "Credit" : s.balance ? "Balance owing" : "Paid in full"}</dt><dd>{cad.format((s.credit || s.balance) ?? 0)}</dd></div>
            </dl>
            <p className="faint bill-note">From the Master Payments Log: payments whose Projects is this project.</p>
          </>
        )}
        {msg && <p className={`sq-msg ${msg.bad ? "bad" : "ok"}`} role="status">{msg.text}</p>}
        {asking ? (
          <div className="bill-ask">
            <p>Email the {word} to <b>{s.email}</b>, the PDF attached?</p>
            <div className="sq-again-acts">
              <button type="button" className="btn primary small" disabled={busy} onClick={() => go(true)}>{busy ? "Sending…" : "Email it"}</button>
              <button type="button" className="btn small" disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="sq-again-acts">
            <button type="button" className="btn small" disabled={busy || blocked} onClick={() => go(false)}>{busy ? "Working…" : s.number ? "Update PDF" : `Create ${word}`}</button>
            {s.number && <a className="btn small" href={`/q/${versionId}/billing`} target="_blank" rel="noreferrer">Open PDF</a>}
            <button type="button" className="btn small" disabled={busy || blocked || !s.email} onClick={() => setAsking(true)} title={s.email ? undefined : "The GHL contact has no email"}>Email to customer…</button>
          </div>
        )}
        {s.lastSentAt && <p className="faint bill-note">Last emailed {day(s.lastSentAt)}{s.sentTo ? ` to ${s.sentTo}` : ""}.</p>}
      </div>
    </section>
  );
}
