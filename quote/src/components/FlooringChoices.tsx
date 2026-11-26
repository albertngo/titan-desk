"use client";

import { Children, useState, type ReactNode } from "react";

/**
 * "Choose your flooring" on the customer's page (Albert, 2026-11-26): an option offered in several floorings shows one
 * row per flooring with its price and how it compares with the first, and below it the chosen flooring's own details
 * (each one is a full option underneath, rendered by the page). On a preliminary each flooring keeps its own range, and
 * the headline runs from the lowest to the highest with which is which.
 */
export function FlooringChoices({
  labels,
  figures,
  diffs,
  headline,
  why,
  children,
}: {
  labels: string[];
  /** Each flooring's price ("$5,082.84" or "$4,700 to $5,700"). */
  figures: string[];
  /** Against the first: "Included", "+ $596.64", "- $120.00"; empty on a preliminary. */
  diffs: string[];
  /** A preliminary's "From $4,700 (Laminate) to $8,600 (Engineered oak)". */
  headline?: string;
  why?: string;
  children: ReactNode;
}) {
  const [on, setOn] = useState(0);
  const blocks = Children.toArray(children);
  return (
    <div className="cq-choices">
      <section className="cq-card cq-choose" aria-labelledby="choose-h">
        <h3 id="choose-h">Choose your flooring</h3>
        {headline && <p className="cq-choose-head">{headline}</p>}
        {why && <p className="cq-choose-why">{why}</p>}
        <div className="cq-choose-l" role="radiogroup" aria-labelledby="choose-h">
          {labels.map((l, i) => (
            <label key={i} className={`cq-floor${i === on ? " on" : ""}`}>
              <input type="radio" name="cq-floor" checked={i === on} onChange={() => setOn(i)} />
              <span className="t">{l}</span>
              <span className="d">
                {diffs[i] || figures[i]}
                {diffs[i] && <small>{figures[i]}</small>}
              </span>
            </label>
          ))}
        </div>
        <p className="cq-choose-note">You choose the flooring when you accept. Everything else in this option is the same for each.</p>
      </section>
      {blocks[on]}
    </div>
  );
}
