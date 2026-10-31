"use client";

import { useState } from "react";

/** One option's card above the quote: what the customer taps to see it. */
export type PickCard = { index: number; label: string; recommended: boolean; name: string; total: string; tag: string };
/** A row of cards: every option, or one scope's (flooring, stairs) when the quote has both. */
export type PickRow = { key: string; heading: string | null; label: string; cards: PickCard[] };

/**
 * The options as tabs (Albert, 2026-10-31: "when you click an option, it cycles through the
 * different options shown" instead of scrolling down to it). Each row of cards shows one option
 * at a time, the recommended one first. Every option stays in the page, hidden, so printing
 * shows them all and the page reads the same without JavaScript until it loads.
 */
export function OptionSwitch({ rows, blocks }: { rows: PickRow[]; blocks: React.ReactNode[] }) {
  const [picked, setPicked] = useState<Record<string, number>>(() =>
    Object.fromEntries(rows.map((r) => [r.key, (r.cards.find((c) => c.recommended) ?? r.cards[0])?.index ?? 0])),
  );
  const rowOf = new Map(rows.flatMap((r) => r.cards.map((c) => [c.index, r.key] as const)));
  const shown = (i: number) => {
    const key = rowOf.get(i);
    return key === undefined || picked[key] === i;
  };

  return (
    <>
      {rows.map((r) => (
        <nav className="cq-pick" aria-label={r.label} key={r.key}>
          {r.heading && <h2 className="cq-scope">{r.heading}</h2>}
          {r.cards.map((c) => {
            const on = picked[r.key] === c.index;
            return (
              <button
                key={c.index}
                type="button"
                className={`cq-card cq-pickc${c.recommended ? " rec" : ""}${on ? " on" : ""}`}
                aria-pressed={on}
                aria-controls={`option-${c.index + 1}`}
                onClick={() => setPicked({ ...picked, [r.key]: c.index })}
              >
                <span className="cq-num">
                  {c.label}
                  {c.recommended && <b> · Recommended</b>}
                </span>
                <span className="nm">{c.name}</span>
                <span className="tot">{c.total}</span>
                <span className="faint">{c.tag}</span>
              </button>
            );
          })}
        </nav>
      ))}
      {blocks.map((b, i) => (
        <div key={i} className="cq-optwrap" hidden={!shown(i)}>
          {b}
        </div>
      ))}
    </>
  );
}
