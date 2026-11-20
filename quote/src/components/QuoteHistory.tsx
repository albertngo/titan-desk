"use client";

import { useEffect, useState } from "react";
import { sendHistoryAction } from "@/app/actions/history";
import type { HistoryRow, SendHistory, WorkingDraft } from "@/lib/quotes/sendHistory";

/**
 * The send history on All quotes (Albert, 2026-11-20: "a per quote expand history/show history"; "Jsut the quote app
 * front desk"; then "put the history right below each individual quote line … instead of a separate history
 * section"). Opening a quote's row reads its history once (src/lib/quotes/sendHistoryLoad.ts); each version line then
 * carries its own: who sent it and how, one line per option with install sqft and price, the staff note, Details.
 */

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" });
const at = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** An Edit Log stamp, already Toronto time ("2026-11-19 14:05"), as "Nov 19, 14:05". */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const stampWords = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/.exec(s);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[4]}` : s;
};

/**
 * Read once per quote per page view, keyed by its versions and their statuses: closing and opening a row again
 * doesn't ask Airtable twice, and a new send or version reads it afresh.
 */
const cache = new Map<string, SendHistory>();

export type HistoryState = { history: SendHistory | null; error: string | null; loading: boolean };

/** The quote's history, read when its row is opened (the component using this mounts only then). */
export function useSendHistory(quoteRecordId: string | null, versionsKey: string): HistoryState {
  const key = quoteRecordId ? `${quoteRecordId}|${versionsKey}` : null;
  const [state, setState] = useState<HistoryState & { key: string | null }>(() => {
    const hit = key ? cache.get(key) : undefined;
    return { key, history: hit ?? null, error: null, loading: Boolean(key && !hit) };
  });
  useEffect(() => {
    if (!key || !quoteRecordId || cache.has(key)) return;
    let live = true;
    sendHistoryAction(quoteRecordId)
      .then((r) => {
        if (!live) return;
        if (r.ok) {
          cache.set(key, r.history);
          setState({ key, history: r.history, error: null, loading: false });
        } else setState({ key, history: null, error: r.message, loading: false });
      })
      .catch(() => live && setState({ key, history: null, error: "The history couldn't be read. Reload to try again.", loading: false }));
    return () => {
      live = false;
    };
  }, [key, quoteRecordId]);
  // A key that moved while the row was open: show what is cached for it, else that it is being read.
  if (state.key !== key) {
    const hit = key ? cache.get(key) : undefined;
    return { history: hit ?? null, error: null, loading: Boolean(key && !hit) };
  }
  return state;
}

/** One sent version's history, right under its line. */
export function VersionHistory({ row }: { row: HistoryRow }) {
  const [all, setAll] = useState(false);
  return (
    <div className="qh">
      <p className="qh-h">
        Sent {day(row.sentAt)} by <b>{row.by}</b>
        {row.how && <span className="faint"> · {row.how}</span>}
        {row.same && <span className="qh-tag">Same quote, sent again</span>}
      </p>
      <ul className="qh-o">
        {row.options.map((o, i) => <li key={i}>{o}</li>)}
      </ul>
      {row.details.length > 0 &&
        (all ? (
          <ul className="qh-c">{row.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
        ) : (
          <button type="button" className="qh-more" onClick={() => setAll(true)}>
            Details ({row.details.length})
          </button>
        ))}
      {row.note && (
        <p className="qh-note">
          <span aria-hidden>💬 </span>
          <span className="sr-only">Staff note: </span>
          {row.note}
        </p>
      )}
      {row.resends.map((s, i) => (
        <p key={i} className="qh-re faint">
          Sent again {s.when ? stampWords(s.when) : ""} by {s.who}
          {s.how ? ` · ${s.how}` : ""}
          {s.note && <span className="qh-note-in"> · 💬 {s.note}</span>}
        </p>
      ))}
    </div>
  );
}

/** The working draft's line: not sent yet, and who last saved it. */
export function DraftHistory({ draft }: { draft: WorkingDraft }) {
  return (
    <div className="qh">
      <p className="qh-h faint">
        Not sent yet{draft.lastEditedBy ? <>, last saved by <b>{draft.lastEditedBy}</b></> : null}
        {draft.lastEditedAt ? ` ${at(draft.lastEditedAt)}` : ""}
      </p>
    </div>
  );
}
