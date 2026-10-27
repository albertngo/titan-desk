"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendQuoteAction } from "@/app/q/[id]/actions";
import { activityEntries, devicesSeen, whenWords } from "@/lib/activity/track";
import type { QuoteActivity } from "@/lib/quotes/types";

/**
 * Send this version to the customer through GHL: email (link + PDF) and/or text (link). Two
 * steps, like Confirm address: the second says exactly who gets what, because a sent version
 * is locked. Once sent, the card shows how and when, and the customer's link to copy.
 */

export type SentInfo = { sentAt: string | null; sentBy: string | null; sentTo: string | null; validUntil: string | null; link: string | null; activity?: QuoteActivity | null };

const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/**
 * What the customer did with the link (2026-10-27): opens, devices, PDF downloads, the last few
 * entries. A version sent before tracking began shows only what was seen since.
 */
function Activity({ a }: { a: QuoteActivity }) {
  if (!a.tracked && a.openedCount === 0 && a.pdfDownloads === 0) return null;
  const devices = devicesSeen(a.activityLog);
  const recent = activityEntries(a.activityLog).slice(-5).reverse();
  return (
    <div className="sq-act">
      {a.openedCount === 0 ? (
        <p className="sq-act-h">Not opened yet</p>
      ) : (
        <p className="sq-act-h">
          Opened {times(a.openedCount)}
          {devices.length > 0 && <span> on {devices.join(", ")}</span>}
          {a.lastOpenedAt && <span className="faint"> · last {whenWords(new Date(a.lastOpenedAt))}</span>}
        </p>
      )}
      <p className="faint sq-act-sub">{a.pdfDownloads ? `PDF downloaded ${times(a.pdfDownloads)}` : "PDF not downloaded"}</p>
      {recent.length > 0 && (
        <ul className="sq-act-log">
          {recent.map((e, i) => (
            <li key={i}>
              <span className="faint">{e.when}</span> {e.what} · {e.device}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
      {/* #staff: opening it from here is never counted as the customer's open (2026-10-27). */}
      <a className="btn small" href={`${link}#staff`} target="_blank" rel="noreferrer">Open</a>
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
  from,
  options,
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
  /** The address the email goes out from: the signed-in quoter's (2026-10-22); null = GHL's default sender. */
  from: string | null;
  /** The version's options, for choosing which go to the customer (2026-10-24); `range` is what a preliminary shows instead of `price` (2026-10-27). */
  options: { id: string; name: string; price: string; range: string | null; recommended: boolean; problem: string | null }[];
}) {
  const router = useRouter();
  const [until, setUntil] = useState(defaultUntil);
  const [byEmail, setByEmail] = useState(!!email);
  const [bySms, setBySms] = useState(!!phone);
  /** What the customer gets: the lump sum, always the default, or the breakdown (Albert, 2026-10-22). A preliminary is always a lump sum (2026-10-27). */
  const [breakdown, setBreakdown] = useState(false);
  const itemised = !preliminary && breakdown;
  /** A preliminary's price: the range, always the default, or the exact price (Albert, 2026-10-27). */
  const [range, setRange] = useState(true);
  const exact = preliminary && !range;
  /** Attach the PDF to the email (Albert, 2026-10-24): off by default, so opens and downloads go through the tracked quote page. */
  const [attachPdf, setAttachPdf] = useState(false);
  /** Which options go to the customer (2026-10-24): all of them unless the sender unticks some. */
  const [chosen, setChosen] = useState<string[]>(() => options.map((o) => o.id));
  const everyOption = chosen.length === options.length;
  const optionIds = everyOption ? null : chosen;
  const optionProblems = options.filter((o) => chosen.includes(o.id) && o.problem).map((o) => o.problem!);
  const allProblems = [...problems, ...(options.length > 0 && chosen.length === 0 ? ["Choose at least one option to send."] : []), ...optionProblems];
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<{ message: string; problems?: string[] } | null>(null);
  const [done, setDone] = useState<{ link: string; sentTo: string[]; warning: string | null } | null>(null);
  const [sending, startSend] = useTransition();
  const q = [preliminary ? null : `until=${until}`, itemised ? "itemised=1" : null, optionIds ? `options=${optionIds.join(",")}` : null, exact ? "range=0" : null].filter(Boolean).join("&");
  const preview = `/q/${versionId}/preview${q ? `?${q}` : ""}`;
  const pdf = `/q/${versionId}/pdf${q ? `?${q}` : ""}`;
  const eq = [q, attachPdf ? "pdf=1" : null].filter(Boolean).join("&");
  const emailPreview = `/q/${versionId}/preview/email${eq ? `?${eq}` : ""}`;

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
          {!done && sent?.activity && <Activity a={sent.activity} />}
          {s?.link && <CopyLink link={s.link} />}
          <div className="sq-tools">
            <a href={`/q/${versionId}/preview`} target="_blank" rel="noreferrer">What the customer sees</a>
            <a href={`/q/${versionId}/preview/email`} target="_blank" rel="noreferrer">The email</a>
            <a href={`/q/${versionId}/pdf`} target="_blank" rel="noreferrer">PDF</a>
          </div>
        </div>
      </section>
    );
  }

  const channels = [byEmail && email ? `email (${email})` : null, bySms && phone ? `text (${phone})` : null].filter(Boolean);
  const blocked = allProblems.length > 0 || !ready.ready;

  function send() {
    setError(null);
    startSend(async () => {
      const r = await sendQuoteAction(versionId, { base, validUntil: preliminary ? null : until, channels: { email: byEmail, sms: bySms }, itemised, attachPdf: byEmail && attachPdf, optionIds, range: !exact });
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
        {allProblems.length > 0 && (
          <div className="sq-msg warn">
            <b>Not ready to send</b>
            <ul>{allProblems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {!ready.ready && <p className="sq-msg warn">{ready.why}</p>}

        <fieldset className="sq-ch" disabled={sending || asking}>
          <legend className="sr-only">Send by</legend>
          <label className={email ? undefined : "off"}>
            <input type="checkbox" checked={byEmail && !!email} disabled={!email} onChange={(e) => setByEmail(e.target.checked)} />
            <span>
              Email <span className="faint">{email ?? "no email in GHL"}</span>
              {email && <span className="sub">{attachPdf ? "Link and PDF" : "Link"}{from ? `, from ${from}` : ", from the location's default address"}</span>}
            </span>
          </label>
          {email && byEmail && (
            <label className="sq-attach">
              <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} />
              <span>
                Attach PDF
                <span className="sub">{attachPdf ? "The file goes in the email too. Opening it is never tracked." : "Off: the customer downloads the PDF from the quote page, where it is tracked."}</span>
              </span>
            </label>
          )}
          <label className={phone ? undefined : "off"}>
            <input type="checkbox" checked={bySms && !!phone} disabled={!phone} onChange={(e) => setBySms(e.target.checked)} />
            <span>
              Text <span className="faint">{phone ?? "no phone in GHL"}</span>
              {phone && <span className="sub">Link</span>}
            </span>
          </label>
        </fieldset>

        {options.length > 1 && (
          <fieldset className="sq-opts" disabled={sending || asking}>
            <legend>Options to send <span className="faint">{everyOption ? "all" : `${chosen.length} of ${options.length}`}</span></legend>
            {options.map((o, i) => (
              <label key={o.id} className={chosen.includes(o.id) ? undefined : "off"}>
                <input
                  type="checkbox"
                  checked={chosen.includes(o.id)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? options.map((x) => x.id).filter((id) => id === o.id || c.includes(id)) : c.filter((id) => id !== o.id)))}
                />
                <span>
                  <span className="nm">{i + 1}. {o.name}{o.recommended ? <span className="rec"> · Recommended</span> : null}</span>
                  <span className="sub">{o.problem ?? (preliminary && !exact && o.range ? o.range : o.price)}</span>
                </span>
              </label>
            ))}
            {!everyOption && chosen.length > 0 && <p className="note">The customer sees only these, numbered from 1, on the page, the PDF, the email and the text.</p>}
          </fieldset>
        )}

        {/* A preliminary is always a lump sum (Albert, 2026-10-27); only a measured quote can go with the breakdown. */}
        {!preliminary && (
        <label className="sq-until-in" title="Lump sum: what the work includes and one price; quantities on install, removal, prep and materials, no line prices. Breakdown: every line with its unit price and amount, section totals and the discount.">
          Pricing shown
          <select className="in" value={breakdown ? "breakdown" : "lump"} onChange={(e) => setBreakdown(e.target.value === "breakdown")} disabled={sending || asking}>
            <option value="lump">Lump sum only</option>
            <option value="breakdown">Send breakdown</option>
          </select>
          <span className="sub">{breakdown ? "Every line with its unit price and amount, section totals and the discount." : "What the work includes and one price; no line prices."}</span>
        </label>
        )}

        {preliminary ? (
          <>
            <p className="note">A preliminary has no good-until date: it is an estimate, not an offer, and its link stays open.</p>
            {/* 2026-10-27: a preliminary goes as a range unless the sender picks the exact price. Always a lump sum. */}
            <label className="sq-until-in">
              Price shown
              <select className="in" value={range ? "range" : "exact"} onChange={(e) => setRange(e.target.value === "range")} disabled={sending || asking}>
                <option value="range">Range</option>
                <option value="exact">Exact price</option>
              </select>
              <span className="sub">
                {range
                  ? <>3% under the price to 10% over it (at most $3,000 over), rounded out{options.length === 1 && options[0].range ? <>: <b>{options[0].range}</b></> : ", per option above"}. Always a lump sum.</>
                  : <>The one price, as a rough total{options.length === 1 ? <>: <b>{options[0].price}</b></> : ""}. Always a lump sum.</>}
              </span>
            </label>
          </>
        ) : (
        <label className="sq-until-in">
          Good until
          <input className="in" type="date" value={until} min={today} max={maxUntil} onChange={(e) => setUntil(e.target.value)} disabled={sending || asking} />
        </label>
        )}

        <div className="sq-tools">
          <a href={preview} target="_blank" rel="noreferrer">Preview what the customer sees</a>
          <a href={emailPreview} target="_blank" rel="noreferrer">Preview the email</a>
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
