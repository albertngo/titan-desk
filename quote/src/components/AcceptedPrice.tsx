"use client";

import { useState } from "react";
import { optionTotals, type LineInput, type OptionTotals } from "@/lib/calc";
import { money, pct } from "@/lib/format";
import { atAcceptedPrice, atDiscountPct, type Accepted } from "@/lib/pricing/accepted";

/**
 * "If they accept this price": type the pre-tax amount the customer agreed to, or a discount, and
 * see the discount it implies and the margin left, beside the quote as it stands (Albert,
 * 2026-10-22). Analysis only: nothing is saved and the quote is not changed. Staff only: the
 * server never renders it in Customer view, so cost and margin never reach that page.
 */

type Opt = { id: string; name: string; lines: LineInput[] };

const ROWS: { key: keyof OptionTotals; label: string; money?: false }[] = [
  { key: "preDiscount", label: "List price (before discount)" },
  { key: "discount", label: "Discount" },
  { key: "subtotal", label: "Price before HST" },
  { key: "cost", label: "Cost" },
  { key: "profit", label: "Profit" },
  { key: "marginPct", label: "Margin", money: false },
  { key: "hst", label: "HST" },
  { key: "total", label: "Total with HST" },
];

const toNumber = (s: string) => {
  const v = Number(s.replace(/[$,%\s]/g, ""));
  return Number.isFinite(v) && s.trim() !== "" ? v : null;
};

export function AcceptedPrice({ options, discountRate, showHst }: { options: Opt[]; discountRate: number; showHst: boolean }) {
  const [optionId, setOptionId] = useState(options[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("");
  /** Which box was typed last decides the other. */
  const [by, setBy] = useState<"price" | "discount">("price");

  const o = options.find((x) => x.id === optionId) ?? options[0];
  if (!o) return null;
  const now = optionTotals(o.lines, discountRate, showHst);

  let at: Accepted | null = null;
  if (by === "price") {
    const p = toNumber(price);
    at = p !== null ? atAcceptedPrice(o.lines, showHst, p) : null;
  } else {
    const d = toNumber(discount);
    at = d !== null ? atDiscountPct(o.lines, showHst, d) : null;
  }
  const shownPrice = by === "price" ? price : at ? String(at.t.subtotal) : "";
  const shownDiscount = by === "discount" ? discount : at ? String(Math.round(at.rate * 1000) / 10) : "";

  const cell = (t: OptionTotals, r: (typeof ROWS)[number]) => (r.money === false ? pct(t[r.key]) : money(t[r.key]));

  return (
    <section className="card acc" aria-labelledby="acc-h">
      <div className="card-h">
        <span id="acc-h">If they accept a price</span>
        <span className="right">Analysis only: nothing is saved</span>
      </div>
      <div className="card-b">
        <div className="acc-in">
          {options.length > 1 && (
            <label>
              Option
              <select className="in" value={o.id} onChange={(e) => setOptionId(e.target.value)}>
                {options.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Accepted price, before HST
            <input className="in" inputMode="decimal" placeholder={String(now.subtotal)} value={shownPrice} onChange={(e) => { setPrice(e.target.value); setBy("price"); }} />
          </label>
          <label>
            or discount %
            <input className="in" inputMode="decimal" placeholder={String(Math.round(discountRate * 1000) / 10)} value={shownDiscount} onChange={(e) => { setDiscount(e.target.value); setBy("discount"); }} />
          </label>
        </div>

        {at ? (
          <>
            <p className="acc-say">
              {at.rate < 0 ? (
                <>That is <b>{pct(-at.rate * 100)}</b> above the list price.</>
              ) : (
                <>That is a <b>{pct(at.rate * 100)}</b> discount off the list price{discountRate !== 0 ? <> (the quote has {pct(discountRate * 100)} today)</> : null}, leaving a margin of <b>{pct(at.t.marginPct)}</b>.</>
              )}
            </p>
            <div className="tbl-wrap">
              <table className="cmp">
                <thead>
                  <tr>
                    <th />
                    <th>Quote today</th>
                    <th>At accepted price</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => {
                    const a = now[r.key];
                    const b = at.t[r.key];
                    const d = a !== null && b !== null ? b - a : null;
                    const same = d !== null && Math.abs(d) < 0.005;
                    return (
                      <tr key={r.key}>
                        <td>{r.label}</td>
                        <td>{cell(now, r)}</td>
                        <td className={r.key === "profit" || r.key === "marginPct" ? "best" : undefined}>{cell(at.t, r)}</td>
                        <td className={same ? "same" : "diff"}>{d === null || same ? "" : r.money === false ? `${d > 0 ? "+" : ""}${pct(d)}` : `${d > 0 ? "+" : ""}${money(d)}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted">Type the amount the customer agreed to before HST, or the discount, to see the margin that leaves.</p>
        )}
      </div>
    </section>
  );
}
