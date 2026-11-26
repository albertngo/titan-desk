"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import { acceptPlan, acceptStages, depositSplit, shownStage, type PayHow } from "@/lib/pricing/schedule";
import { DepositParts } from "@/components/DepositParts";
import { leadPrice, optionNo, optionTitle, partKeys, partOf, partWords, stageNote, stagesOf, type CustomerCopy } from "@/lib/send/copy";

/**
 * The payment schedule once, at the end of the customer's page (Albert, 2026-11-26: "The payment option on the customer
 * view should only show at the END; when they are selecting options and the payment plan adjusts based on the option
 * they select; not show below each one"). For a page with no Accept panel (a preliminary, a link past its date): pick
 * an option per Part, as the Accept panel does, and the schedule follows, one option's own or the combined one.
 * On a range (a preliminary) it is said in shares, never in dollars.
 */
export function PlanAtEnd({ copy }: { copy: CustomerCopy }) {
  const options = useMemo(() => copy.options.map((o, index) => ({ o, index, part: partOf(o) })), [copy.options]);
  const parts = partKeys(options);
  const split = parts.length > 1;
  const [picks, setPicks] = useState<number[]>(() =>
    parts.flatMap((part) => {
      const mine = options.filter((x) => x.part === part);
      const rec = mine.find((x) => x.o.recommended);
      return rec ? [rec.index] : !split && mine[0] ? [mine[0].index] : [];
    }),
  );
  const chosen = options.filter((x) => picks.includes(x.index));
  const ranged = chosen.some((x) => x.o.range);
  const total = chosen.reduce((a, x) => a + x.o.totals.total, 0);
  const lines = useMemo((): { label: string; note: string; bare: string; figure: string; kind: string; pay: PayHow; amount: number | null }[] => {
    const picked = chosen.map((x) => ({ plan: x.o.plan, planFacts: x.o.planFacts, stages: stagesOf(x.o) }));
    if (!picked.length) return [];
    if (!ranged) return acceptStages(picked, copy.combinedPlan, copy.paymentSchedule, total).stages.filter(shownStage).map((s) => ({ label: s.label, note: stageNote(s), bare: stageNote({ when: s.when, pay: null, kind: s.kind }), figure: money(s.amount), kind: s.kind, pay: s.pay, amount: s.amount }));
    // A range: one option as it was frozen; several by the combined schedule's own words.
    if (picked.length === 1) return stagesOf(chosen[0].o).filter((s) => s.amount === null || shownStage(s)).map((s) => ({ label: s.label, note: stageNote(s), bare: stageNote({ when: s.when, pay: null, kind: s.kind }), figure: s.kind === "balance" ? "The balance" : s.kind === "materials" ? "Your materials" : s.target ? `Up to ${s.target}% in all` : s.pct !== null ? `${s.pct}%` : "", kind: s.kind, pay: s.pay, amount: null }));
    return acceptPlan(picked, copy.combinedPlan, copy.paymentSchedule).schedule.stages.map((s) => ({
      label: s.label,
      note: stageNote({ when: s.when, pay: s.pay, kind: s.part.kind }),
      bare: stageNote({ when: s.when, pay: null, kind: s.part.kind }),
      figure: s.part.kind === "balance" ? "The balance" : s.part.kind === "materials" ? "Your materials" : s.part.kind === "amount" ? money(s.part.amount) : s.part.kind === "share" || s.part.kind === "ofTotal" ? `${s.part.pct}%` : `Up to ${s.part.pct}% in all`,
      kind: s.part.kind,
      pay: s.pay,
      amount: null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, ranged, total, copy.combinedPlan, copy.paymentSchedule]);
  const n = depositSplit(lines);
  const dep = n >= 2 ? lines.slice(0, n) : [];
  const withHst = chosen.some((x) => leadPrice(copy, x.o.totals).addsHst);

  return (
    <section className="cq-card cq-plan" aria-labelledby="plan-h">
      <h2 id="plan-h">Payment schedule{ranged ? ", on the final price" : withHst ? ", with HST" : ""}</h2>
      {(split || options.length > 1) && <p className="cq-plan-note">It follows the options you choose.</p>}
      {parts.map((part) => {
        const mine = options.filter((x) => x.part === part);
        if (!split && mine.length < 2) return null;
        const words = partWords(part);
        const current = mine.find((x) => picks.includes(x.index))?.index ?? null;
        const choose = (index: number | null) => setPicks([...options.filter((x) => x.part !== part && picks.includes(x.index)).map((x) => x.index), ...(index === null ? [] : [index])]);
        return (
          <fieldset className="acc-opts" key={part}>
            <legend>{split ? words.which : "Which option?"}</legend>
            {mine.map((x) => (
              <label key={x.index} className={x.index === current ? "on" : undefined}>
                <input type="radio" name={`plan-option-${part}`} checked={x.index === current} onChange={() => choose(x.index)} />
                <span className="nm">Option {optionNo(copy, x.index)}: {optionTitle(copy, x.index)}</span>
              </label>
            ))}
            {split && (
              <label className={current === null ? "on" : undefined}>
                <input type="radio" name={`plan-option-${part}`} checked={current === null} onChange={() => choose(null)} />
                <span className="nm">{words.none}</span>
              </label>
            )}
          </fieldset>
        );
      })}
      {lines.length === 0 ? (
        <p className="cq-plan-note">Choose an option to see its payment schedule.</p>
      ) : (
        <div className="cq-pay">
          {/* A deposit in parts (2026-11-26): one outlined Deposit, each part with how it is paid. */}
          {dep.length > 0 && (
            <DepositParts
              total={dep.every((s) => s.amount !== null) ? money(dep.reduce((a, s) => a + (s.amount ?? 0), 0)) : dep[dep.length - 1].figure}
              parts={dep.map((s) => ({ label: s.label, note: s.bare, figure: s.figure, pay: s.pay }))}
            />
          )}
          {lines.slice(dep.length).map((s, i) => (
            <div key={i}>
              <span>
                {s.label}
                {s.note && <span className="sub">{s.note}</span>}
              </span>
              <span>{s.figure}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
