"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { savePayoutsAction } from "@/app/q/[id]/actions";
import { payoutAmount } from "@/lib/calc";
import { money } from "@/lib/format";
import {
  addCard,
  addLine,
  cardSheet,
  cardTotal,
  emptySet,
  groupCards,
  MAX_CARDS,
  moveLine,
  parsePayouts,
  pushProblem,
  pushState,
  rateChanged,
  removeCard,
  removeLine,
  resetRate,
  samePayouts,
  setCard,
  setLine,
  type Candidate,
  type CardHeader,
  type PayoutCard,
  type PayoutSet,
} from "@/lib/payout/cards";
import { cardJpeg } from "./payoutImage";

/**
 * The Payouts tab (Albert, 2026-11-04): tick the options that are final, build one card per contractor from their
 * labour lines, check and edit them (tick, retype a rate, add a line, move a line to someone else, add a card), save,
 * and push each card to the job's CompanyCam project as a picture. Every change is a pure function in
 * src/lib/payout/cards.ts; this screen only calls them. Kept on the quote, so every version shows the same cards.
 */

export type PayoutOption = { id: string; name: string; part: string | null; accepted: boolean; notOffered: boolean };

type Props = {
  quoteRecordId: string;
  versionId: string;
  raw: string;
  options: PayoutOption[];
  defaultIds: string[];
  candidates: Candidate[];
  header: CardHeader;
  contractors: string[];
  camUrl: string | null;
};

const when = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** A number box that lets "12." be typed on the way to "12.5"; hands up a number, or null when blank. */
function NumBox({ value, onChange, label, placeholder, className }: { value: number | null; onChange: (n: number | null) => void; label: string; placeholder?: string; className?: string }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setText(value === null ? "" : String(value));
  }
  return (
    <input
      className={`in num ${className ?? ""}`}
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === "") {
          setLast(null);
          onChange(null);
        } else if (/^-?\d*\.?\d+$/.test(t.trim())) {
          const n = Number(t);
          setLast(n);
          onChange(n);
        }
      }}
    />
  );
}

export function PayoutCards({ quoteRecordId, versionId, raw, options, defaultIds, candidates, header, contractors, camUrl }: Props) {
  const [seen, setSeen] = useState(raw);
  const stored = useMemo(() => parsePayouts(seen), [seen]);
  const [set, setSet] = useState<PayoutSet>(() => stored ?? emptySet());
  const [picked, setPicked] = useState<string[]>(() => (stored?.options.length ? stored.options.filter((id) => options.some((o) => o.id === id)) : defaultIds));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ cardId: string; url: string } | null>(null);
  const [pushing, setPushing] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const dirty = !samePayouts(set, stored);
  const unreadable = Boolean(seen.trim()) && !stored;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  function build() {
    if (set.cards.length && !window.confirm("Build the cards again from the ticked options? Lines, rates and notes typed on the cards are replaced. Pushes already in CompanyCam stay on record.")) return;
    setSet(groupCards(candidates, versionId, options.filter((o) => picked.includes(o.id)).map((o) => o.id), stored));
    setNotice(null);
    setError(null);
  }

  function save() {
    setError(null);
    setNotice(null);
    startSave(async () => {
      const r = await savePayoutsAction(quoteRecordId, seen, set);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setSeen(r.saved);
      setSet(parsePayouts(r.saved) ?? emptySet());
      setNotice("Saved.");
    });
  }

  async function push(card: PayoutCard) {
    setError(null);
    setNotice(null);
    setPushing(card.id);
    try {
      const { base64 } = cardJpeg(cardSheet(card, header));
      const res = await fetch("/api/payout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteRecordId, seen, cardId: card.id, image: base64 }) });
      const r = (await res.json().catch(() => ({ ok: false, message: "The app didn't answer. Try again." }))) as { ok: boolean; message?: string; saved?: string; warning?: string | null };
      if (r.saved !== undefined) {
        setSeen(r.saved);
        setSet(parsePayouts(r.saved) ?? emptySet());
      }
      if (!r.ok) setError(r.message ?? "The card wasn't pushed.");
      else setNotice(r.warning ?? `${card.contractor.trim()}'s card is in CompanyCam.`);
    } catch {
      setError("The card wasn't pushed. Check the connection and try again.");
    } finally {
      setPushing(null);
    }
  }

  function showPreview(card: PayoutCard) {
    setPreview({ cardId: card.id, url: cardJpeg(cardSheet(card, header)).dataUrl });
  }

  const others = (card: PayoutCard) => set.cards.filter((c) => c.id !== card.id);
  const busy = saving || pushing !== null;
  const grand = set.cards.reduce((a, c) => a + cardTotal(c), 0);

  return (
    <section className="card po" aria-labelledby="po-h">
      <div className="card-h" id="po-h">
        Payouts
        <span className="right faint num">
          {set.cards.length} {set.cards.length === 1 ? "card" : "cards"}
          {set.cards.length > 0 && ` · ${money(grand)} labour`}
        </span>
      </div>
      <div className="card-b po-body">
        <p className="faint po-intro">
          One card per contractor: the labour on the options the customer is getting, at what we pay for it. Check the lines, change a rate, add
          what&apos;s missing, then push each card to the job&apos;s CompanyCam photos. Staff only; the customer never sees this.
        </p>

        {unreadable && (
          <div className="rm-odd" role="note">
            The Payouts field in Airtable holds text the app didn&apos;t write, so it isn&apos;t shown as cards. Saving here replaces it.
          </div>
        )}

        <fieldset className="po-opts" disabled={busy}>
          <legend>Final options</legend>
          {options.length === 0 ? (
            <p className="empty">This version has no options.</p>
          ) : (
            <ul>
              {options.map((o) => (
                <li key={o.id}>
                  <label className="tick">
                    <input type="checkbox" checked={picked.includes(o.id)} onChange={() => togglePick(o.id)} />
                    <span>
                      {o.part && <span className="faint">{o.part} · </span>}
                      {o.name}
                      {o.accepted && <span className="po-tag acc">Accepted</span>}
                      {o.notOffered && <span className="po-tag">Not offered</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn" onClick={build} disabled={busy || picked.length === 0}>
            {set.cards.length ? "Build cards again" : "Build cards"}
          </button>
        </fieldset>

        {set.cards.length === 0 ? (
          <p className="empty">No payout cards yet. Tick the final options and press Build cards, or add a card by hand.</p>
        ) : (
          <ol className="po-cards">
            {set.cards.map((card) => {
              const state = pushState(card);
              const problem = pushProblem(card);
              const total = cardTotal(card);
              const split = new Set(card.lines.map((l) => l.option).filter(Boolean)).size > 1;
              return (
                <li key={card.id} className="po-card">
                  <div className="po-top">
                    <input
                      className="in po-name"
                      list="po-contractors"
                      aria-label="Contractor"
                      placeholder="Contractor"
                      maxLength={80}
                      value={card.contractor}
                      onChange={(e) => setSet((s) => setCard(s, card.id, { contractor: e.target.value }))}
                    />
                    <span className="po-total num">{money(total)}</span>
                    <button type="button" className="iconbtn danger" title="Remove card" aria-label={`Remove ${card.contractor || "this"} card`} onClick={() => window.confirm("Remove this card?") && setSet((s) => removeCard(s, card.id))}>
                      ✕
                    </button>
                  </div>
                  <p className={`po-state ${state.kind}`}>
                    {state.kind === "never" ? "Not in CompanyCam yet" : state.kind === "current" ? `In CompanyCam since ${when(state.last.at)}, ${money(state.last.total)}` : `Changed since it went to CompanyCam on ${when(state.last.at)} (${money(state.last.total)})`}
                  </p>

                  <div className="po-scroll">
                    <table className="po-lines">
                      <thead>
                        <tr>
                          <th className="po-c-on"><span className="sr-only">On the card</span></th>
                          <th>Work</th>
                          <th className="po-c-area">Area</th>
                          <th className="num">Qty</th>
                          <th className="num">Rate</th>
                          <th className="num">Amount</th>
                          <th><span className="sr-only">Move or remove</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {card.lines.map((l) => (
                          <tr key={l.id} className={l.on ? "" : "off"}>
                            <td className="po-c-on">
                              <input type="checkbox" aria-label={`${l.description || "Line"} on the card`} checked={l.on} onChange={(e) => setSet((s) => setLine(s, card.id, l.id, { on: e.target.checked }))} />
                            </td>
                            <td>
                              <input className="in" aria-label="Work" placeholder="What the work is" maxLength={160} value={l.description} onChange={(e) => setSet((s) => setLine(s, card.id, l.id, { description: e.target.value }))} />
                              <span className="po-sub faint">
                                {split && l.option ? `${l.option} · ` : ""}
                                {l.ref ? l.section : "Typed on the card"}
                              </span>
                            </td>
                            <td className="po-c-area">
                              <input className="in" aria-label="Area" maxLength={160} value={l.area} onChange={(e) => setSet((s) => setLine(s, card.id, l.id, { area: e.target.value }))} />
                            </td>
                            <td className="num">
                              <div className="po-qty">
                                <NumBox label="Quantity" value={l.qty} onChange={(qty) => setSet((s) => setLine(s, card.id, l.id, { qty }))} />
                                <input className="in po-uom" aria-label="Unit" placeholder="unit" maxLength={20} value={l.uom} onChange={(e) => setSet((s) => setLine(s, card.id, l.id, { uom: e.target.value }))} />
                              </div>
                            </td>
                            <td className="num">
                              <NumBox label="Payout rate" value={l.rate} placeholder={l.cardRate === null ? "rate" : String(l.cardRate)} onChange={(rate) => setSet((s) => setLine(s, card.id, l.id, { rate }))} className={rateChanged(l) ? "changed" : ""} />
                              {rateChanged(l) && (
                                <button type="button" className="linkbtn po-sub" onClick={() => setSet((s) => resetRate(s, card.id, l.id))} title="Back to our labour cost">
                                  was {money(l.cardRate ?? 0)}
                                </button>
                              )}
                            </td>
                            <td className="num po-amt">{money(payoutAmount(l))}</td>
                            <td className="po-c-act">
                              {others(card).length > 0 && (
                                <select className="in po-move" aria-label="Move to another card" value="" onChange={(e) => e.target.value && setSet((s) => moveLine(s, l.id, e.target.value))}>
                                  <option value="">Move…</option>
                                  {others(card).map((c) => (
                                    <option key={c.id} value={c.id}>{c.contractor.trim() || "Unnamed card"}</option>
                                  ))}
                                </select>
                              )}
                              <button type="button" className="iconbtn" title="Remove line" aria-label={`Remove ${l.description || "line"}`} onClick={() => setSet((s) => removeLine(s, card.id, l.id))}>
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="chip-btn" onClick={() => setSet((s) => addLine(s, card.id))}>+ Add line</button>

                  <label className="rm-f po-note">
                    <span>Note on the card</span>
                    <textarea className="in area" maxLength={1000} placeholder="e.g. paid on completion, after the walkthrough" value={card.note} onChange={(e) => setSet((s) => setCard(s, card.id, { note: e.target.value }))} />
                  </label>

                  <div className="po-acts">
                    <button type="button" className="btn" onClick={() => showPreview(card)}>Preview</button>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => push(card)}
                      disabled={busy || dirty || !camUrl || problem !== null}
                      title={!camUrl ? "This quote has no CompanyCam project linked yet." : dirty ? "Save the cards first." : (problem ?? undefined)}
                    >
                      {pushing === card.id ? "Pushing…" : state.kind === "never" ? "Push to CompanyCam" : "Push again"}
                    </button>
                    {(problem || (dirty && !pushing)) && <span className="faint po-why">{dirty ? "Save the cards first." : problem}</span>}
                  </div>
                  {preview?.cardId === card.id && (
                    <figure className="po-preview">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a picture drawn in this browser, not a remote image */}
                      <img src={preview.url} alt={`Payout card for ${card.contractor || "the contractor"}`} />
                      <figcaption>
                        <a className="linkbtn" href={preview.url} download={`Payout ${card.contractor.trim() || "card"}.jpg`}>Download</a>
                        <button type="button" className="linkbtn" onClick={() => setPreview(null)}>Close</button>
                      </figcaption>
                    </figure>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <datalist id="po-contractors">
          {contractors.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        {error && <p className="ca-err rm-err" role="alert">{error}</p>}
        {notice && !error && <p className="po-ok" role="status">{notice}</p>}

        <div className="rm-foot">
          <button type="button" className="chip-btn" onClick={() => setSet((s) => addCard(s))} disabled={busy || set.cards.length >= MAX_CARDS}>
            + Add card
          </button>
          {camUrl && (
            <a className="linkbtn" href={camUrl} target="_blank" rel="noreferrer">Open CompanyCam</a>
          )}
          <span className="rm-state faint">{dirty ? "Unsaved changes" : stored?.at ? `Saved ${when(stored.at)}` : ""}</span>
          <button type="button" className="btn primary" onClick={save} disabled={busy || !dirty}>
            {saving ? "Saving…" : "Save cards"}
          </button>
        </div>
      </div>
    </section>
  );
}
