"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { briefAction, followedUpAction, lostAction, postponeAction, snoozeAction } from "@/app/follow-up/actions";
import { ConversationDrawer } from "@/components/Conversation";
import type { Brief, StepKind } from "@/lib/followup/brief";
import { SNOOZE_CHOICES, type Bucket } from "@/lib/followup/plan";
import type { FollowUpPage, FollowUpResult, FollowUpRow } from "@/lib/quotes/followup";

const SECTIONS: { bucket: Bucket; title: string; empty: string }[] = [
  { bucket: "due", title: "Due now", empty: "Nothing due. Nice." },
  { bucket: "upcoming", title: "Coming up", empty: "Nothing scheduled." },
  { bucket: "snoozed", title: "Snoozed", empty: "Nothing snoozed." },
  { bucket: "postponed", title: "Postponed", empty: "Nothing postponed." },
];

const STEP_WORDS: Record<StepKind, string> = { call: "Call them", text: "Send a text", email: "Send an email", visit: "Book the visit", wait: "Wait", close: "Close it out" };
const EVERYONE = "Everyone";
/** Briefs written at once, so a first visit doesn't ask Claude for every quote together. */
const BRIEFS_AT_ONCE = 2;

const dayWords = (d: string, today: string) => {
  const n = Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000);
  if (n === 0) return "today";
  if (n === -1) return "yesterday";
  if (n === 1) return "tomorrow";
  const label = new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
  return n < 0 ? `${label} (${-n} days ago)` : label;
};

type Modal = { kind: "lost" | "postpone" | "touch"; row: FollowUpRow } | null;
type BriefState = { brief: Brief | null; busy: boolean; error: string | null; stale: boolean };

/**
 * The Follow up page's list (Albert, 2026-11-07). "Last sent by: Pourya | Joey | Albert | Everyone" (each name is
 * whoever last sent a quote on the list), starting on the signed-in person when they have any; column headings; four
 * sections by where each quote stands; on each row, what's due and why, the brief, then the buttons. The customer's
 * conversation opens in the drawer on the right. Every button goes to the server, which reads the quote again before
 * writing; the page reloads after.
 */
export function FollowUpList({ data }: { data: FollowUpPage }) {
  const router = useRouter();
  const senders = useMemo(() => [...new Set(data.rows.map((r) => r.ownerName).filter((n): n is string => Boolean(n)))].sort((a, b) => a.localeCompare(b)), [data.rows]);
  const myName = data.rows.find((r) => r.owner === data.me)?.ownerName ?? null;
  const [who, setWho] = useState<string>(myName ?? EVERYONE);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, start] = useTransition();
  const [result, setResult] = useState<{ who: string; ok: boolean; lines: string[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [conv, setConv] = useState<{ contactId: string; name: string | null; signal: number } | null>(() => {
    // The first row's customer to start (Albert, 2026-11-07: "default to the first row"); rows come most urgent first.
    const first = data.rows.find((r) => r.contactId);
    return first?.contactId ? { contactId: first.contactId, name: first.customer, signal: 0 } : null;
  });
  const [briefs, setBriefs] = useState<Record<string, BriefState>>(() =>
    Object.fromEntries(data.rows.map((r) => [r.quoteRecordId, { brief: r.brief, busy: false, error: null, stale: r.briefStale }])),
  );

  const shown = useMemo(() => (who === EVERYONE ? data.rows : data.rows.filter((r) => r.ownerName === who)), [who, data.rows]);
  const dueOf = (name: string) => data.rows.filter((r) => r.due.bucket === "due" && (name === EVERYONE || r.ownerName === name)).length;

  const askBrief = async (row: FollowUpRow, force: boolean) => {
    setBriefs((b) => ({ ...b, [row.quoteRecordId]: { ...b[row.quoteRecordId], busy: true, error: null } }));
    try {
      const r = await briefAction(row.quoteRecordId, force);
      setBriefs((b) => ({ ...b, [row.quoteRecordId]: r.ok ? { brief: r.brief, busy: false, error: null, stale: false } : { ...b[row.quoteRecordId], busy: false, error: r.message } }));
    } catch {
      setBriefs((b) => ({ ...b, [row.quoteRecordId]: { ...b[row.quoteRecordId], busy: false, error: "Lost the connection. Try again." } }));
    }
  };

  // Stale briefs for what is due or coming up are rewritten after the page draws, a couple at a time, due first.
  const started = useRef(new Set<string>());
  useEffect(() => {
    if (!data.briefsOn) return;
    const todo = data.rows.filter((r) => r.briefStale && (r.due.bucket === "due" || r.due.bucket === "upcoming") && !started.current.has(r.quoteRecordId));
    todo.forEach((r) => started.current.add(r.quoteRecordId));
    let live = true;
    (async () => {
      for (let i = 0; i < todo.length && live; i += BRIEFS_AT_ONCE) await Promise.all(todo.slice(i, i + BRIEFS_AT_ONCE).map((r) => askBrief(r, false)));
    })();
    return () => {
      live = false;
    };
  }, [data.rows, data.briefsOn]);

  const run = (row: FollowUpRow, f: () => Promise<FollowUpResult>) => {
    setResult(null);
    start(async () => {
      try {
        const r = await f();
        setResult({ who: row.customer ?? row.quoteNumber ?? "This quote", ok: r.ok, lines: r.ok ? r.notes : [r.message] });
        if (r.ok) {
          setModal(null);
          router.refresh();
        }
      } catch {
        setResult({ who: row.customer ?? "This quote", ok: false, lines: ["Lost the connection, so it may not have gone through. Reload to check."] });
      }
    });
  };

  const copy = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt(label, text);
    }
  };

  const openConv = (row: FollowUpRow) => row.contactId && setConv((c) => ({ contactId: row.contactId as string, name: row.customer, signal: (c?.signal ?? 0) + 1 }));

  return (
    <>
      <section className="card fu-card">
        <div className="ql-tools fu-tools">
          <div className="fu-who-pick">
            <span className="k" id="fu-who-k">Last sent by</span>
            <div className="ql-filters" role="group" aria-labelledby="fu-who-k">
              {[...senders, EVERYONE].map((name) => (
                <button key={name} type="button" className="ql-f" aria-pressed={who === name} onClick={() => setWho(name)} title={`${dueOf(name)} due now`}>
                  {name} <span className="n">{dueOf(name)}</span>
                </button>
              ))}
            </div>
          </div>
          {!data.ghlOn && <p className="fu-warn">GHL isn&apos;t connected here, so only &quot;I followed up&quot; counts and the GHL buttons are off.</p>}
          {data.ghlOn && data.lostReasons === null && <p className="fu-warn">GHL&apos;s lost reasons couldn&apos;t be read, so Lost will ask you to set the reason in GHL.</p>}
          {!data.briefsOn && <p className="fu-warn">Briefs aren&apos;t set up on this deployment (the Claude key isn&apos;t set).</p>}
        </div>
        {result && (
          <div className={`fu-result${result.ok ? "" : " bad"}`} role="status">
            <strong>{result.ok ? `${result.who}: done.` : `${result.who}: not done.`}</strong>
            {result.lines.map((l) => (
              <span key={l}>{l}</span>
            ))}
            <button type="button" className="linkbtn" onClick={() => setResult(null)}>
              Dismiss
            </button>
          </div>
        )}
        <div className="fu-cols" aria-hidden>
          <span>Customer · in conversation with</span>
          <span>Why it&apos;s due</span>
          <span>Age and follow-ups</span>
        </div>
        {SECTIONS.map((s) => {
          const rows = shown.filter((r) => r.due.bucket === s.bucket);
          if (s.bucket !== "due" && rows.length === 0) return null;
          return (
            <div key={s.bucket} className={`fu-sec ${s.bucket}`}>
              <h2 className="fu-h">
                {s.title} <span className="n">{rows.length}</span>
              </h2>
              {rows.length === 0 && <p className="fu-empty">{s.empty}</p>}
              {rows.map((r) => (
                <Row
                  key={r.quoteRecordId}
                  row={r}
                  today={data.today}
                  busy={busy}
                  copied={copied}
                  brief={briefs[r.quoteRecordId]}
                  briefsOn={data.briefsOn}
                  convOn={conv?.contactId === r.contactId}
                  onModal={(kind) => setModal({ kind, row: r })}
                  onSnooze={(d) => run(r, () => snoozeAction(r.quoteRecordId, r.seen, d))}
                  onVisit={() => copy(`visit:${r.quoteRecordId}`, data.inHomeUrl, "Copy the in-home booking link:")}
                  onCopyDraft={(text) => copy(`draft:${r.quoteRecordId}`, text, "Copy the draft:")}
                  onRewrite={() => askBrief(r, true)}
                  onConv={() => openConv(r)}
                />
              ))}
            </div>
          );
        })}
        {shown.length === 0 && who !== EVERYONE && data.rows.length > 0 && (
          <p className="fu-empty">
            None sent by {who}.{" "}
            <button type="button" className="linkbtn" onClick={() => setWho(EVERYONE)}>
              See everyone&apos;s ({data.rows.length})
            </button>
          </p>
        )}
      </section>
      {modal && <ActionModal modal={modal} data={data} busy={busy} onClose={() => setModal(null)} onRun={(f) => run(modal.row, f)} />}
      {conv && <ConversationDrawer contactId={conv.contactId} title={conv.name} openSignal={conv.signal} />}
    </>
  );
}

function Row(p: {
  row: FollowUpRow;
  today: string;
  busy: boolean;
  copied: string | null;
  brief: BriefState | undefined;
  briefsOn: boolean;
  convOn: boolean;
  onModal: (k: "lost" | "postpone" | "touch") => void;
  onSnooze: (d: number) => void;
  onVisit: () => void;
  onCopyDraft: (text: string) => void;
  onRewrite: () => void;
  onConv: () => void;
}) {
  const { row, today, busy } = p;
  const r = row.due.reason.kind;
  const tone = r === "replied" || r === "expired" ? "bad" : row.due.bucket === "due" ? "warn" : "";
  const prelim = row.basis === "Preliminary";
  const lastNote = [...row.state.touches].reverse().find((t) => t.note)?.note;
  // Clicking the row (anywhere but a button or link) shows this customer's conversation (Albert, 2026-11-07).
  const pick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest("a, button, input, select, textarea, label")) return;
    p.onConv();
  };
  return (
    <div className={`fu-row${p.convOn ? " picked" : ""}${row.contactId ? " can-pick" : ""}`} onClick={pick}>
      <div className="fu-who">
        <span className="fu-name-line">
          <Link href={`/q/${row.versionId}`} className="fu-name">
            {row.customer ?? "No customer"}
          </Link>
          {/* Who the customer is talking to: whoever last sent the quote (Albert, 2026-11-07), the filter's own names. */}
          <span className="fu-with" title="Last sent the quote, so in conversation with the customer">
            with {row.ownerName ?? "nobody yet"}
          </span>
        </span>
        <span className="fu-meta">
          {row.quoteNumber ?? ""} · {row.basis ?? "Quote"}
          {row.description ? ` · ${row.description}` : ""}
        </span>
        {/* Where the lead is in the journey (2026-11-07): from the contact's GHL appointments. */}
        {row.visit && <span className={`fu-visit ${row.visit.kind}`}>{row.visitText}</span>}
      </div>
      <div className="fu-why">
        <span className={`chip${tone ? ` ${tone}` : ""}`}>{row.why}</span>
        <span className="fu-when">
          {row.due.bucket === "postponed" ? "Back on the list" : "Due"} {dayWords(row.due.day, today)}
        </span>
      </div>
      <div className="fu-facts">
        <span>{row.age}</span>
        <span>
          {row.due.touches === 0 ? "No follow-up yet" : `${row.due.touches} follow-up${row.due.touches === 1 ? "" : "s"}, last ${dayWords(row.due.lastTouch as string, today)}`}
          {!row.ghlRead && row.contactId ? " · GHL not read" : ""}
        </span>
        {row.state.postpone?.note && <span className="fu-note">Postponed: {row.state.postpone.note}</span>}
        {lastNote && <span className="fu-note">Last note: {lastNote}</span>}
      </div>
      {p.briefsOn && <BriefBox state={p.brief} row={row} copied={p.copied === `draft:${row.quoteRecordId}`} onCopy={p.onCopyDraft} onRewrite={p.onRewrite} />}
      <div className="fu-acts">
        {row.contactId && (
          <button type="button" className={`btn${p.convOn ? " on" : ""}`} onClick={p.onConv}>
            Conversation
          </button>
        )}
        {row.ghlUrl && (
          <a className="btn" href={row.ghlUrl} target="_blank" rel="noreferrer">
            Open in GHL
          </a>
        )}
        <button type="button" className="btn" disabled={busy} onClick={() => p.onModal("touch")}>
          I followed up
        </button>
        <span className="fu-snooze" role="group" aria-label="Still deciding, check again in">
          <span className="k">Snooze</span>
          {SNOOZE_CHOICES.map((d) => (
            <button key={d} type="button" className="btn small" disabled={busy} onClick={() => p.onSnooze(d)} title={`Still deciding: check again in ${d} days`}>
              {d}d
            </button>
          ))}
        </span>
        {prelim && (
          <button type="button" className="btn" onClick={p.onVisit} title="Copy the in-home measurement booking link">
            {p.copied === `visit:${row.quoteRecordId}` ? "Link copied" : "Book the visit"}
          </button>
        )}
        <button type="button" className="btn" disabled={busy} onClick={() => p.onModal("postpone")}>
          Postpone…
        </button>
        <button type="button" className="btn danger" disabled={busy} onClick={() => p.onModal("lost")}>
          Lost…
        </button>
      </div>
    </div>
  );
}

/** The brief (step 2): where it stands, what they asked, the next step and a draft to copy into GHL. */
function BriefBox({ state, row, copied, onCopy, onRewrite }: { state: BriefState | undefined; row: FollowUpRow; copied: boolean; onCopy: (t: string) => void; onRewrite: () => void }) {
  const b = state?.brief ?? null;
  if (!b && state?.busy) return <div className="fu-brief wait">Writing the brief…</div>;
  if (!b && state?.error)
    return (
      <div className="fu-brief bad">
        {state.error}{" "}
        <button type="button" className="linkbtn" onClick={onRewrite}>
          Try again
        </button>
      </div>
    );
  if (!b)
    return (
      <div className="fu-brief wait">
        No brief yet.{" "}
        <button type="button" className="linkbtn" onClick={onRewrite}>
          Write one
        </button>
      </div>
    );
  return (
    <div className="fu-brief">
      <div className="fu-brief-h">
        <span className="k">Brief</span>
        <span className="fu-brief-meta">
          {state?.busy ? "Updating…" : state?.stale ? "New activity since: updating soon" : `Written ${new Date(b.at).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" })}`}
          {!state?.busy && (
            <button type="button" className="linkbtn" onClick={onRewrite}>
              Rewrite
            </button>
          )}
        </span>
      </div>
      <p className="fu-standing">{b.standing}</p>
      {b.asked.length > 0 && (
        <ul className="fu-asked">
          {b.asked.map((a) => (
            <li key={a.text} className={a.answered ? "done" : ""}>
              <span className="tick" aria-hidden>{a.answered ? "✓" : "?"}</span>
              {a.text}
              <span className="sr">{a.answered ? " (answered)" : " (not answered yet)"}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="fu-step">
        <strong>{STEP_WORDS[b.step.kind]}.</strong> {b.step.why}
        {b.nextDay && (
          <span className="fu-named">
            {" "}
            Next follow-up {b.nextDay}
            {b.nextQuote ? `, because they said "${b.nextQuote}"` : ""}.
          </span>
        )}
      </p>
      {b.draft && (
        <div className="fu-draft">
          <p>{b.draft}</p>
          <div className="fu-draft-acts">
            <button type="button" className="btn small" onClick={() => onCopy(b.draft)}>
              {copied ? "Copied" : "Copy"}
            </button>
            {row.ghlUrl && (
              <a className="btn small" href={row.ghlUrl} target="_blank" rel="noreferrer" onClick={() => onCopy(b.draft)}>
                Copy and open GHL
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionModal({ modal, data, busy, onClose, onRun }: { modal: NonNullable<Modal>; data: FollowUpPage; busy: boolean; onClose: () => void; onRun: (f: () => Promise<FollowUpResult>) => void }) {
  const { row, kind } = modal;
  const [note, setNote] = useState("");
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const first = useRef<HTMLElement | null>(null);
  useEffect(() => first.current?.focus(), []);
  const linked = Boolean(row.opportunityId);
  const title = kind === "lost" ? "Mark lost" : kind === "postpone" ? "Postpone" : "I followed up";
  const reasons = data.lostReasons ?? [];
  const needReason = kind === "lost" && linked && reasons.length > 0;
  const ready = kind === "postpone" ? until > data.today : needReason ? reason !== "" : true;
  const submit = () => {
    if (!ready) return;
    if (kind === "lost") onRun(() => lostAction(row.quoteRecordId, row.seen, reason, note));
    else if (kind === "postpone") onRun(() => postponeAction(row.quoteRecordId, row.seen, until, note));
    else onRun(() => followedUpAction(row.quoteRecordId, row.seen, note));
  };
  const reasonName = reasons.find((r) => r.id === reason)?.name;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`${title}: ${row.customer ?? ""}`} onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="modal-card fu-modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-h">
          {title}: {row.customer ?? row.quoteNumber}
          <button type="button" className="linkbtn right" onClick={onClose}>
            Cancel
          </button>
        </div>
        <div className="card-b">
          {kind === "touch" && <p className="sub">For a call, a visit or a talk in the store that GHL doesn&apos;t show. Texts, emails and calls in GHL already count on their own.</p>}
          {kind === "postpone" && (
            <label className="fu-field">
              <span className="k">Follow up around</span>
              <input ref={(el) => void (first.current = el)} className="in" type="date" min={data.today} value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
          )}
          {kind === "lost" && needReason && (
            <label className="fu-field">
              <span className="k">Why (GHL&apos;s lost reasons)</span>
              <select ref={(el) => void (first.current = el)} className="in" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Pick a reason…</option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="fu-field">
            <span className="k">Note (optional)</span>
            <textarea ref={kind === "touch" ? (el) => void (first.current = el) : undefined} className="in" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "lost" ? "Went with someone else, $2k cheaper" : kind === "postpone" ? "Moving in March, wants it done before" : "Called, they're deciding this weekend"} />
          </label>
          {kind !== "touch" && (
            <div className="fu-will" role="note">
              <span className="k">This will</span>
              <ul>
                {kind === "lost" && (
                  <>
                    <li>{linked ? `Mark the GHL opportunity Lost${reasonName ? ` (${reasonName})` : ""}` : "Leave GHL alone (no opportunity linked)"}</li>
                    <li>Mark the quote Lost and take it off this list</li>
                  </>
                )}
                {kind === "postpone" && (
                  <>
                    <li>{linked ? `Move the opportunity to Postponed${until ? `, Postponed Until ${until}` : ""}` : "Leave GHL alone (no opportunity linked)"}</li>
                    <li>Bring it back on this list a month before the date (halfway, if it&apos;s sooner)</li>
                  </>
                )}
                <li>Take the &quot;quote sent&quot; tags off, so the automated texts stop</li>
                {note.trim() && <li>Post the note in the GHL conversation and the quote&apos;s History</li>}
              </ul>
            </div>
          )}
          <div className="fu-modal-acts">
            <button type="button" className={`btn ${kind === "lost" ? "danger" : "primary"}`} disabled={busy || !ready} onClick={submit}>
              {busy ? "Working…" : kind === "lost" ? "Mark lost" : kind === "postpone" ? "Postpone" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
