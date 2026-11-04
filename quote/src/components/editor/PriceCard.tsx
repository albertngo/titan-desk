"use client";

import { useId, useState } from "react";
import { money, pct } from "@/lib/format";
import { optionHst } from "@/lib/calc";
import {
  acceptedIsSet,
  acceptedReason,
  addDiscount,
  discountAmountFrom,
  parseNum,
  priceCeiling,
  removeDiscount,
  resetAccepted,
  setAcceptedPrice,
  setAcceptedReason,
  updateDiscount,
  type EditorOption,
  type EditorQuote,
} from "@/lib/editor/model";
import { isAcceptedLine, isContractorLine, isDiscountLine, MIN_MARGIN_PCT, priceAtMargin, priceAtTotalDiscount, priceSummary } from "@/lib/pricing/discounts";

/**
 * The option's price card, under its totals (Albert, 2026-11-04). Left: the discount items, which stay
 * until removed. Right: the accepted price, three linked boxes (the price before HST, the total discount
 * and the margin): type in one and the other two follow; clear any one, or press Reset, and all three
 * go back to what the slider and the discount items make. The accepted price never goes above that
 * (2026-11-04): a price increase is a Private line or a higher rate, so a typo can't mark a quote up. Under them, the margin and profit at that
 * price, and an (i) with the lowest price that keeps the 20% margin minimum. Every change is a pure
 * function in src/lib/editor/model.ts; this only calls them.
 *
 * Customer view (2026-10-15) shows no cost, margin or profit: the margin box, the readout and the (i)
 * are left out, not hidden.
 */
export function PriceCard({ quote, option, customer, apply }: { quote: EditorQuote; option: EditorOption; customer: boolean; apply: (q: EditorQuote) => boolean | void }) {
  const s = priceSummary(option.lines, quote.discountRate, optionHst(quote, option));
  const set = acceptedIsSet(quote, option);
  const round = (n: number) => Math.round(n * 100) / 100;
  // The accepted price's own discount line is the right-hand side's, never a discount item (2026-11-04).
  const items = option.lines.filter((l) => isDiscountLine(l) && !isAcceptedLine(l));
  const hasAccepted = option.lines.some((l) => isAcceptedLine(l));
  const tipId = useId();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [bad, setBad] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const ceiling = priceCeiling(quote, option.id);
  const below = !customer && s.minPrice !== null && s.subtotal > 0 && s.subtotal < s.minPrice;
  const reset = () => {
    setNote(null);
    apply(resetAccepted(quote, option.id));
  };
  /**
   * One of the three boxes was committed, as the price it means. Cleared is a reset (Albert, 2026-11-04:
   * "Deleting any of the 3 accepted price fields is essentially pressing the reset"). Above the ceiling is
   * refused with the way to charge more; nothing changes.
   */
  const commit = (raw: string, toPrice: (n: number) => number | null) => {
    const v = parseNum(raw.replace("%", ""));
    if (v === null) return reset();
    const price = toPrice(v);
    if (price === null || !(price >= 0)) return setNote("That isn't a price the card can use.");
    if (ceiling === null || round(price) > ceiling) {
      return setNote(`That is above ${money(ceiling ?? 0)}, the price the slider and the discounts make. To charge more, add a Private line or raise a rate.`);
    }
    setNote(null);
    apply(setAcceptedPrice(quote, option.id, price));
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = discountAmountFrom(amount);
    if (amt === null) {
      setBad("Type the discount in dollars, like 250. Discounts here are dollars only.");
      return;
    }
    // Refused when holding the accepted price would need a markup (2026-11-04): the typing stays, the editor says why.
    if (apply(addDiscount(quote, option.id, label, amt)) === false) return;
    setLabel("");
    setAmount("");
    setBad(null);
  };

  return (
    <div className="pc">
      <section className="pc-col pc-disc" aria-labelledby={`${tipId}-d`}>
        <h3 id={`${tipId}-d`}>Discounts</h3>
        <p className="pc-mt">Stay on the quote until removed. The customer sees each one by name.</p>
        {items.length === 0 && <p className="faint pc-none">None.</p>}
        <ul className="pc-items">
          {items.map((l) =>
            isContractorLine(l) ? (
              <li key={l.id} className="pc-item fixed">
                <span className="pc-lbl">{l.description}</span>
                <span className="pc-amt">{money(-(l.unitPrice ?? 0))}</span>
                <span className="pc-why">From the Contractor level</span>
              </li>
            ) : (
              <li key={l.id} className="pc-item">
                <Box text={l.description} label="Discount name" onCommit={(v) => apply(updateDiscount(quote, option.id, l.id, { label: v }))} />
                <Box
                  text={String(-(l.unitPrice ?? 0))}
                  label="Discount amount in dollars"
                  num
                  onCommit={(v) => {
                    const amt = discountAmountFrom(v);
                    if (amt === null) setBad("Discounts are in dollars only, like 250.");
                    else {
                      setBad(null);
                      apply(updateDiscount(quote, option.id, l.id, { amount: amt }));
                    }
                  }}
                />
                <button type="button" className="iconbtn danger" aria-label={`Remove ${l.description || "discount"}`} onClick={() => apply(removeDiscount(quote, option.id, l.id))}>
                  ✕
                </button>
              </li>
            ),
          )}
        </ul>
        <form className="pc-add" onSubmit={add}>
          <input className="cell-in" placeholder="e.g. Senior discount" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="New discount name" />
          <input className="cell-in num" inputMode="decimal" placeholder="$" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="New discount amount, in dollars" />
          <button className="btn small">Add</button>
        </form>
        {bad && <p className="pc-bad">{bad}</p>}
      </section>

      <section className="pc-col pc-acc" aria-labelledby={`${tipId}-a`}>
        <div className="pc-h">
          <h3 id={`${tipId}-a`}>Accepted price</h3>
          {!customer && s.minPrice !== null && (
            <span className="pc-tip">
              <button type="button" className="pc-i" aria-describedby={`${tipId}-tip`} aria-label="Price for the 20% margin minimum">
                i
              </button>
              <span role="tooltip" id={`${tipId}-tip`} className="pc-tipbox">
                To keep the {MIN_MARGIN_PCT}% margin minimum, the price before HST should be at least <b>{money(s.minPrice)}</b> (cost {money(s.cost)}).
              </span>
            </span>
          )}
          <span className="spacer" />
          {set ? <span className="chip" title="Discounts, the slider and line changes move the discount and the margin, never this price. Reset to change it.">Held</span> : <span className="faint pc-follow">Following the slider and discounts</span>}
          <button type="button" className="btn small" disabled={!set} onClick={reset} title="Back to the price the slider and the discounts make">
            Reset
          </button>
        </div>
        <div className="pc-boxes">
          <label>
            Price before HST
            <Box text={String(s.subtotal)} label="Accepted price before HST" num onCommit={(v) => commit(v, (n) => n)} />
          </label>
          <label>
            Total discount %
            <Box text={s.totalDiscountPct === null ? "" : String(s.totalDiscountPct)} label="Total discount percent" num onCommit={(v) => commit(v, (n) => priceAtTotalDiscount(s.gross, n))} />
          </label>
          {!customer && (
            <label className={below ? "warn" : undefined}>
              Margin %
              <Box text={s.marginPct === null ? "" : String(s.marginPct)} label="Margin percent" num onCommit={(v) => commit(v, (n) => priceAtMargin(s.cost, n))} />
            </label>
          )}
        </div>
        {set && <p className="pc-mt">Held at {money(s.subtotal)}. Discounts, the slider and line changes move the discount and the margin, never this price. Reset to change it.</p>}
        {hasAccepted && (
          <label className="pc-reason" title="Printed beside this option's Discount row on the customer's page and PDF, e.g. Fall promotion.">
            Reason the customer sees
            <Box text={acceptedReason(option)} label="Discount reason" placeholder="e.g. Fall promotion" onCommit={(v) => apply(setAcceptedReason(quote, option.id, v))} />
          </label>
        )}
        {note && <p className="pc-bad">{note}</p>}
        {below && s.minPrice !== null && (
          <p className="pc-bad">
            Under the {MIN_MARGIN_PCT}% margin minimum.{" "}
            {ceiling !== null && s.minPrice <= ceiling ? (
              <button type="button" className="linkbtn" onClick={() => commit(String(s.minPrice), (n) => n)}>
                Set {money(s.minPrice)}
              </button>
            ) : (
              "Even with no accepted-price discount it is under. Raise a rate or add a Private line."
            )}
          </p>
        )}
        {!customer && (
          <dl className="pc-sum">
            <div><dt>List price</dt><dd>{money(s.gross)}</dd></div>
            {s.itemsTotal !== 0 && <div><dt>Discount items</dt><dd>{money(-s.itemsTotal)}</dd></div>}
            {s.adjustment !== 0 && <div><dt>Accepted price adjustment</dt><dd>{money(-s.adjustment)}</dd></div>}
            <div className="strong"><dt>Price before HST</dt><dd>{money(s.subtotal)}</dd></div>
            <div><dt>Cost</dt><dd>{money(s.cost)}</dd></div>
            <div><dt>Profit</dt><dd>{money(s.profit)}</dd></div>
            <div className={below ? "warn" : undefined}><dt>Margin</dt><dd>{pct(s.marginPct, 1) || "None"}</dd></div>
          </dl>
        )}
        {quote.options.length > 1 && <p className="pc-mt">{quote.discountRate ? "Saved before options had their own price: every option shares one discount until you set or reset an accepted price here, then each keeps its own." : "This option only. Other options keep their own price."}</p>}
      </section>
    </div>
  );
}

/** A box that commits on blur or Enter; Escape puts it back. */
function Box({ text, label, onCommit, num = false, placeholder }: { text: string; label: string; onCommit: (v: string) => void; num?: boolean; placeholder?: string }) {
  return (
    <input
      key={text}
      className={num ? "cell-in num" : "cell-in"}
      inputMode={num ? "decimal" : undefined}
      aria-label={label}
      defaultValue={text}
      placeholder={placeholder}
      onBlur={(e) => {
        const v = e.currentTarget.value.trim();
        // Put the shown value back: a change remounts the box with the new one, and a refused or
        // no-op commit (a reset with nothing set) must not leave it blank.
        e.currentTarget.value = text;
        if (v !== text) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = text;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
