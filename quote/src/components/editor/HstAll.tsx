"use client";

import { useEffect, useRef, useState } from "react";
import { optionTotals, type LineInput } from "@/lib/calc";
import { money } from "@/lib/format";

type Opt = { id: string; name: string; lines: LineInput[]; hst: boolean };

/**
 * Charge HST on every option, or on none (Albert, 2026-11-04: "a button that can turn all options on or off… with a
 * confirmation modal"). The modal lists each option's HST now and what it becomes, with its total with HST, so nobody
 * flips a sent price by accident. Nothing changes until one of the two choices is pressed.
 */
export function HstAll({ options, discountRate, onApply }: { options: Opt[]; discountRate: number; onApply: (on: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) first.current?.focus();
  }, [open]);
  if (options.length < 2) return null;
  const close = () => setOpen(false);
  const pick = (on: boolean) => {
    onApply(on);
    setOpen(false);
  };
  const total = (o: Opt, on: boolean) => optionTotals(o.lines, discountRate, on).total;
  const allOn = options.every((o) => o.hst);
  const allOff = options.every((o) => !o.hst);
  return (
    <>
      <button type="button" className="linkbtn hst-all-btn" onClick={() => setOpen(true)}>
        Set HST for all options…
      </button>
      {open && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Set HST for all options" onClick={close} onKeyDown={(e) => e.key === "Escape" && close()}>
          <div className="modal-card hst-all" onClick={(e) => e.stopPropagation()}>
            <div className="card-h">
              HST for all {options.length} options
              <button type="button" className="linkbtn right" onClick={close}>
                Cancel
              </button>
            </div>
            <div className="card-b">
              <p className="sub">Each option keeps its own HST setting. This sets every one of them at once. Material lines keep their own HST box either way.</p>
              <table className="hst-all-tbl">
                <thead>
                  <tr>
                    <th>Option</th>
                    <th>HST now</th>
                    <th className="r">Total, HST on</th>
                    <th className="r">Total, HST off</th>
                  </tr>
                </thead>
                <tbody>
                  {options.map((o) => (
                    <tr key={o.id}>
                      <td>{o.name || "Untitled"}</td>
                      <td>{o.hst ? "Charged" : "Off"}</td>
                      <td className="r">{money(total(o, true))}</td>
                      <td className="r">{money(total(o, false))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="hst-all-acts">
                <button type="button" ref={first} className="btn primary" disabled={allOn} onClick={() => pick(true)}>
                  Charge HST on all
                </button>
                <button type="button" className="btn" disabled={allOff} onClick={() => pick(false)}>
                  No HST on any
                </button>
                <button type="button" className="btn" onClick={close}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
