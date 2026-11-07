"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { followedUpAction, lostAction, postponeAction, snoozeAction } from "@/app/follow-up/actions";
import { SNOOZE_CHOICES, type Bucket } from "@/lib/followup/plan";
import type { FollowUpPage, FollowUpResult, FollowUpRow } from "@/lib/quotes/followup";

const SECTIONS: { bucket: Bucket; title: string; empty: string }[] = [
  { bucket: "due", title: "Due now", empty: "Nothing due. Nice." },
  { bucket: "upcoming", title: "Coming up", empty: "Nothing scheduled." },
  { bucket: "snoozed", title: "Snoozed", empty: "Nothing snoozed." },
  { bucket: "postponed", title: "Postponed", empty: "Nothing postponed." },
];

const dayWords = (d: string, today: string) => {
  const n = Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000);
  if (n === 0) return "today";
  if (n === -1) return "yesterday";
  if (n === 1) return "tomorrow";
  const label = new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
  return n < 0 ? `${label} (${-n} days ago)` : label;
};

type Modal = { kind: "lost" | "postpone" | "touch"; row: FollowUpRow } | null;

/**
 * The Follow up page's list (Albert, 2026-11-07). Mine by default (whoever last sent the quote), Everyone a tap away;
 * four sections by where each quote stands; on each row, what's due and why, then the buttons. Every button goes to
 * the server, which reads the quote again before writing; the page reloads after.
 */
export function FollowUpList({ data }: { data: FollowUpPage }) {
  const router = useRouter();
  const [mine, setMine] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, start] = useTransition();
  const [result, setResult] = useState<{ who: string; ok: boolean; lines: string[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const shown = useMemo(() => (mine ? data.rows.filter((r) => r.owner === data.me) : data.rows), [mine, data.rows, data.me]);
  const dueMine = data.rows.filter((r) => r.owner === data.me && r.due.bucket === "due").length;
  const dueAll = data.rows.filter((r) => r.due.bucket === "due").length;

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

  const copyVisit = async (row: FollowUpRow) => {
    try {
      await navigator.clipboard.writeText(data.inHomeUrl);
      setCopied(row.quoteRecordId);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt("Copy the in-home booking link:", data.inHomeUrl);
    }
  };

  return (
    <>
      <section className="card fu-card">
        <div className="ql-tools fu-tools">
          <div className="ql-filters" role="group" aria-label="Whose quotes">
            <button type="button" className="ql-f" aria-pressed={mine} onClick={() => setMine(true)}>
              Mine <span className="n">{dueMine}</span>
            </button>
            <button type="button" className="ql-f" aria-pressed={!mine} onClick={() => setMine(false)}>
              Everyone <span className="n">{dueAll}</span>
            </button>
          </div>
          {!data.ghlOn && <p className="fu-warn">GHL isn&apos;t connected here, so only &quot;I followed up&quot; counts and the GHL buttons are off.</p>}
          {data.ghlOn && data.lostReasons === null && <p className="fu-warn">GHL&apos;s lost reasons couldn&apos;t be read, so Lost will ask you to set the reason in GHL.</p>}
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
                <Row key={r.quoteRecordId} row={r} today={data.today} busy={busy} copied={copied === r.quoteRecordId} onModal={(kind) => setModal({ kind, row: r })} onSnooze={(d) => run(r, () => snoozeAction(r.quoteRecordId, r.seen, d))} onVisit={() => copyVisit(r)} />
              ))}
            </div>
          );
        })}
        {shown.length === 0 && mine && data.rows.length > 0 && (
          <p className="fu-empty">
            None of yours. <button type="button" className="linkbtn" onClick={() => setMine(false)}>See everyone&apos;s ({data.rows.length})</button>
          </p>
        )}
      </section>
      {modal && <ActionModal modal={modal} data={data} busy={busy} onClose={() => setModal(null)} onRun={(f) => run(modal.row, f)} />}
    </>
  );
}

function Row({ row, today, busy, copied, onModal, onSnooze, onVisit }: { row: FollowUpRow; today: string; busy: boolean; copied: boolean; onModal: (k: "lost" | "postpone" | "touch") => void; onSnooze: (d: number) => void; onVisit: () => void }) {
  const r = row.due.reason.kind;
  const tone = r === "replied" || r === "expired" ? "bad" : row.due.bucket === "due" ? "warn" : "";
  const prelim = row.basis === "Preliminary";
  const lastNote = [...row.state.touches].reverse().find((t) => t.note)?.note;
  return (
    <div className="fu-row">
      <div className="fu-who">
        <Link href={`/q/${row.versionId}`} className="fu-name">
          {row.customer ?? "No customer"}
        </Link>
        <span className="fu-meta">
          {row.quoteNumber ?? ""} · {row.basis ?? "Quote"}
          {row.description ? ` · ${row.description}` : ""}
        </span>
      </div>
      <div className="fu-why">
        <span className={`chip${tone ? ` ${tone}` : ""}`}>{row.why}</span>
        <span className="fu-when">
          {row.due.bucket === "due" ? "Due" : row.due.bucket === "postponed" ? "Back on the list" : "Due"} {dayWords(row.due.day, today)}
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
      <div className="fu-acts">
        {row.ghlUrl && (
          <a className="btn" href={row.ghlUrl} target="_blank" rel="noreferrer">
            Open in GHL
          </a>
        )}
        <button type="button" className="btn" disabled={busy} onClick={() => onModal("touch")}>
          I followed up
        </button>
        <span className="fu-snooze" role="group" aria-label="Still deciding, check again in">
          <span className="k">Snooze</span>
          {SNOOZE_CHOICES.map((d) => (
            <button key={d} type="button" className="btn small" disabled={busy} onClick={() => onSnooze(d)} title={`Still deciding: check again in ${d} days`}>
              {d}d
            </button>
          ))}
        </span>
        {prelim && (
          <button type="button" className="btn" onClick={onVisit} title="Copy the in-home measurement booking link">
            {copied ? "Link copied" : "Book the visit"}
          </button>
        )}
        <button type="button" className="btn" disabled={busy} onClick={() => onModal("postpone")}>
          Postpone…
        </button>
        <button type="button" className="btn danger" disabled={busy} onClick={() => onModal("lost")}>
          Lost…
        </button>
      </div>
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
