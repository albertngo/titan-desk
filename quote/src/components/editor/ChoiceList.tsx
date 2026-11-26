"use client";

import { lineTotal, optionTotals, priceUsed } from "@/lib/calc";
import { money } from "@/lib/format";
import { choiceLabel, choiceLineOf, MAX_CHOICES } from "@/lib/editor/choices";
import { fullBoxes, type EditorOption } from "@/lib/editor/model";

/**
 * The floorings an option offers (Albert, 2026-11-26), under its lines in the editor: one row each with its rate, its
 * square feet in whole boxes (and a button to round up to the next box), the flooring's total and the option's total
 * with it. The first is the one the customer sees first. Pure display; every change goes through the editor's apply.
 */
export function ChoiceList({
  options,
  discountRate,
  hstOf,
  boxSf,
  onShowFirst,
  onRemove,
  onRound,
  onAdd,
}: {
  /** The group, the lead first. */
  options: EditorOption[];
  discountRate: number;
  hstOf: (o: EditorOption) => boolean;
  boxSf: Readonly<Record<string, number | null | undefined>>;
  onShowFirst: (optionId: string) => void;
  onRemove: (optionId: string) => void;
  onRound: (optionIds: string[]) => void;
  onAdd: () => void;
}) {
  const totals = options.map((o) => optionTotals(o.lines, discountRate, hstOf(o)).total);
  const boxes = options.map((o) => {
    const l = choiceLineOf(o);
    return l?.sourceId ? fullBoxes(l, boxSf[l.sourceId]) : null;
  });
  const roundable = options.filter((_, i) => boxes[i] && !boxes[i]!.whole).map((o) => o.id);
  const lo = Math.min(...totals);
  const hi = Math.max(...totals);

  return (
    <section className="ed-choices" aria-label="Floorings the customer can choose">
      <div className="ed-choices-h">
        <b>Floorings the customer can choose</b>
        <span className="faint">
          {options.length > 1 ? `Total ${money(lo)} to ${money(hi)}` : "Add a second flooring to offer a choice"}
          {roundable.length > 1 && (
            <>
              {" · "}
              <button type="button" className="linkbtn" onClick={() => onRound(roundable)}>
                Round every flooring up to full boxes
              </button>
            </>
          )}
        </span>
      </div>
      <ol className="ed-choices-l">
        {options.map((o, i) => {
          const l = choiceLineOf(o);
          const fb = boxes[i];
          const box = l?.sourceId ? boxSf[l.sourceId] : null;
          return (
            <li key={o.id} className={i === 0 ? "first" : undefined}>
              <label className="ed-choice-first" title="The flooring the customer sees first">
                <input type="radio" name={`first-${options[0].choiceGroup}`} checked={i === 0} onChange={() => onShowFirst(o.id)} aria-label={`Show ${choiceLabel(o)} first`} />
              </label>
              <span className="ed-choice-n">
                {choiceLabel(o)}
                {i === 0 && <span className="chip">Shown first</span>}
                <small>
                  {l ? `${money(priceUsed(l))} / ${l.uom ?? "sf"}` : ""}
                  {l?.qty != null ? ` · ${Math.round(l.qty * 100) / 100} ${l.uom ?? "sf"}` : ""}
                  {fb && box ? ` · ${Math.round(fb.boxes * 100) / 100} boxes of ${Math.round(box * 100) / 100} sf` : ""}
                  {fb && !fb.whole && (
                    <>
                      {" · "}
                      <button type="button" className="linkbtn" onClick={() => onRound([o.id])}>
                        Round up to {fb.up} boxes
                      </button>
                    </>
                  )}
                </small>
              </span>
              <span className="ed-choice-m">{l ? money(lineTotal(l) ?? 0) : ""}</span>
              <span className="ed-choice-t">{money(totals[i])}</span>
              <button type="button" className="linkbtn ed-choice-x" onClick={() => onRemove(o.id)} aria-label={`Stop offering ${choiceLabel(o)}`} title={i === 0 && options.length > 1 ? "The next flooring is shown first instead" : "Stop offering this flooring"}>
                ×
              </button>
            </li>
          );
        })}
      </ol>
      {options.length < MAX_CHOICES && (
        <button type="button" className="addrow" onClick={onAdd}>
          + Offer another flooring
        </button>
      )}
      <p className="note">The square feet and waste are shared: change them on the flooring line above. Every other line is shared by all the floorings.</p>
    </section>
  );
}
