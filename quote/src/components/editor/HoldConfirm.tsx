"use client";

import { useEffect, useRef } from "react";
import { money, pct } from "@/lib/format";
import type { HoldChange } from "@/lib/editor/model";
import { MIN_MARGIN_PCT } from "@/lib/pricing/discounts";

/**
 * Confirm a change that a held accepted price had to absorb with more than its discount (Albert, 2026-11-21: "As
 * long as the price stays locked at what was typed. you can adjust the hst and margin as much as needed to account
 * for it. If there needs to be a warning modal popout to confirm the change and what has been affected. id much
 * rather have that"). Lists each option affected: what the customer pays (locked), and the price before HST, HST,
 * profit and margin now and after. Nothing changes until Apply is pressed. Staff only: the editor never opens it in
 * Customer view.
 */
export function HoldConfirm({ changes, onApply, onCancel }: { changes: HoldChange[]; onApply: () => void; onCancel: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const row = (label: string, a: string, b: string, warn = false) => (
    <tr className={warn ? "warn" : undefined}>
      <td>{label}</td>
      <td className="r">{a}</td>
      <td className="r">{b}</td>
    </tr>
  );
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Confirm: the accepted price stays locked" onClick={onCancel} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <div className="modal-card hst-all" onClick={(e) => e.stopPropagation()}>
        <div className="card-h">
          The accepted price stays locked
          <button type="button" className="linkbtn right" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <div className="card-b">
          <p className="sub">What the customer pays does not move. To keep it, this change moves the price before HST, the HST and the margin instead.</p>
          {changes.map((c) => (
            <div key={c.optionId} className="hold-opt">
              <p>
                <b>{c.name || "Untitled"}</b>: customer pays <b>{money(c.total)}</b>, locked.
              </p>
              <table className="hst-all-tbl">
                <thead>
                  <tr>
                    <th />
                    <th className="r">Now</th>
                    <th className="r">After</th>
                  </tr>
                </thead>
                <tbody>
                  {row("Price before HST", money(c.before.subtotal), money(c.after.subtotal))}
                  {row("HST", money(c.before.hst), money(c.after.hst))}
                  {row("Profit", money(c.before.profit), money(c.after.profit))}
                  {row("Margin", pct(c.before.marginPct, 1) || "None", pct(c.after.marginPct, 1) || "None", c.after.marginPct !== null && c.after.marginPct < MIN_MARGIN_PCT)}
                </tbody>
              </table>
              {c.markup && (
                <p className="sub">
                  That is above what the lines and discounts make, so {money(c.after.adjustment)} goes in as the private line &ldquo;Accepted price adjustment&rdquo;. The customer sees it in the option&apos;s Private row.
                </p>
              )}
              {c.after.marginPct !== null && c.after.marginPct < MIN_MARGIN_PCT && <p className="pc-bad">Under the {MIN_MARGIN_PCT}% margin minimum.</p>}
            </div>
          ))}
          <div className="hst-all-acts">
            <button type="button" ref={first} className="btn primary" onClick={onApply}>
              Apply, keep the price locked
            </button>
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
