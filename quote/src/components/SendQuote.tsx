"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resendQuoteAction, sendQuoteAction } from "@/app/q/[id]/actions";
import { activityEntries, devicesSeen, whenWords } from "@/lib/activity/track";
import type { QuoteActivity } from "@/lib/quotes/types";

/**
 * Send this version to the customer through GHL: email (link + PDF) and/or text (link). Two
 * steps, like Confirm address: the second says exactly who gets what, because a sent version
 * is locked. Once sent, the card shows how and when, and the customer's link to copy.
 */

export type SentInfo = { sentAt: string | null; sentBy: string | null; sentTo: string | null; validUntil: string | null; link: string | null; activity?: QuoteActivity | null; /** Their page offers Download PDF (2026-10-30). */ pdf?: boolean };

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

/**
 * Send the link again (Albert, 2026-10-30): when the customer asks for the PDF, or lost the message. The same
 * quote and link; "Include the PDF" turns on its Download button if it was off and puts its link in the message.
 */
function SendAgain({ versionId, email, phone, pdfOn, kind, dated }: { versionId: string; email: string | null; phone: string | null; pdfOn: boolean; kind: "quote" | "accepted" | "change"; dated: boolean }) {
  const accepted = kind === "accepted";
  const what = kind === "accepted" ? "accepted quote" : kind === "change" ? "updated quote" : "quote";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [byEmail, setByEmail] = useState(!!email);
  const [bySms, setBySms] = useState(!email && !!phone);
  const [pdf, setPdf] = useState(true);
  const [busy, start] = useTransition();
  const [result, setResult] = useState<{ text: string; bad: boolean; problems?: string[] } | null>(null);
  if (!open)
    return (
      <div className="sq-again">
        <button type="button" className="btn small" onClick={() => { setOpen(true); setResult(null); }}>Send again…</button>
        {result && <p className={`sq-msg ${result.bad ? "bad" : "ok"}`} role="status">{result.text}</p>}
      </div>
    );
  function go() {
    setResult(null);
    start(async () => {
      const r = await resendQuoteAction(versionId, { channels: { email: byEmail, sms: bySms }, pdf });
      if (r.ok) {
        setOpen(false);
        setResult({ text: `Sent again by ${r.sentTo.join(" and ").toLowerCase()}${r.pdf ? ", with the PDF" : ""}.${r.warning ? ` ${r.warning}` : ""}`, bad: false });
        router.refresh();
      } else setResult({ text: r.message, bad: true, problems: r.problems });
    });
  }
  return (
    <div className="sq-again open">
      <p className="sq-again-h">Send their {what} again</p>
      <p className="faint sq-again-note">They get a short message: &ldquo;Here&rsquo;s your {what} again&rdquo; with the link{pdf ? " and the PDF" : ""}.</p>
      <label className="sq-tick"><input type="checkbox" checked={pdf} onChange={(e) => setPdf(e.target.checked)} /> Include the PDF <span className="faint">{accepted ? "(the signed, accepted PDF)" : pdfOn ? "(already on their page)" : "(turns on Download PDF on their page)"}</span></label>
      <label className="sq-tick"><input type="checkbox" checked={byEmail} disabled={!email} onChange={(e) => setByEmail(e.target.checked)} /> Email {email ? <span className="faint">{email}</span> : <span className="faint">no email on the contact</span>}</label>
      <label className="sq-tick"><input type="checkbox" checked={bySms} disabled={!phone} onChange={(e) => setBySms(e.target.checked)} /> Text {phone ? <span className="faint">{phone}</span> : <span className="faint">no phone on the contact</span>}</label>
      {result && (
        <div className={`sq-msg ${result.bad ? "bad" : "ok"}`} role="status">
          {result.text}
          {result.problems && <ul>{result.problems.map((x) => <li key={x}>{x}</li>)}</ul>}
        </div>
      )}
      <div className="sq-again-acts">
        <button type="button" className="btn primary small" disabled={busy || (!byEmail && !bySms)} onClick={go}>{busy ? "Sending…" : "Send"}</button>
        <button type="button" className="btn small" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <p className="faint sq-again-note">Nothing about the quote changes: same price, same link{dated ? ", same good-until date" : ""}. The message has a link to the PDF, never an attachment.</p>
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
  change = null,
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
  /** A change after acceptance (2026-10-27): sent for the record, with no good-until date and nothing to accept. */
  change?: number | null;
  /** The address the email goes out from: the signed-in quoter's (2026-10-22); null = GHL's default sender. */
  from: string | null;
  /** The version's options, for choosing which go to the customer (2026-10-24); `range` is what a preliminary shows instead of `price` (2026-10-27). */
  options: { id: string; name: string; price: string; range: string | null; recommended: boolean; notOffered?: boolean; problem: string | null }[];
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
  /** The quote page offers the PDF (Albert, 2026-10-27): off by default. Never attached to the email. */
  const [pdf, setPdf] = useState(false);
  /** Which options go to the customer (2026-10-24): all of them unless the sender unticks some; a Not offered one starts unticked (2026-10-30). */
  // Since 2026-10-31 a Not offered one can't be ticked at all (Albert: "as a safeguard, not even an option").
  const [chosen, setChosen] = useState<string[]>(() => options.filter((o) => !o.notOffered).map((o) => o.id));
  const offerable = options.filter((o) => !o.notOffered);
  const notOffered = options.length - offerable.length;
  // Every offered option ticked = no list sent: the server sends every option still offered, as the previews do.
  const everyOption = chosen.length === offerable.length;
  const optionIds = everyOption ? null : chosen;
  const optionProblems = options.filter((o) => chosen.includes(o.id) && o.problem).map((o) => o.problem!);
  const allProblems = [
    ...problems,
    ...(options.length > 0 && offerable.length === 0 ? ["Every option is marked Not offered. Untick Not offered on the one to send, in the editor."] : options.length > 0 && chosen.length === 0 ? ["Choose at least one option to send."] : []),
    ...optionProblems,
  ];
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<{ message: string; problems?: string[] } | null>(null);
  const [done, setDone] = useState<{ link: string; sentTo: string[]; warning: string | null } | null>(null);
  const [sending, startSend] = useTransition();
  const undated = preliminary || Boolean(change);
  const q = [undated ? null : `until=${until}`, itemised ? "itemised=1" : null, optionIds ? `options=${optionIds.join(",")}` : null, exact ? "range=0" : null, pdf ? "pdf=1" : null].filter(Boolean).join("&");
  const preview = `/q/${versionId}/preview${q ? `?${q}` : ""}`;
  const pdfLink = `/q/${versionId}/pdf${q ? `?${q}` : ""}`;
  const emailPreview = `/q/${versionId}/preview/email${q ? `?${q}` : ""}`;

  if (status !== "Draft" || done) {
    const s = done ? { sentAt: today, sentBy: null, sentTo: done.sentTo.join(", "), validUntil: undated ? null : until, link: done.link } : sent;
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
            <p className="faint">This version is {status ?? "not a draft"}. To send changes, edit the quote: saving starts the next draft.</p>
          )}
          {done?.warning && <p className="sq-msg warn" role="status">{done.warning}</p>}
          {!done && sent?.activity && <Activity a={sent.activity} />}
          {s?.link && <CopyLink link={s.link} />}
          {/* Also straight after sending (2026-10-31): the version is Sent from that moment, no reload needed. */}
          {(done || ["Sent", "Accepted", "Won"].includes(status ?? "")) && s?.link && ready.ready && <SendAgain versionId={versionId} email={email} phone={phone} pdfOn={done ? pdf : sent?.pdf === true} kind={!done && status !== "Sent" ? "accepted" : change ? "change" : "quote"} dated={(done || status === "Sent") && Boolean(s.validUntil)} />}
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
      const r = await sendQuoteAction(versionId, { base, validUntil: undated ? null : until, channels: { email: byEmail, sms: bySms }, itemised, pdf, optionIds, range: !exact });
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
              {email && <span className="sub">Link{from ? `, from ${from}` : ", from the location's default address"}</span>}
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

        {/* 2026-10-27: the quote page offers the PDF only when ticked; it is never attached to the email. */}
        <label className="sq-attach">
          <input type="checkbox" checked={pdf} onChange={(e) => setPdf(e.target.checked)} disabled={sending || asking} />
          <span>
            PDF download on the quote page
            <span className="sub">{pdf ? "The quote page has a Download PDF button; downloads are tracked." : "Off: no PDF on the quote page. Tick it for a client who needs the file."}</span>
          </span>
        </label>

        {(options.length > 1 || notOffered > 0) && (
          <fieldset className="sq-opts" disabled={sending || asking}>
            <legend>Options to send <span className="faint">{everyOption ? "all" : `${chosen.length} of ${offerable.length}`}{notOffered ? ` · ${notOffered} not offered` : ""}</span></legend>
            {options.map((o, i) =>
              o.notOffered ? (
                // Not offered (2026-10-31): shown so nobody wonders where it went, but greyed out and never selectable.
                <label key={o.id} className="no-offer" aria-disabled="true" title="Not offered: this option is never sent. Untick Not offered in the editor to send it.">
                  <input type="checkbox" checked={false} disabled readOnly />
                  <span>
                    <span className="nm"><s>{i + 1}. {o.name}</s> <span className="no-offer-tag">Not offered</span></span>
                    <span className="sub">Never sent. Untick Not offered in the editor to send it.</span>
                  </span>
                </label>
              ) : (
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
              ),
            )}
            {!everyOption && chosen.length > 0 && <p className="note">The customer sees only these, numbered from 1, on the page, the PDF, the email and the text.</p>}
          </fieldset>
        )}

        {/* A preliminary is always a lump sum (Albert, 2026-10-27); only a measured quote can go with the breakdown. */}
        {!preliminary && (
        <label className="sq-until-in" title="Lump sum: what the work includes and one price; quantities on install, removal, prep and materials, no line prices. Breakdown: every flooring line with its unit price and amount, section totals and the discount; stairs are always one price.">
          Pricing shown
          <select className="in" value={breakdown ? "breakdown" : "lump"} onChange={(e) => setBreakdown(e.target.value === "breakdown")} disabled={sending || asking}>
            <option value="lump">Lump sum only</option>
            <option value="breakdown">Send breakdown</option>
          </select>
          <span className="sub">{breakdown ? "Every flooring line with its unit price and amount, section totals and the discount. Stairs stay one price." : "What the work includes and one price; no line prices."}</span>
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
        ) : change ? (
          <p className="note">Change {change} goes out as the updated quote, with what changed at the top, for the customer&rsquo;s records: no good-until date and nothing to accept. GHL&rsquo;s value follows the new total.</p>
        ) : (
        <label className="sq-until-in">
          Good until
          <input className="in" type="date" value={until} min={today} max={maxUntil} onChange={(e) => setUntil(e.target.value)} disabled={sending || asking} />
        </label>
        )}

        <div className="sq-tools">
          <a href={preview} target="_blank" rel="noreferrer">Preview what the customer sees</a>
          <a href={emailPreview} target="_blank" rel="noreferrer">Preview the email</a>
          <a href={pdfLink} target="_blank" rel="noreferrer">PDF</a>
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
          <button type="button" className="btn primary sq-go" disabled={blocked || channels.length === 0 || (!undated && !until)} onClick={() => setAsking(true)}>
            Send quote
          </button>
        )}
      </div>
    </section>
  );
}
