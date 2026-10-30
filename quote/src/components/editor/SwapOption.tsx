"use client";

import { useMemo, useState } from "react";
import { optionTotals } from "@/lib/calc";
import { swapMatches, swapOption, swapPreview, type SwapSource } from "@/lib/change/swap";
import type { EditorOption, EditorQuote } from "@/lib/editor/model";
import { money } from "@/lib/format";
import { levelOf } from "@/lib/pricing/service";

/**
 * Swap option, on a draft change (Albert, 2026-10-30): the customer now wants another option that was on
 * the accepted version. Pick the option they took and the one they want instead; the lines that came from
 * the first are ticked to come out (untick any to keep, tick any edited since), and the second's come in as
 * quoted. Nothing is saved until Save. The rules are in src/lib/change/swap.ts.
 */
export function SwapOption({
  source,
  quote,
  option,
  contractTotal,
  apply,
  preselect = null,
}: {
  source: SwapSource;
  quote: EditorQuote;
  option: EditorOption;
  contractTotal: number | null;
  apply: (next: EditorQuote) => void;
  /** Put on contract (2026-10-30): an option id to open with, chosen, its pick's lines ticked to come out. */
  preselect?: string | null;
}) {
  const start = preselect ? source.picks.findIndex((p) => p.candidates.some((c) => c.id === preselect)) : -1;
  const [open, setOpen] = useState(start >= 0);
  const [pickIdx, setPickIdx] = useState(Math.max(0, start));
  const [candidateId, setCandidateId] = useState<string | null>(start >= 0 ? preselect : null);
  const [remove, setRemove] = useState<Set<string>>(() => new Set(start >= 0 ? swapMatches(option.lines, source.picks[start].lines) : []));
  const [done, setDone] = useState<string | null>(null);

  const pick = source.picks[pickIdx] ?? source.picks[0];
  const incoming = pick.candidates.find((c) => c.id === candidateId) ?? null;
  const from = "this quote";

  const choose = (c: EditorOption | null, p = pick) => {
    setCandidateId(c?.id ?? null);
    setRemove(new Set(c ? swapMatches(option.lines, p.lines) : []));
    setDone(null);
  };

  const next = useMemo(
    () => (incoming ? swapOption(quote, option.id, [...remove], incoming, { name: pick.name, description: pick.description }) : null),
    [incoming, quote, option.id, remove, pick.name, pick.description],
  );
  const preview = next ? swapPreview(next, option.id) : null;
  const wholeOption = remove.size === option.lines.length;
  const levelDiffers = incoming && !wholeOption && levelOf(incoming) !== levelOf(option);

  if (!open) {
    return (
      <p className="swap-open">
        {done && <span className="chip good">{done}</span>}
        <button className="linkbtn" onClick={() => setOpen(true)}>
          Customer wants another option from {from}? Swap it in
        </button>
      </p>
    );
  }

  return (
    <section className="card swap" aria-labelledby="swap-h">
      <div className="card-h" id="swap-h">
        Swap in another option from {from}
        <button className="linkbtn right" onClick={() => setOpen(false)}>Close</button>
      </div>
      <div className="card-b">
        {source.picks.length > 1 && (
          <div className="swap-row">
            <span className="swap-k">Replace</span>
            {source.picks.map((p, i) => (
              <label key={p.name + i} className="check-in">
                <input
                  type="radio"
                  name="swap-pick"
                  checked={i === pickIdx}
                  onChange={() => {
                    setPickIdx(i);
                    choose(null, p);
                  }}
                />{" "}
                {p.name} <span className="faint">({p.scope})</span>
              </label>
            ))}
          </div>
        )}
        <div className="swap-row">
          <span className="swap-k">{source.picks.length > 1 ? "With" : `Replace ${pick.name} with`}</span>
          {pick.candidates.map((c) => (
            <button key={c.id} className={`btn${c.id === candidateId ? " primary" : ""}`} onClick={() => choose(c)}>
              {c.name || "Untitled"}
              <span className="faint">
                {money(optionTotals(c.lines, quote.discountRate, quote.showHst).subtotal)} before HST · {c.from !== null ? `v${c.from}` : source.version !== null ? `v${source.version}, accepted` : "accepted version"}
              </span>
            </button>
          ))}
        </div>

        {incoming && next && preview && (
          <>
            <div className="swap-cols">
              <div>
                <h3>Coming out ({remove.size})</h3>
                <p className="faint">Ticked: the lines that came from {pick.name}. Untick a line to keep it; tick one changed since.</p>
                <ul className="swap-l">
                  {option.lines.map((l) => (
                    <li key={l.id}>
                      <label className="check-in">
                        <input
                          type="checkbox"
                          checked={remove.has(l.id)}
                          onChange={(e) => {
                            const s = new Set(remove);
                            if (e.target.checked) s.add(l.id);
                            else s.delete(l.id);
                            setRemove(s);
                          }}
                        />{" "}
                        <span className="faint">{l.section ?? "Unsorted"}</span> {l.description || "Untitled line"}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Coming in ({incoming.lines.length})</h3>
                <p className="faint">As quoted on {from}: same quantities and prices.</p>
                <ul className="swap-l">
                  {incoming.lines.map((l) => (
                    <li key={l.id}>
                      <span className="faint">{l.section ?? "Unsorted"}</span> {l.description || "Untitled line"}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {levelDiffers && (
              <p className="banner warn">
                {incoming.name} was quoted at {levelOf(incoming)}; this change is {levelOf(option)}. Its lines come in at the prices quoted. Check them before saving.
              </p>
            )}
            {preview.problems.map((p) => (
              <p key={p} className="banner bad">{p}</p>
            ))}
            <div className="swap-foot">
              <span>
                New total {money(preview.total)} with HST
                {contractTotal !== null && (
                  <span className={`chip ${preview.total >= contractTotal ? "accent" : "warn"}`}>
                    vs contract: {preview.total - contractTotal >= 0 ? "+" : "−"}
                    {money(Math.abs(preview.total - contractTotal))}
                  </span>
                )}
              </span>
              <button
                className="btn primary"
                onClick={() => {
                  apply(next);
                  setDone(`Swapped in ${incoming.name}. Check the lines, then Save.`);
                  setCandidateId(null);
                  setRemove(new Set());
                  setOpen(false);
                }}
              >
                Swap in {incoming.name}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
