"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { findPastQuotesAction, pastOptionsAction } from "@/app/actions/past";
import { money } from "@/lib/format";
import type { PastOption, PastQuote, PastVersion } from "@/lib/quotes/past";

/**
 * Copy options from a past quote (Albert, 2026-11-16). One picker, two places:
 * - the editor's + From a past quote (`onCopy`): find a quote, pick a version, tick its options, copy them in;
 * - New quote's "Start from a past quote" (`onPick`): find a quote and pick a version; the new quote's editor
 *   then opens on those options, all ticked, to copy with one tap.
 * It reads only (src/lib/quotes/past.ts); copying is an unsaved editor change.
 */

export type PickedVersion = { versionId: string; words: string };

const versionWords = (v: PastVersion) =>
  [v.changeNo ? `Change ${v.changeNo}` : v.version != null ? `v${v.version}` : v.label, v.basis, v.status, v.sentAt ? `sent ${v.sentAt.slice(0, 10)}` : null, `${v.optionCount} option${v.optionCount === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" · ");

const quoteWords = (q: PastQuote) => [q.customerName ?? "No name", q.quoteNumber, q.siteCity].filter(Boolean).join(" · ");

export function PastQuotes({
  exceptVersionId = null,
  startVersionId = null,
  onCopy,
  onPick,
  busy = false,
  autoCopy = false,
}: {
  /** The version being edited, left out of the results. */
  exceptVersionId?: string | null;
  /** Open straight on this version's options (from New quote), every option ticked. */
  startVersionId?: string | null;
  onCopy?: (options: PastOption[]) => void;
  onPick?: (picked: PickedVersion) => void;
  busy?: boolean;
  /** Duplicate quote (2026-11-16): copy every option of `startVersionId` straight away, no ticking. */
  autoCopy?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PastQuote[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ versionId: string; title: string; options: PastOption[] } | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [loading, startLoad] = useTransition();

  function search(q: string) {
    setNote(null);
    startSearch(async () => {
      const r = await findPastQuotesAction(q, exceptVersionId).catch(() => null);
      if (!r) return setNote("The search didn't go through. Try again in a moment.");
      setResults(r);
      setOpen(r.length === 1 ? (r[0].quoteRecordId ?? r[0].versions[0]?.id ?? null) : null);
    });
  }

  function load(versionId: string, title: string | null) {
    startLoad(async () => {
      setNote(null);
      const r = await pastOptionsAction(versionId).catch(() => null);
      if (!r || !r.ok) return setNote(r?.message ?? "That quote couldn't be opened. Try again in a moment.");
      if (autoCopy && versionId === startVersionId && onCopy) return onCopy(r.options.filter((o) => !o.notOffered));
      setLoaded({ versionId: r.versionId, title: title ?? [r.customerName, r.version != null ? `v${r.version}` : r.label].filter(Boolean).join(" · "), options: r.options });
      // Not offered options start unticked: they were never sent.
      setTicked(new Set(r.options.filter((o) => !o.notOffered).map((o) => o.id)));
    });
  }

  // From New quote: open on the version picked there.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !startVersionId) return;
    started.current = true;
    load(startVersionId, null);
  });

  const picked = loaded ? loaded.options.filter((o) => ticked.has(o.id)) : [];

  if (loaded && onCopy) {
    return (
      <div className="past">
        <div className="past-head">
          <button type="button" className="linkbtn" onClick={() => setLoaded(null)} disabled={busy}>← Back to the search</button>
          <b>{loaded.title}</b>
        </div>
        <ul className="past-opts">
          {loaded.options.map((o) => (
            <li key={o.id}>
              <label className="check-in">
                <input
                  type="checkbox"
                  checked={ticked.has(o.id)}
                  disabled={busy}
                  onChange={(e) => {
                    const next = new Set(ticked);
                    if (e.target.checked) next.add(o.id);
                    else next.delete(o.id);
                    setTicked(next);
                  }}
                />
                <span className="past-name">{o.name || "Unnamed option"}</span>
                {o.notOffered && <span className="chip">Not offered</span>}
                {o.part && <span className="chip">{o.part}</span>}
                <span className="past-amt">{money(o.listPrice)}</span>
              </label>
              {o.description && <p className="past-desc">{o.description}</p>}
            </li>
          ))}
        </ul>
        <p className="note">Copied as new options of this quote. Lines priced from the card take today&apos;s Rate Card; prices typed on the old quote stay as typed. Discounts, Recommended and Not offered are left behind. Amounts above are the old quote&apos;s, before discounts and HST.</p>
        {note && <div className="banner warn" role="status">{note}</div>}
        <div className="past-foot">
          <button type="button" className="btn primary" disabled={busy || picked.length === 0} onClick={() => onCopy(picked)}>
            {busy ? "Copying…" : picked.length === 0 ? "Copy options" : `Copy ${picked.length} option${picked.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="past">
      <form
        className="nq-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
        }}
      >
        <input className="in" placeholder="Customer, quote number, city or description" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search past quotes" disabled={busy} />
        <button type="submit" className="btn" disabled={searching || busy}>{searching ? "Searching…" : query.trim() ? "Search" : "Latest quotes"}</button>
      </form>
      {note && <div className="banner warn" role="status">{note}</div>}
      {results && results.length === 0 && <p className="note">No past quote with options matches that.</p>}
      {results && results.length > 0 && (
        <ul className="past-list">
          {results.map((q) => {
            const key = q.quoteRecordId ?? q.versions[0]?.id ?? "";
            const isOpen = open === key;
            return (
              <li key={key}>
                <button type="button" className="past-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>
                  <b>{quoteWords(q)}</b>
                  {q.description && <span className="past-desc">{q.description}</span>}
                </button>
                {isOpen && (
                  <ul className="past-vers">
                    {q.versions.map((v) => (
                      <li key={v.id}>
                        <button
                          type="button"
                          className="chip-btn"
                          disabled={loading || busy}
                          onClick={() => {
                            const title = `${quoteWords(q)} · ${v.changeNo ? `Change ${v.changeNo}` : `v${v.version ?? "?"}`}`;
                            if (onPick) onPick({ versionId: v.id, words: title });
                            else load(v.id, title);
                          }}
                        >
                          {versionWords(v)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {loading && <p className="note">Opening…</p>}
    </div>
  );
}
