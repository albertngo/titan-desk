"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { savePayoutsAction } from "@/app/q/[id]/actions";
import { payoutAmount } from "@/lib/calc";
import { money } from "@/lib/format";
import {
  addCard,
  addLine,
  assignOption,
  cardSheet,
  cardTotal,
  emptySet,
  groupCards,
  MAX_CARDS,
  moveLine,
  moveLineTo,
  parsePayouts,
  pushProblem,
  pushState,
  rateChanged,
  removeCard,
  removeLine,
  resetRate,
  samePayouts,
  scopeTotals,
  setCard,
  setLine,
  stairsOptions,
  type Candidate,
  type CardHeader,
  type PayoutCard,
  type PayoutSet,
} from "@/lib/payout/cards";
import { cardJpeg } from "./payoutImage";

/**
 * The Payouts tab (Albert, 2026-11-04): tick the options that are final, build one card per contractor from their
 * labour lines, check and edit them (tick, retype a rate, add a line, move a line to someone else, add a card), save,
 * and mark each card final, which sends it with its picture to the contractor's own Notion Project Costs line (since
 * 2026-11-24; it used to go to CompanyCam, where a share link showed everyone's pay). Every change is a pure function in
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
  /** The quote's Notion project (Titan Projects): marking a card final needs it (2026-11-24). */
  projectUrl: string | null;
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

const NO_PROJECT = "This quote has no Notion project yet. It's filled in once the job is won.";
/** The select value that asks for a typed name (2026-11-17: any payout receiver, not only the Rate Card's). */
const NEW = "__new__";
/** Ask for a payout receiver's name; null when cancelled or blank. */
function askName(): string | null {
  const name = window.prompt("Who is this payout for? Type any name: a contractor, a crew or a person.");
  return name && name.trim() ? name.trim().slice(0, 80) : null;
}

export function PayoutCards({ quoteRecordId, versionId, raw, options, defaultIds, candidates, header, contractors, camUrl, projectUrl }: Props) {
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
    if (set.cards.length && !window.confirm("Build the cards again from the ticked options? Lines, rates and notes typed on the cards are replaced. Cards already marked final stay in Project Costs.")) return;
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

  /**
   * Mark one card final. Unsaved changes are saved first, in the same click (Albert, 2026-11-05: the button stayed
   * greyed out until Save cards, at the foot of the tab, was pressed). The picture is drawn from the card as saved,
   * which is what the server checks it against.
   */
  async function push(card: PayoutCard) {
    setError(null);
    setNotice(null);
    setPushing(card.id);
    try {
      let at = seen;
      let sent = card;
      if (dirty) {
        const r = await savePayoutsAction(quoteRecordId, seen, set);
        if (!r.ok) {
          setError(r.message);
          return;
        }
        const now = parsePayouts(r.saved) ?? emptySet();
        setSeen(r.saved);
        setSet(now);
        at = r.saved;
        const kept = now.cards.find((c) => c.id === card.id);
        if (!kept) {
          setError("The cards were saved, but this one wasn't among them. Check it and mark it final again.");
          return;
        }
        const problem = pushProblem(kept);
        if (problem) {
          setError(problem);
          return;
        }
        sent = kept;
      }
      const { base64 } = cardJpeg(cardSheet(sent, header));
      const res = await fetch("/api/payout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteRecordId, seen: at, cardId: sent.id, image: base64 }) });
      const r = (await res.json().catch(() => ({ ok: false, message: "The app didn't answer. Try again." }))) as { ok: boolean; message?: string; saved?: string; warning?: string | null };
      if (r.saved !== undefined) {
        setSeen(r.saved);
        setSet(parsePayouts(r.saved) ?? emptySet());
      }
      if (!r.ok) setError(r.message ?? "The card wasn't marked final.");
      else setNotice(r.warning ?? `${card.contractor.trim()}'s card is final and in Project Costs. Their Project Week page is updated.`);
    } catch {
      setError("The card wasn't marked final. Check the connection and try again.");
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
          what&apos;s missing, then mark each card final. It goes to that contractor&apos;s own Project Costs line and their Project Week page, never to anyone else. Staff only; the customer never sees this.
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

        {stairsOptions(set).length > 0 && (
          // One contractor does a whole staircase (Albert, 2026-11-17): pick them once and every line of the option goes to their card.
          <fieldset className="po-opts po-stairs" disabled={busy}>
            <legend>Stairs contractor</legend>
            <ul>
              {stairsOptions(set).map((s) => (
                <li key={s.option}>
                  <label className="po-stair">
                    <span>{s.option}</span>
                    <select className="in" aria-label={`Contractor for ${s.option}`} value={s.contractor} onChange={(e) => {
                        const v = e.target.value === NEW ? askName() : e.target.value;
                        if (v) setSet((x) => assignOption(x, s.option, v));
                      }}>
                      <option value="">{s.contractor ? s.contractor : "Pick a contractor…"}</option>
                      {[...new Set([...contractors, ...set.cards.map((c) => c.contractor.trim()).filter(Boolean)])]
                        .filter((c) => c.toLowerCase() !== s.contractor.toLowerCase())
                        .sort()
                        .map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      <option value={NEW}>+ New contractor…</option>
                    </select>
                  </label>
                </li>
              ))}
            </ul>
            <p className="faint">Moves every line of that stairs option onto the contractor&apos;s card, making the card if there isn&apos;t one. + New contractor… takes any name you type.</p>
          </fieldset>
        )}

        {set.cards.length === 0 ? (
          <p className="empty">No payout cards yet. Tick the final options and press Build cards, or press + New contractor to start a card for anyone you type.</p>
        ) : (
          <ol className="po-cards">
            {set.cards.map((card) => {
              const state = pushState(card);
              const problem = pushProblem(card);
              const total = cardTotal(card);
              const split = new Set(card.lines.map((l) => l.option).filter(Boolean)).size > 1;
              const scopes = scopeTotals(card);
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
                  {scopes.split && (
                    <p className="po-scopes faint num">
                      Flooring {money(scopes.flooring)} · Stairs {money(scopes.stairs)} · Total {money(total)}
                    </p>
                  )}
                  <p className={`po-state ${state.kind}`}>
                    {state.kind === "never" ? "Not final yet" : state.kind === "current" ? `${state.last.notionPageId ? "Final in Project Costs" : "Sent to CompanyCam (before Nov 24)"} since ${when(state.last.at)}, ${money(state.last.total)}` : `Changed since it was marked final on ${when(state.last.at)} (${money(state.last.total)})`}
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
                              <select
                                className="in po-move"
                                aria-label="Move to another card"
                                value=""
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === NEW) {
                                    const name = askName();
                                    if (name) setSet((s) => moveLineTo(s, l.id, name));
                                  } else if (v) setSet((s) => moveLine(s, l.id, v));
                                }}
                              >
                                <option value="">Move…</option>
                                {others(card).map((c) => (
                                  <option key={c.id} value={c.id}>{c.contractor.trim() || "Unnamed card"}</option>
                                ))}
                                <option value={NEW}>+ New contractor…</option>
                              </select>
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
                      disabled={busy || !projectUrl || problem !== null}
                      title={!projectUrl ? NO_PROJECT : (problem ?? (dirty ? "Saves the cards, then marks this one final." : undefined))}
                    >
                      {pushing === card.id ? "Marking final…" : dirty ? "Save and mark final" : state.kind === "never" ? "Mark final" : "Mark final again"}
                    </button>
                    {(!projectUrl || problem) && <span className="faint po-why">{!projectUrl ? NO_PROJECT : problem}</span>}
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
          <button
            type="button"
            className="chip-btn"
            title="A card for anyone you type: a contractor, a crew or a person, on the Rate Card or not"
            onClick={() => {
              const name = askName();
              if (name) setSet((s) => addCard(s, name));
            }}
            disabled={busy || set.cards.length >= MAX_CARDS}
          >
            + New contractor
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
