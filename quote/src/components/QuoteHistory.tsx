"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
export function VersionHistory({ row, open = false }: { row: HistoryRow; /** Details shown from the start (the modal). */ open?: boolean }) {
  const [all, setAll] = useState(open);
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

/** "v2 · Nov 18 · Joey · email and text": one sent version's head line in the compact panel. */
function panelHead(r: HistoryRow): string {
  return [r.label, day(r.sentAt), r.by, r.how].filter(Boolean).join(" · ");
}

/**
 * The compact history at the top of the quote page and the editor (Albert, 2026-11-20: "add that in the quote preview
 * screen as well as the quote edit screen? at the top next to the name? A small scrollable section for ease of use but
 * out of the way"). Pure, so it can be drawn without a sign-in; `HistoryPanel` reads the data.
 */
export function HistoryPanelView({ history, currentId, error = null, loading = false, onPopOut }: { history: SendHistory | null; currentId: string; error?: string | null; loading?: boolean; onPopOut?: () => void }) {
  const rows = history?.rows ?? [];
  const draft = history?.draft ?? null;
  return (
    <section className="qhp" aria-label="Send history">
      <div className="qhp-h">
        History <span className="faint">{loading ? "reading…" : rows.length ? `${rows.length} sent` : "nothing sent yet"}</span>
        {onPopOut && (rows.length > 0 || draft) && (
          <button type="button" className="qhp-pop" onClick={onPopOut} aria-haspopup="dialog" title="Open the whole history, with every detail">
            Pop out <span aria-hidden>⤢</span>
          </button>
        )}
      </div>
      <div className="qhp-b" tabIndex={0}>
        {error && <p className="qhp-r bad">{error}</p>}
        {draft && (
          <div className={`qhp-r${draft.id === currentId ? " cur" : ""}`}>
            <p className="qhp-t">{draft.label} · draft{draft.lastEditedBy ? ` · last saved by ${draft.lastEditedBy}` : ""}{draft.lastEditedAt ? `, ${at(draft.lastEditedAt)}` : ""}</p>
          </div>
        )}
        {rows.map((r) => (
          <div key={r.id} className={`qhp-r${r.id === currentId ? " cur" : ""}`}>
            <p className="qhp-t">
              {panelHead(r)}
              {r.same && <span className="qh-tag">same quote</span>}
            </p>
            <ul className="qh-o">
              {r.options.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
            {r.details.length > 0 && <p className="qhp-d faint" title={r.details.join("\n")}>{r.details.slice(0, 2).join(" · ")}{r.details.length > 2 ? ` · +${r.details.length - 2}` : ""}</p>}
            {r.note && <p className="qhp-n"><span aria-hidden>💬 </span><span className="sr-only">Staff note: </span>{r.note}</p>}
            {r.resends.map((s, i) => (
              <p key={i} className="qhp-d faint">Sent again {s.when ? stampWords(s.when) : ""} by {s.who}{s.note ? ` · 💬 ${s.note}` : ""}</p>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The whole history in a modal (Albert, 2026-11-20: "it is good to have a 'pop out' so it will open as a modal if
 * pressed"): every version, newest first, with its Details open, the version on screen marked. Pure, like the panel.
 */
export function HistoryModalView({ history, currentId, onClose }: { history: SendHistory; currentId: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="modal qhm" role="dialog" aria-modal="true" aria-label="Send history" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-h">
          History <span className="faint">&nbsp;{history.rows.length} sent</span>
          <button ref={closeRef} type="button" className="linkbtn right" onClick={onClose}>Close</button>
        </div>
        <div className="card-b qhm-b">
          {history.draft && (
            <div className={`qhm-r${history.draft.id === currentId ? " cur" : ""}`}>
              <p className="qhm-v">{history.draft.label}{history.draft.id === currentId && <span className="qh-tag">on screen</span>}</p>
              <DraftHistory draft={history.draft} />
            </div>
          )}
          {history.rows.map((r) => (
            <div key={r.id} className={`qhm-r${r.id === currentId ? " cur" : ""}`}>
              <p className="qhm-v">{r.label}{r.id === currentId && <span className="qh-tag">on screen</span>}</p>
              <VersionHistory row={r} open />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The compact history for one version's page, with its Pop out: reads its quote's history once, as All quotes does.
 * It sits under the page's sticky header, not in it, so it scrolls away with the page (Albert, 2026-11-20: "it does
 * not have to be 'sticky'"). The modal is drawn on the body so nothing on the page clips it.
 */
export function HistoryPanel({ quoteRecordId, versionId, status }: { quoteRecordId: string; versionId: string; status: string | null }) {
  const { history, error, loading } = useSendHistory(quoteRecordId, `${versionId}:${status ?? ""}`);
  const [open, setOpen] = useState(false);
  const back = useRef<HTMLElement | null>(null);
  const close = () => {
    setOpen(false);
    back.current?.focus();
  };
  return (
    <>
      <HistoryPanelView
        history={history}
        currentId={versionId}
        error={error}
        loading={loading}
        onPopOut={() => {
          back.current = document.activeElement as HTMLElement | null;
          setOpen(true);
        }}
      />
      {open && history && createPortal(<HistoryModalView history={history} currentId={versionId} onClose={close} />, document.body)}
    </>
  );
}
