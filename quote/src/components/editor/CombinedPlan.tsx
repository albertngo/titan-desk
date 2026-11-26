"use client";

import { useMemo, useState } from "react";
import { optionTotals, type LineInput } from "@/lib/calc";
import { money } from "@/lib/format";
import { acceptStages, autoFromFacts, scheduleFacts, scheduleFlags, type PaymentSchedule } from "@/lib/pricing/schedule";
import { partKey, scheduleLines } from "@/lib/quotes/scope";
import type { Part, Scope } from "@/lib/quotes/types";
import type { EditorLine } from "@/lib/editor/model";
import { ScheduleEditor } from "./ScheduleEditor";

type PlanOption = { id: string; name: string; recommended: boolean; part?: Part; scope?: Scope | null; lines: (LineInput & { sourceKind: EditorLine["sourceKind"] })[]; showHst: boolean };

/**
 * The combined schedule (Albert, 2026-11-26: "preview this with a panel below the customer terms. Where it will let me
 * select the multiple options as if the client is going to accept them. And then let me choose a payment plan based on
 * that combination"). Tick one option per Part, as the customer would, and see what they would pay for them together.
 * The schedule picked here is saved on the version (`combined`) and used whenever two or more options are accepted,
 * worked out on the ones actually chosen; left automatic, it is the material deposit rules on those options together.
 * It never changes an option's own schedule (that is the "Payment schedule for option" above).
 */
export function CombinedPlan({ options, discountRate, combined, onChange }: { options: PlanOption[]; discountRate: number; combined: PaymentSchedule | null; onChange: (next: PaymentSchedule | null) => void }) {
  const parts = useMemo(() => [...new Set(options.map((o) => partKey(o)))], [options]);
  const [picks, setPicks] = useState<string[]>(() => parts.flatMap((p) => {
    const mine = options.filter((o) => partKey(o) === p);
    return (mine.find((o) => o.recommended) ?? mine[0]) ? [(mine.find((o) => o.recommended) ?? mine[0]).id] : [];
  }));
  const chosen = options.filter((o) => picks.includes(o.id));
  // Stairs never count as material (2026-11-26).
  const facts = chosen.map((o) => scheduleFacts({ lines: scheduleLines(o), showHst: o.showHst, discountRate }));
  const total = chosen.reduce((a, o) => a + optionTotals(o.lines, discountRate, o.showHst).total, 0);
  const material = facts.reduce((a, f) => a + f.material, 0);
  const auto = autoFromFacts(facts);
  const plan = combined ?? auto;
  const amounts = chosen.length > 1 ? acceptStages(chosen.map((o, i) => ({ plan, planFacts: facts[i], stages: [] })), plan, null, total).stages : [];
  const flags = chosen.length > 1 ? scheduleFlags(plan, chosen.map((o) => ({ name: o.name, lines: scheduleLines(o), showHst: o.showHst, discountRate }))) : [];

  if (options.length < 2) return null;
  return (
    <section className="card ed-combined" aria-label="Combined options payment schedule">
      <div className="card-h">
        Combined options <span className="right">Not for one option: for two or more accepted together</span>
      </div>
      <div className="card-b">
        <p className="note">Tick the options as if the customer is accepting them together. The schedule below is what they would pay for that combination.</p>
        <div className="ed-combined-picks">
          {parts.map((p) => {
            const mine = options.filter((o) => partKey(o) === p);
            const current = mine.find((o) => picks.includes(o.id))?.id ?? null;
            const choose = (id: string | null) => setPicks([...picks.filter((x) => !mine.some((o) => o.id === x)), ...(id ? [id] : [])]);
            return (
              <fieldset key={p}>
                <legend>{p}</legend>
                {mine.map((o) => (
                  <label key={o.id} className="check-in">
                    <input type="radio" name={`combined-${p}`} checked={current === o.id} onChange={() => choose(o.id)} />
                    <span>{o.name || "Unnamed option"}</span>
                    <span className="faint">{money(optionTotals(o.lines, discountRate, o.showHst).total)}</span>
                  </label>
                ))}
                {parts.length > 1 && (
                  <label className="check-in">
                    <input type="radio" name={`combined-${p}`} checked={current === null} onChange={() => choose(null)} />
                    <span className="faint">None</span>
                  </label>
                )}
              </fieldset>
            );
          })}
        </div>
        {chosen.length < 2 ? (
          <p className="note">Pick two or more options to see their combined schedule. One option alone pays by its own.</p>
        ) : (
          <>
            <p className="ed-combined-sum">
              Together: <b>{money(total)}</b> with HST{material > 0 ? <>, of which material <b>{money(material)}</b></> : null}
            </p>
            <ScheduleEditor
              title="Combined payment schedule"
              schedule={combined}
              auto={auto}
              flags={flags}
              onChange={onChange}
              amounts={amounts}
              autoTip="Automatic: worked out on whichever options the customer accepts together, the material first when it is due."
            />
          </>
        )}
      </div>
    </section>
  );
}
