"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { emailBillingAction, issueBillingAction } from "@/app/q/[id]/actions";
import type { BillingState } from "@/lib/quotes/billing";

/**
 * The project's invoice or receipt (Albert, 2026-10-30), on its contract version. An invoice when HST is on every
 * line (INV-82571…), a receipt otherwise (R-10245…). The number is issued the first time it is exported and kept
 * after; each export reads the payments again. Staff only.
 *
 * 2026-10-31: invoice and receipt switch back and forth with the contract's HST, each keeping its number on file;
 * exporting marks void the other one only if the customer was emailed it (said here before it happens). An overpayment is shown on the PDF as Paid in full unless staff tick
 * "Show the credit".
 */

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", year: "numeric" }) : null);

export function BillingCard({ versionId, s }: { versionId: string; s: BillingState }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [showCredit, setShowCredit] = useState(s.creditShown);
  const word = s.title.toLowerCase();
  const blocked = s.payments === null;
  const hidden = Boolean(s.credit) && !showCredit;

  function go(email: boolean) {
    setMsg(null);
    start(async () => {
      const r = email ? await emailBillingAction(versionId, { showCredit }) : await issueBillingAction(versionId, { showCredit });
      setAsking(false);
      if (!r.ok) return setMsg({ text: r.message, bad: true });
      const voided = r.voided.length ? ` ${r.voided.join(", ")} is now void.` : "";
      setMsg({ text: `${r.title} ${r.number} ${email ? "emailed" : "ready"}, with ${r.payments} payment${r.payments === 1 ? "" : "s"}.${voided}${r.warning ? ` ${r.warning}` : ""}`, bad: false });
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
        {s.willVoid.length > 0 && (
          <p className="sq-msg warn">
            The customer was emailed {s.willVoid.join(", ")}, but the contract now makes it {s.kind === "invoice" ? "an invoice" : "a receipt"}. {s.number ? "Updating" : "Creating"} the {word} marks {s.willVoid.length === 1 ? "it" : "them"} void: the old PDF says so and the {word} says what it replaces.
          </p>
        )}
        {s.willRestore && <p className="sq-msg warn">{s.number} was void; the contract makes it {s.kind === "invoice" ? "an invoice" : "a receipt"} again, so updating it makes it current again.</p>}
        {s.background.length > 0 && <p className="faint bill-note">{s.background.join(", ")} stays on file in the background (never emailed). It comes back if the HST changes back.</p>}
        {s.voided.filter((v) => !(s.willRestore && v.number === s.number)).map((v) => (
          <p key={v.number} className="faint bill-note">{v.number} is void, replaced by {v.replacedBy} on {day(`${v.on}T12:00:00`)}.</p>
        ))}
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
            {Boolean(s.credit) && (
              <label className="bill-credit">
                <input type="checkbox" checked={showCredit} disabled={busy} onChange={(e) => setShowCredit(e.target.checked)} />
                <span>Show the {cad.format(s.credit ?? 0)} credit on the PDF</span>
              </label>
            )}
            {hidden && <p className="faint bill-note">The PDF and email say Paid in full, with no payment amounts listed.</p>}
            {Boolean(s.credit) && s.number && showCredit !== s.creditShown && <p className="faint bill-note">Update the PDF (or email it) to apply this.</p>}
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
