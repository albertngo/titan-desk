"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { conversationAction } from "@/app/actions/conversation";
import { callLength, photos, summarize, visibleMessages, type Attachment, type Message } from "@/lib/conversation/thread";
import { ghlContactUrl } from "@/lib/ghl/ids";
import type { ConversationResult } from "@/lib/quotes/types";

/** How many of the latest messages open at once; "Show earlier" adds the rest. */
const PAGE = 12;
/** The card remembers whether it was left open, per device (localStorage; a private window just forgets). */
const OPEN_KEY = "quote_conv_open";
const openListeners = new Set<() => void>();
const readOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
};
const writeOpen = (v: boolean) => {
  try {
    localStorage.setItem(OPEN_KEY, v ? "1" : "0");
  } catch {
    /* fine */
  }
  openListeners.forEach((l) => l());
};
const subscribeOpen = (l: () => void) => {
  openListeners.add(l);
  return () => void openListeners.delete(l);
};
const serverOpen = () => false;

type Props = {
  contactId: string;
  /** Start open (the New quote screen) or folded to its summary line (the quote page). */
  defaultOpen?: boolean;
};

/**
 * The customer's GHL conversation, read-only (Albert, 2026-10-20): their texts and emails, our
 * replies and sent quotes, and every photo they sent, in a strip at the top. Loaded after the
 * page renders so opening a quote is not slowed by GHL; never rendered in Customer view (the
 * server leaves it out). Replying happens in GHL: the header links there.
 */
export function Conversation({ contactId, defaultOpen = false }: Props) {
  const [result, setResult] = useState<ConversationResult | null>(null);
  const savedOpen = useSyncExternalStore(subscribeOpen, readOpen, serverOpen);
  /** A click on this card wins over what the device remembered. */
  const [clickedOpen, setClickedOpen] = useState<boolean | null>(null);
  const open = clickedOpen ?? (defaultOpen || savedOpen);
  const [showAutomated, setShowAutomated] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);

  // Loaded once the card is on screen. A different customer is a different card (key={contactId}).
  useEffect(() => {
    let live = true;
    conversationAction(contactId).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [contactId]);

  function toggle() {
    const next = !open;
    setClickedOpen(next);
    if (!defaultOpen) writeOpen(next);
  }

  const all = result?.ok ? result.messages : [];
  const summary = summarize(all);
  const visible = visibleMessages(all, showAutomated);
  const thread = visible.slice(Math.max(0, visible.length - shown));
  const earlier = visible.length - thread.length;
  const pics = photos(visible);
  const ghlUrl = (result?.ok && result.ghlUrl) || ghlContactUrl(contactId);

  const headline = !result
    ? "Loading…"
    : !result.ok
      ? result.reason === "not-configured"
        ? "Not set up"
        : "GHL didn't answer"
      : summary.total === 0
        ? "No messages yet"
        : [`${summary.total} message${summary.total === 1 ? "" : "s"}`, summary.photos > 0 ? `${summary.photos} photo${summary.photos === 1 ? "" : "s"}` : null, summary.lastIn ? `customer wrote ${ago(summary.lastIn)}` : null]
            .filter(Boolean)
            .join(" · ");

  return (
    <section className="card conv" aria-label="Conversation with the customer">
      <div className="card-h conv-h">
        <button type="button" className="conv-toggle" onClick={toggle} aria-expanded={open}>
          <span className={`conv-caret${open ? " open" : ""}`} aria-hidden="true">▸</span>
          Conversation
          <span className="conv-sum">{headline}</span>
        </button>
        <a className="conv-ghl" href={ghlUrl} target="_blank" rel="noreferrer">
          Reply in GHL ↗
        </a>
      </div>

      {open && (
        <div className="card-b conv-b">
          {!result && <Skeleton />}
          {result && !result.ok && (
            <p className={`banner ${result.reason === "not-configured" ? "warn" : "bad"} conv-banner`}>{result.message}</p>
          )}
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

          {result?.ok && summary.automated > 0 && (
            <label className="check-in conv-auto">
              <input type="checkbox" checked={showAutomated} onChange={(e) => setShowAutomated(e.target.checked)} />
              Show {summary.automated} automated message{summary.automated === 1 ? "" : "s"} (booking texts, reminders, activity)
            </label>
          )}
        </div>
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
    </section>
  );
}

function Bubble({ m, onOpen }: { m: Message; onOpen: (a: Attachment) => void }) {
  const files = m.attachments.filter((a) => a.kind === "file");
  const images = m.attachments.filter((a) => a.kind === "image");
  const failed = m.status === "failed" || m.status === "undelivered";
  return (
    <li className={`conv-msg ${m.direction}${m.automated ? " auto" : ""}`}>
      <div className="conv-meta">
        <span className="conv-who">{m.direction === "in" ? "Customer" : m.channel === "note" ? "Note" : "Titan"}</span>
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
