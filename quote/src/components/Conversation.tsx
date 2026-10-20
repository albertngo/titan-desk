"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { conversationAction } from "@/app/actions/conversation";
import { callLength, photos, summarize, type Attachment, type Message, type ThreadSummary } from "@/lib/conversation/thread";
import { ghlContactUrl } from "@/lib/ghl/ids";
import type { ConversationResult } from "@/lib/quotes/types";

/** How many of the latest messages open at once; "Show earlier" adds the rest. */
const PAGE = 12;

/* ---------- "was it left open?", per device (localStorage; a private window just forgets) ---------- */

function openStore(key: string) {
  const listeners = new Set<() => void>();
  return {
    read: () => {
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    write: (v: boolean) => {
      try {
        localStorage.setItem(key, v ? "1" : "0");
      } catch {
        /* fine */
      }
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}
const serverOpen = () => false;
/** The inline card (New quote) and the side drawer (quote page, editor) each remember their own state. */
const CARD = openStore("quote_conv_open");
const DRAWER = openStore("quote_conv_drawer");

/* ---------- loading ---------- */

/** Loaded once the component is on screen, after the page rendered, so GHL never slows a quote opening. */
function useConversation(contactId: string): ConversationResult | null {
  const [result, setResult] = useState<ConversationResult | null>(null);
  useEffect(() => {
    let live = true;
    conversationAction(contactId).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [contactId]);
  return result;
}

function headlineOf(result: ConversationResult | null, summary: ThreadSummary): string {
  if (!result) return "Loading…";
  if (!result.ok) return result.reason === "not-configured" ? "Not set up" : "GHL didn't answer";
  if (summary.total === 0) return "No messages yet";
  return [
    `${summary.total} message${summary.total === 1 ? "" : "s"}`,
    summary.photos > 0 ? `${summary.photos} photo${summary.photos === 1 ? "" : "s"}` : null,
    summary.lastIn ? `customer wrote ${ago(summary.lastIn)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ---------- the inline card: New quote, under the picked customer ---------- */

/**
 * The customer's GHL conversation, read-only (Albert, 2026-10-20): their texts and emails, our
 * replies and sent quotes, and every photo they sent, in a strip at the top. Never rendered in
 * Customer view (the server leaves it out). Replying happens in GHL: the header links there.
 */
export function Conversation({ contactId, defaultOpen = false }: { contactId: string; defaultOpen?: boolean }) {
  const result = useConversation(contactId);
  const savedOpen = useSyncExternalStore(CARD.subscribe, CARD.read, serverOpen);
  /** A click on this card wins over what the device remembered. */
  const [clickedOpen, setClickedOpen] = useState<boolean | null>(null);
  const open = clickedOpen ?? (defaultOpen || savedOpen);
  const summary = summarize(result?.ok ? result.messages : []);
  const ghlUrl = (result?.ok && result.ghlUrl) || ghlContactUrl(contactId);

  function toggle() {
    const next = !open;
    setClickedOpen(next);
    if (!defaultOpen) CARD.write(next);
  }

  return (
    <section className="card conv" aria-label="Conversation with the customer">
      <div className="card-h conv-h">
        <button type="button" className="conv-toggle" onClick={toggle} aria-expanded={open}>
          <span className={`conv-caret${open ? " open" : ""}`} aria-hidden="true">▸</span>
          Conversation
          <span className="conv-sum">{headlineOf(result, summary)}</span>
        </button>
        <a className="conv-ghl" href={ghlUrl} target="_blank" rel="noreferrer">
          Reply in GHL ↗
        </a>
      </div>
      {open && (
        <div className="card-b conv-b">
          <ConversationBody result={result} ghlUrl={ghlUrl} />
        </div>
      )}
    </section>
  );
}

/* ---------- the side drawer: quote page and editor ---------- */

/**
 * The same conversation as a panel docked to the right edge, so it sits beside the quote
 * while lines are priced: a tab on the edge shows the count, a click opens the panel. On a wide
 * screen the page makes room for it (html[data-conv-open]); on a narrow one it slides over.
 * Remembered open or closed per device.
 */
export function ConversationDrawer({ contactId }: { contactId: string }) {
  const result = useConversation(contactId);
  const savedOpen = useSyncExternalStore(DRAWER.subscribe, DRAWER.read, serverOpen);
  const [clickedOpen, setClickedOpen] = useState<boolean | null>(null);
  const open = clickedOpen ?? savedOpen;
  const summary = summarize(result?.ok ? result.messages : []);
  const ghlUrl = (result?.ok && result.ghlUrl) || ghlContactUrl(contactId);

  function toggle() {
    const next = !open;
    setClickedOpen(next);
    DRAWER.write(next);
  }

  // The page makes room while the panel is open (globals.css reads this), and Escape closes it.
  useEffect(() => {
    const root = document.documentElement;
    if (open) root.dataset.convOpen = "1";
    else delete root.dataset.convOpen;
    if (!open) return () => void delete root.dataset.convOpen;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setClickedOpen(false);
      DRAWER.write(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      delete root.dataset.convOpen;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button type="button" className={`conv-tab${open ? " on" : ""}`} onClick={toggle} aria-expanded={open} aria-controls="conv-panel">
        <span>Conversation</span>
        {summary.total > 0 && <span className="conv-tab-n">{summary.total}</span>}
        {summary.photos > 0 && <span className="conv-tab-n photo">{summary.photos} photo{summary.photos === 1 ? "" : "s"}</span>}
      </button>
      {open && (
        <aside id="conv-panel" className="conv-panel" aria-label="Conversation with the customer">
          <div className="card-h conv-h">
            <span className="conv-title">
              Conversation
              <span className="conv-sum">{headlineOf(result, summary)}</span>
            </span>
            <a className="conv-ghl" href={ghlUrl} target="_blank" rel="noreferrer">
              Reply in GHL ↗
            </a>
            <button type="button" className="conv-close" onClick={toggle} aria-label="Close the conversation">
              ×
            </button>
          </div>
          <div className="conv-panel-b conv-b">
            <ConversationBody result={result} ghlUrl={ghlUrl} />
          </div>
        </aside>
      )}
    </>
  );
}

/* ---------- the thread itself, shared by both ---------- */

function ConversationBody({ result, ghlUrl }: { result: ConversationResult | null; ghlUrl: string }) {
  const [shown, setShown] = useState(PAGE);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);

  const all = result?.ok ? result.messages : [];
  // The whole thread, booking texts and activity included (Albert, 2026-10-20); automated ones are drawn lighter.
  const visible = all;
  const thread = visible.slice(Math.max(0, visible.length - shown));
  const earlier = visible.length - thread.length;
  const pics = photos(visible);

  return (
    <>
      {!result && <Skeleton />}
      {result && !result.ok && <p className={`banner ${result.reason === "not-configured" ? "warn" : "bad"} conv-banner`}>{result.message}</p>}
      {result?.ok && all.length === 0 && <p className="empty">Nothing in GHL with this customer yet. Their texts, emails and photos will show here.</p>}

      {result?.ok && pics.length > 0 && (
        <div className="conv-photos" aria-label="Photos the customer sent">
          <span className="lbl">Photos</span>
          <div className="conv-strip">
            {pics.map((p) => (
              <Thumb key={p.url} a={p} onOpen={setLightbox} />
            ))}
          </div>
        </div>
      )}

      {result?.ok && visible.length > 0 && (
        <ol className="conv-thread">
          {(earlier > 0 || result.more) && (
            <li className="conv-earlier">
              {earlier > 0 ? (
                <button type="button" className="linkbtn" onClick={() => setShown(shown + PAGE * 3)}>
                  Show {Math.min(earlier, PAGE * 3)} earlier of {earlier}
                </button>
              ) : (
                <a href={ghlUrl} target="_blank" rel="noreferrer">
                  Older messages are in GHL ↗
                </a>
              )}
            </li>
          )}
          {thread.map((m) => (
            <Bubble key={m.id} m={m} onOpen={setLightbox} />
          ))}
        </ol>
      )}

      {lightbox && (
        <div className="conv-light" role="dialog" aria-label={lightbox.name} onClick={() => setLightbox(null)}>
          <img src={lightbox.url} alt={lightbox.name} referrerPolicy="no-referrer" />
          <div className="conv-light-bar" onClick={(e) => e.stopPropagation()}>
            <span>{lightbox.name}</span>
            <a className="btn small" href={lightbox.url} target="_blank" rel="noreferrer">
              Open full size ↗
            </a>
            <button type="button" className="btn small" onClick={() => setLightbox(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ m, onOpen }: { m: Message; onOpen: (a: Attachment) => void }) {
  const files = m.attachments.filter((a) => a.kind === "file");
  const images = m.attachments.filter((a) => a.kind === "image");
  const failed = m.status === "failed" || m.status === "undelivered";
  return (
    <li className={`conv-msg ${m.direction}${m.automated ? " auto" : ""}`}>
      <div className="conv-meta">
        <span className="conv-who">{m.direction === "in" ? "Customer" : m.channel === "note" ? "Note" : m.automated ? "Automated" : "Titan"}</span>
        <span className="conv-ch">{m.label}</span>
        {m.callSeconds !== null && <span className="conv-ch">{callLength(m.callSeconds)}</span>}
        {m.at && (
          <time dateTime={m.at} title={new Date(m.at).toLocaleString("en-CA", { timeZone: "America/Toronto" })}>
            {when(m.at)}
          </time>
        )}
        {failed && <span className="chip bad">Not delivered</span>}
      </div>
      {m.subject && <div className="conv-subj">{m.subject}</div>}
      {m.body ? (
        <div className="conv-body">{m.body}</div>
      ) : m.channel === "call" ? (
        <div className="conv-body faint">{m.direction === "in" ? "Incoming call" : "Outgoing call"}</div>
      ) : m.channel === "email" ? (
        <div className="conv-body faint">Email body not available here. Open it in GHL.</div>
      ) : images.length === 0 && files.length === 0 ? (
        <div className="conv-body faint">(no text)</div>
      ) : null}
      {images.length > 0 && (
        <div className="conv-strip small">
          {images.map((a) => (
            <Thumb key={a.url} a={a} onOpen={onOpen} />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <ul className="conv-files">
          {files.map((a) => (
            <li key={a.url}>
              <a href={a.url} target="_blank" rel="noreferrer">
                {a.name} ↗
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** A picture; when the browser cannot load it, a link takes its place (a file without an extension, or a link that has expired). */
function Thumb({ a, onOpen }: { a: Attachment; onOpen: (a: Attachment) => void }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <a className="conv-thumb file" href={a.url} target="_blank" rel="noreferrer" title={a.name}>
        {a.name} ↗
      </a>
    );
  }
  return (
    <button type="button" className="conv-thumb" onClick={() => onOpen(a)} title={a.name}>
      <img src={a.url} alt={a.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    </button>
  );
}

function Skeleton() {
  return (
    <div className="conv-skel" aria-hidden="true">
      <div className="conv-skel-strip">
        <span />
        <span />
        <span />
      </div>
      <div className="conv-skel-line in" />
      <div className="conv-skel-line out" />
      <div className="conv-skel-line in" />
    </div>
  );
}

/** "Oct 18, 2:02 p.m." in Toronto time, with the year once it is a different one. */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", year: sameYear ? undefined : "numeric", hour: "numeric", minute: "2-digit" });
}

/** "today", "yesterday", "5 days ago", "3 weeks ago". */
function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}
