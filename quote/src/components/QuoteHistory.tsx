"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { sendHistoryAction } from "@/app/actions/history";
import type { SendHistory } from "@/lib/quotes/sendHistory";

/** Changes shown before "+N more". */
const SHOWN = 3;

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" });
/** An Edit Log stamp, already Toronto time ("2026-11-19 14:05"), as "Nov 19, 14:05". */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const stampWords = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/.exec(s);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[4]}` : s;
};
const at = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Show history on All quotes (Albert, 2026-11-20: "a per quote expand history/show history"; "Jsut the quote app
 * front desk"). Each version that went out, newest first: who sent it and how, the staff note, and what changed since
 * the send before. Read when pressed (src/lib/quotes/sendHistoryLoad.ts), so the list stays as light as it was.
 */
export function QuoteHistory({ quoteRecordId }: { quoteRecordId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SendHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState<Set<string>>(new Set());
  const [loading, start] = useTransition();

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data) {
      setError(null);
      start(async () => {
        try {
          const r = await sendHistoryAction(quoteRecordId);
          if (r.ok) setData(r.history);
          else setError(r.message);
        } catch {
          setError("The history couldn't be read. Try again.");
        }
      });
    }
  }

  return (
    <div className="qh">
      <button type="button" className="qh-tog" aria-expanded={open} onClick={toggle}>
        {open ? "Hide history" : "Show history"}
      </button>
      {open && (
        <div className="qh-b" aria-live="polite">
          {loading && <p className="faint">Reading the history…</p>}
          {error && <p className="sq-msg bad">{error}</p>}
          {data && data.draft && (
            <p className="qh-draft">
              <Link href={`/q/${data.draft.id}`}>{data.draft.label}</Link> is the working draft
              {data.draft.lastEditedBy ? `, last saved by ${data.draft.lastEditedBy}` : ""}
              {data.draft.lastEditedAt ? ` ${at(data.draft.lastEditedAt)}` : ""}. Not sent yet.
            </p>
          )}
          {data && data.rows.length === 0 && <p className="faint">Nothing has been sent from the app yet.</p>}
          {data && data.rows.length > 0 && (
            <ol className="qh-l">
              {data.rows.map((r) => {
                const all = more.has(r.id);
                const shown = all ? r.changes : r.changes.slice(0, SHOWN);
                const hidden = r.changes.length - shown.length;
                return (
                  <li key={r.id}>
                    <div className="qh-h">
                      <Link href={`/q/${r.id}`} className="qh-v">{r.label}</Link>
                      <span>
                        Sent {day(r.sentAt)} by <b>{r.by}</b>
                        {r.how && <span className="faint"> · {r.how}</span>}
                      </span>
                    </div>
                    <ul className={`qh-c${r.first ? " first" : ""}`}>
                      {shown.map((c, i) => <li key={i}>{c}</li>)}
                      {hidden > 0 && (
                        <li>
                          <button type="button" className="qh-more" onClick={() => setMore((s) => new Set(s).add(r.id))}>+{hidden} more</button>
                        </li>
                      )}
                    </ul>
                    {r.note && <p className="qh-note"><span aria-hidden>💬 </span><span className="sr-only">Staff note: </span>{r.note}</p>}
                    {r.resends.map((s, i) => (
                      <p key={i} className="qh-re faint">
                        Sent again {s.when ? stampWords(s.when) : ""} by {s.who}{s.how ? ` · ${s.how}` : ""}
                        {s.note && <span className="qh-note-in"> · 💬 {s.note}</span>}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
