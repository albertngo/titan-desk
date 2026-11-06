"use client";

import { useRouter } from "next/navigation";
import { useCallback, useContext, useState, useSyncExternalStore, useTransition } from "react";
import { EditorSend } from "@/components/editor/EditorSend";
import { resendQuoteAction, sendQuoteAction } from "@/app/q/[id]/actions";
import { activityEntries, devicesSeen, whenWords } from "@/lib/activity/track";
import { draftKey, unsavedDraftAt } from "@/lib/editor/model";
import type { QuoteActivity } from "@/lib/quotes/types";

/**
 * Unsaved changes for this version on this device (Albert, 2026-11-05): the editor keeps them under
 * `draftKey` until they are saved or discarded. Read again when another tab changes storage and when
 * the page is shown or focused again, so coming back from the editor is seen. Null on the server.
 */
function useUnsavedAt(versionId: string): string | null {
  const key = draftKey({ quoteRecordId: versionId });
  const subscribe = useCallback((changed: () => void) => {
    window.addEventListener("storage", changed);
    window.addEventListener("pageshow", changed);
    window.addEventListener("focus", changed);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("pageshow", changed);
      window.removeEventListener("focus", changed);
    };
  }, []);
  const read = useCallback(() => {
    try {
      return unsavedDraftAt(window.localStorage.getItem(key));
    } catch {
      return null;
    }
  }, [key]);
  return useSyncExternalStore(subscribe, read, () => null);
}

const keptWhen = (at: string) =>
  at === "unknown" ? "" : ` (kept ${new Date(at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })})`;

/** Why sending is off while the device holds unsaved changes, with the way to the editor. */
function UnsavedNote({ versionId, at, sent }: { versionId: string; at: string; sent: boolean }) {
  // In the editor (2026-11-06) the changes are the ones on screen: a draft saves itself in a few seconds.
  const inEditor = useContext(EditorSend) !== null;
  if (inEditor)
    return (
      <div className="sq-msg warn sq-unsaved" role="status">
        <b>Unsaved changes</b>
        <p>
          {sent
            ? "Send again is off until they are saved as the next draft or discarded."
            : "Sending is off until they are saved: a draft saves itself a few seconds after the last change, or press Save."}
        </p>
      </div>
    );
  return (
    <div className="sq-msg warn sq-unsaved" role="status">
      <b>Unsaved changes on this device{keptWhen(at)}</b>
      <p>
        {sent
          ? "Send again is off until they are saved as the next draft or discarded, so nobody resends this version thinking it has them."
          : "Sending is off until they are saved or discarded, so the customer never gets this version without them."}{" "}
        <a href={`/q/${versionId}/edit`}>Open the editor</a>
      </p>
    </div>
  );
}

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

export type SendAsList = {
  me: string;
  choices: { email: string; label: string; emailFrom: string | null; textFrom: string | null }[];
  /** Who sent this quote last (2026-11-05): shown, never picked for you. */
  last?: { label: string; version: number | null; on: string | null } | null;
};

/**
 * Send as (2026-11-04, opened to everyone 2026-11-05): who the email, the text and the signature come from, always
 * starting on the person signed in. Albert is on the list only when Albert is signed in. Shows who sent it last.
 */
export function SendAsPicker({ list, value, onChange, disabled = false }: { list: SendAsList; value: string; onChange: (email: string) => void; disabled?: boolean }) {
  const c = list.choices.find((x) => x.email === value);
  const last = list.last ? `Last sent by ${list.last.label}${list.last.version !== null ? ` · v${list.last.version}` : ""}${list.last.on ? ` · ${day(list.last.on)}` : ""}` : null;
  if (list.choices.length < 2) return last ? <p className="faint sq-last">{last}</p> : null;
  return (
    <label className="sq-as">
      <span className="k">Send as</span>
      <select className="in" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {list.choices.map((x) => (
          <option key={x.email} value={x.email}>
            {x.email === list.me ? `Me, ${x.label}` : x.label}
          </option>
        ))}
      </select>
      {last && <span className="sub sq-last">{last}</span>}
      {c && c.email !== list.me && (
        <span className="sub">
          Email from {c.emailFrom ?? "nobody (this address can't send email)"}; text from {c.textFrom ?? "nobody (their GHL user has no number of its own)"}; signed as them.
        </span>
      )}
    </label>
  );
}

/**
 * Send the link again (Albert, 2026-10-30): when the customer asks for the PDF, or lost the message. The same
 * quote and link; "Include the PDF" turns on its Download button if it was off and puts its link in the message.
 */
function SendAgain({ versionId, sendAs = null, email, phone, pdfOn, kind, dated, unsaved = null }: { versionId: string; sendAs?: SendAsList | null; email: string | null; phone: string | null; pdfOn: boolean; kind: "quote" | "accepted" | "change"; dated: boolean; /** Unsaved changes on this device (2026-11-05): Send again is off while there are. */ unsaved?: string | null }) {
  const [asEmail, setAsEmail] = useState(sendAs?.me ?? "");
  const asOther = Boolean(sendAs && asEmail && asEmail !== sendAs.me);
  // Email and text alike go only from the sender's own address and number (2026-11-05).
  const pick = sendAs?.choices.find((c) => c.email === asEmail) ?? null;
  const canEmail = !pick || Boolean(pick.emailFrom);
  const canText = !pick || Boolean(pick.textFrom);
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
        <button type="button" className="btn small" disabled={Boolean(unsaved)} title={unsaved ? "Save or discard the unsaved changes on this device first" : undefined} onClick={() => { setOpen(true); setResult(null); }}>Send again…</button>
        {result && <p className={`sq-msg ${result.bad ? "bad" : "ok"}`} role="status">{result.text}</p>}
      </div>
    );
  function go() {
    setResult(null);
    start(async () => {
      const r = await resendQuoteAction(versionId, { channels: { email: byEmail && canEmail, sms: bySms && canText }, pdf, ...(asOther ? { as: asEmail } : {}) });
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
      {sendAs && <SendAsPicker list={sendAs} value={asEmail} onChange={setAsEmail} />}
      <p className="faint sq-again-note">They get a short message: &ldquo;Here&rsquo;s your {what} again&rdquo; with the link{pdf ? " and the PDF" : ""}.</p>
      <label className="sq-tick"><input type="checkbox" checked={pdf} onChange={(e) => setPdf(e.target.checked)} /> Include the PDF <span className="faint">{accepted ? "(the signed, accepted PDF)" : pdfOn ? "(already on their page)" : "(turns on Download PDF on their page)"}</span></label>
      <label className="sq-tick"><input type="checkbox" checked={byEmail && canEmail} disabled={!email || !canEmail} onChange={(e) => setByEmail(e.target.checked)} /> Email {email ? <span className="faint">{email}{canEmail ? "" : ", can't go from this sender's address"}</span> : <span className="faint">no email on the contact</span>}</label>
      <label className="sq-tick"><input type="checkbox" checked={bySms && canText} disabled={!phone || !canText} onChange={(e) => setBySms(e.target.checked)} /> Text {phone ? <span className="faint">{phone}{canText ? "" : ", can't go: this sender's GHL user has no number of its own"}</span> : <span className="faint">no phone on the contact</span>}</label>
      {result && (
        <div className={`sq-msg ${result.bad ? "bad" : "ok"}`} role="status">
          {result.text}
          {result.problems && <ul>{result.problems.map((x) => <li key={x}>{x}</li>)}</ul>}
        </div>
      )}
      <div className="sq-again-acts">
        <button type="button" className="btn primary small" disabled={busy || Boolean(unsaved) || (!(byEmail && canEmail) && !(bySms && canText))} onClick={go}>{busy ? "Sending…" : "Send"}</button>
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
  from: ownFrom,
  textFrom: ownTextFrom = null,
  sendAs = null,
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
  /** The address the email goes out from: the signed-in quoter's (2026-10-22); null = they can't email it (2026-11-04: never a stand-in). */
  from: string | null;
  /** The number the text goes from (2026-11-04): the signed-in person's own GHL number; null = GHL's main number. */
  textFrom?: string | null;
  /** Albert only (2026-11-04): who he may send as, each with the address and number it would go from; null for everyone else. */
  sendAs?: SendAsList | null;
  /** The version's options, for choosing which go to the customer (2026-10-24); `range` is what a preliminary shows instead of `price` (2026-10-27). */
  options: { id: string; name: string; price: string; range: string | null; recommended: boolean; notOffered?: boolean; problem: string | null }[];
}) {
  const router = useRouter();
  /** Unsaved changes for this version on this device (2026-11-05): nothing sends while there are. */
  // In the editor (2026-11-06), the editor says whether it holds unsaved changes; elsewhere, this device's storage.
  const editor = useContext(EditorSend);
  const stored = useUnsavedAt(versionId);
  const unsaved = editor ? editor.unsavedAt : stored;
  /** Who it goes out as (2026-11-05, anyone): their own sign-in unless they pick someone else. */
  const [asEmail, setAsEmail] = useState(sendAs?.me ?? "");
  const asChoice = sendAs?.choices.find((c) => c.email === asEmail) ?? null;
  const asOther = Boolean(sendAs && asChoice && asEmail !== sendAs.me);
  const from = asOther ? asChoice!.emailFrom : ownFrom;
  const textFrom = asOther ? asChoice!.textFrom : ownTextFrom;
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
  const qAs = [q, asOther ? `as=${encodeURIComponent(asEmail)}` : null].filter(Boolean).join("&");
  const preview = `/q/${versionId}/preview${q ? `?${q}` : ""}`;
  const pdfLink = `/q/${versionId}/pdf${q ? `?${q}` : ""}`;
  const emailPreview = `/q/${versionId}/preview/email${qAs ? `?${qAs}` : ""}`;

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
          {unsaved && !done && ["Sent", "Accepted", "Won"].includes(status ?? "") && s?.link && ready.ready && <UnsavedNote versionId={versionId} at={unsaved} sent />}
          {(done || ["Sent", "Accepted", "Won"].includes(status ?? "")) && s?.link && ready.ready && <SendAgain unsaved={unsaved} versionId={versionId} sendAs={sendAs} email={email} phone={phone} pdfOn={done ? pdf : sent?.pdf === true} kind={!done && status !== "Sent" ? "accepted" : change ? "change" : "quote"} dated={(done || status === "Sent") && Boolean(s.validUntil)} />}
          <div className="sq-tools">
            <a href={`/q/${versionId}/preview`} target="_blank" rel="noreferrer">What the customer sees</a>
            <a href={`/q/${versionId}/preview/email`} target="_blank" rel="noreferrer">The email</a>
            <a href={`/q/${versionId}/pdf`} target="_blank" rel="noreferrer">PDF</a>
          </div>
        </div>
      </section>
    );
  }

  const channels = [byEmail && email && from ? `email (${email})` : null, bySms && phone && textFrom ? `text (${phone})` : null].filter(Boolean);
  const blocked = allProblems.length > 0 || !ready.ready || Boolean(unsaved);

  function send() {
    setError(null);
    startSend(async () => {
      const r = await sendQuoteAction(versionId, { base, validUntil: undated ? null : until, channels: { email: byEmail && !!from, sms: bySms && !!textFrom }, itemised, pdf, optionIds, range: !exact, ...(asOther ? { as: asEmail } : {}) });
      setAsking(false);
      if (r.ok) {
        setDone(r);
        router.refresh();
      } else setError({ message: r.message, problems: r.problems });
    });
  }

  return (
    <section className="card sq" id="send" aria-labelledby="sq-h">
      <div className="card-h" id="sq-h">Send quote to customer</div>
      <div className="card-b">
        {allProblems.length > 0 && (
          <div className="sq-msg warn">
            <b>Not ready to send</b>
            <ul>{allProblems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {!ready.ready && <p className="sq-msg warn">{ready.why}</p>}
        {unsaved && <UnsavedNote versionId={versionId} at={unsaved} sent={false} />}

        {sendAs && <SendAsPicker list={sendAs} value={asEmail} onChange={setAsEmail} disabled={sending || asking} />}
        <fieldset className="sq-ch" disabled={sending || asking}>
          <legend className="sr-only">Send by</legend>
          <label className={email ? undefined : "off"}>
            <input type="checkbox" checked={byEmail && !!email && !!from} disabled={!email || !from} onChange={(e) => setByEmail(e.target.checked)} />
            <span>
              Email <span className="faint">{email ?? "no email in GHL"}</span>
              {email && <span className="sub">{from ? `Link, from ${from}` : asOther ? "Can't go from this person's address: pick someone else to email it" : "Can't go from your sign-in: sign in with your Titan account to email it"}</span>}
            </span>
          </label>
          <label className={phone ? undefined : "off"}>
            <input type="checkbox" checked={bySms && !!phone && !!textFrom} disabled={!phone || !textFrom} onChange={(e) => setBySms(e.target.checked)} />
            <span>
              Text <span className="faint">{phone ?? "no phone in GHL"}</span>
              {phone && <span className="sub">{textFrom ? `Link, from ${textFrom} (${asOther ? "their" : "your"} GHL number)` : `Can't go: ${asOther ? "their" : "your"} GHL user has no number of its own, and a text goes only from the sender's own number. Give it one in GHL (Settings, My Staff, LC Phone)${asOther ? "" : ", or pick someone who has one"}`}</span>}
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
              <button type="button" className="btn small primary" onClick={send} disabled={sending || Boolean(unsaved)}>
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
