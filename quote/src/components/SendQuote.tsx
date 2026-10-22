"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendQuoteAction } from "@/app/q/[id]/actions";

/**
 * Send this version to the customer through GHL: email (link + PDF) and/or text (link). Two
 * steps, like Confirm address: the second says exactly who gets what, because a sent version
 * is locked. Once sent, the card shows how and when, and the customer's link to copy.
 */

export type SentInfo = { sentAt: string | null; sentBy: string | null; sentTo: string | null; validUntil: string | null; link: string | null };

const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : null;

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="sq-link">
      <input className="in" readOnly value={link} aria-label="Customer link" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* the field is selectable as a fallback */
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <a className="btn small" href={link} target="_blank" rel="noreferrer">Open</a>
    </div>
  );
}

export function SendQuote({
  versionId,
  label,
  status,
  base,
  today,
  defaultUntil,
  maxUntil,
  firstName,
  email,
  phone,
  problems,
  ready,
  sent,
  preliminary,
}: {
  versionId: string;
  label: string;
  status: string | null;
  base: string;
  today: string;
  defaultUntil: string;
  maxUntil: string;
  firstName: string | null;
  email: string | null;
  phone: string | null;
  problems: string[];
  ready: { ready: boolean; why: string | null };
  sent: SentInfo | null;
  /** A preliminary has no good-until date (Albert, 2026-10-22): the field is not shown and none is sent. */
  preliminary: boolean;
}) {
  const router = useRouter();
  const [until, setUntil] = useState(defaultUntil);
  const [byEmail, setByEmail] = useState(!!email);
  const [bySms, setBySms] = useState(!!phone);
  /** What the customer gets: the lump sum, always the default, or the breakdown (Albert, 2026-10-22). */
  const [breakdown, setBreakdown] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<{ message: string; problems?: string[] } | null>(null);
  const [done, setDone] = useState<{ link: string; sentTo: string[]; warning: string | null } | null>(null);
  const [sending, startSend] = useTransition();
  const q = [preliminary ? null : `until=${until}`, breakdown ? "itemised=1" : null].filter(Boolean).join("&");
  const preview = `/q/${versionId}/preview${q ? `?${q}` : ""}`;
  const pdf = `/q/${versionId}/pdf${q ? `?${q}` : ""}`;

  if (status !== "Draft" || done) {
    const s = done ? { sentAt: today, sentBy: null, sentTo: done.sentTo.join(", "), validUntil: preliminary ? null : until, link: done.link } : sent;
    return (
      <section className="card sq" id="send" aria-labelledby="sq-h">
        <div className="card-h" id="sq-h">
          Sent to customer
          {status && !done && <span className="right">{status}</span>}
        </div>
        <div className="card-b">
          {s?.sentAt ? (
            <p className="sq-what">
              Sent {day(s.sentAt)}
              {s.sentTo ? ` by ${s.sentTo.toLowerCase().replace(", ", " and ")}` : ""}
              {s.sentBy ? <span className="faint sq-by">{s.sentBy}</span> : null}
              {s.validUntil && <span className="sq-until">Good until {day(s.validUntil)}</span>}
            </p>
          ) : (
            <p className="faint">This version is {status ?? "not a draft"}. To send changes, save them as a new version.</p>
          )}
          {done?.warning && <p className="sq-msg warn" role="status">{done.warning}</p>}
          {s?.link && <CopyLink link={s.link} />}
          <div className="sq-tools">
            <a href={`/q/${versionId}/preview`} target="_blank" rel="noreferrer">What the customer sees</a>
            <a href={`/q/${versionId}/pdf`} target="_blank" rel="noreferrer">PDF</a>
          </div>
        </div>
      </section>
    );
  }

  const channels = [byEmail && email ? `email (${email})` : null, bySms && phone ? `text (${phone})` : null].filter(Boolean);
  const blocked = problems.length > 0 || !ready.ready;

  function send() {
    setError(null);
    startSend(async () => {
      const r = await sendQuoteAction(versionId, { base, validUntil: preliminary ? null : until, channels: { email: byEmail, sms: bySms }, itemised: breakdown });
      setAsking(false);
      if (r.ok) {
        setDone(r);
        router.refresh();
      } else setError({ message: r.message, problems: r.problems });
    });
  }

  return (
    <section className="card sq" id="send" aria-labelledby="sq-h">
      <div className="card-h" id="sq-h">Send to customer</div>
      <div className="card-b">
        {problems.length > 0 && (
          <div className="sq-msg warn">
            <b>Not ready to send</b>
            <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {!ready.ready && <p className="sq-msg warn">{ready.why}</p>}

        <fieldset className="sq-ch" disabled={sending || asking}>
          <legend className="sr-only">Send by</legend>
          <label className={email ? undefined : "off"}>
            <input type="checkbox" checked={byEmail && !!email} disabled={!email} onChange={(e) => setByEmail(e.target.checked)} />
            <span>
              Email <span className="faint">{email ?? "no email in GHL"}</span>
              {email && <span className="sub">Link and PDF</span>}
            </span>
          </label>
          <label className={phone ? undefined : "off"}>
            <input type="checkbox" checked={bySms && !!phone} disabled={!phone} onChange={(e) => setBySms(e.target.checked)} />
            <span>
              Text <span className="faint">{phone ?? "no phone in GHL"}</span>
              {phone && <span className="sub">Link</span>}
            </span>
          </label>
        </fieldset>

        <fieldset className="sq-ch" disabled={sending || asking}>
          <legend className="sr-only">What the customer sees</legend>
          <label>
            <input type="radio" name="sq-pricing" checked={!breakdown} onChange={() => setBreakdown(false)} />
            <span>
              Lump sum only
              <span className="sub">What the work includes and one price. Quantities on install, removal, prep and materials; no line prices.</span>
            </span>
          </label>
          <label>
            <input type="radio" name="sq-pricing" checked={breakdown} onChange={() => setBreakdown(true)} />
            <span>
              Send breakdown
              <span className="sub">Every line with its unit price and amount, section totals and the discount.</span>
            </span>
          </label>
        </fieldset>

        {preliminary ? (
          <p className="note">A preliminary has no good-until date: it is an estimate, not an offer, and its link stays open.</p>
        ) : (
        <label className="sq-until-in">
          Good until
          <input className="in" type="date" value={until} min={today} max={maxUntil} onChange={(e) => setUntil(e.target.value)} disabled={sending || asking} />
        </label>
        )}

        <div className="sq-tools">
          <a href={preview} target="_blank" rel="noreferrer">Preview what the customer sees</a>
          <a href={pdf} target="_blank" rel="noreferrer">PDF</a>
        </div>

        {error && (
          <div className="sq-msg bad" role="alert">
            <b>{error.message}</b>
            {error.problems && <ul>{error.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
        )}

        {asking ? (
          <div className="ca sq-ask" role="group" aria-label="Confirm sending">
            <p>
              Send <b>{label}</b> to {firstName ?? "the customer"} by {channels.join(" and ")}?
              <span className="faint"> The version is locked once it is sent.</span>
            </p>
            <div className="ca-btns">
              <button type="button" className="btn small" onClick={() => setAsking(false)} disabled={sending}>Cancel</button>
              <button type="button" className="btn small primary" onClick={send} disabled={sending}>
                {sending ? "Sending…" : "Yes, send it"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn primary sq-go" disabled={blocked || channels.length === 0 || (!preliminary && !until)} onClick={() => setAsking(true)}>
            Send quote
          </button>
        )}
      </div>
    </section>
  );
}
