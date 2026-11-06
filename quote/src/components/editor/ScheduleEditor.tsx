"use client";

import type { StageAmount } from "@/lib/calc";
import { money } from "@/lib/format";
import { autoReason, MAX_STAGES, PAY_HOWS, PAY_LABELS, PRESETS, sameSchedule, scheduleProblems, type PayHow, type PaymentSchedule, type PresetKey, type ScheduleStage } from "@/lib/pricing/schedule";

/**
 * The payment schedule in the editor's terms (Albert, 2026-10-27): pick a preset, then change any
 * stage's name, share, "when" and how it is paid. The last stage is always the balance. Every change
 * makes the schedule "Custom". Amounts are shown for the option on screen; the rules and the checks
 * are in src/lib/pricing/schedule.ts, the money in src/lib/calc.ts.
 *
 * Automatic (2026-11-05): a version with no schedule of its own follows `auto` (cash with no HST, the material first
 * when only the material carries HST, else 35 / 35 / 30), and changes with the quote's HST. Picking the preset it
 * already is keeps it automatic; picking anything else stores that one.
 */
export function ScheduleEditor({
  schedule,
  auto,
  flags = [],
  onChange,
  amounts,
}: {
  schedule: PaymentSchedule | null;
  /** What the version gets with no schedule of its own (2026-11-05). */
  auto: PaymentSchedule;
  /** Where it goes against the HST rules (2026-11-05): shown here, and the send is refused until it is fixed. */
  flags?: string[];
  onChange: (next: PaymentSchedule | null) => void;
  /** The stages in dollars for the option on screen, in order. */
  amounts: StageAmount[];
}) {
  const s = schedule ?? auto;
  const problems = scheduleProblems(s);
  const edit = (stages: ScheduleStage[]) => onChange({ preset: "custom", stages });
  const patch = (i: number, p: Partial<ScheduleStage>) => edit(s.stages.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const pick = (key: PresetKey) => {
    if (key === "custom") return;
    // The automatic one is stored as nothing at all, so it keeps following the quote's HST.
    const next = PRESETS[key].schedule();
    onChange(key === auto.preset || sameSchedule(next, auto) ? null : next);
  };
  const add = () => {
    const at = s.stages.length - 1;
    edit([...s.stages.slice(0, at), { label: `Payment ${at + 1}`, when: "", part: { kind: "share", pct: 10 }, pay: null }, s.stages[at]]);
  };

  return (
    <div className="sched" aria-labelledby="sched-h">
      <div className="sched-h">
        <span id="sched-h">Payment schedule</span>
        <select aria-label="Payment schedule preset" value={s.preset} onChange={(e) => pick(e.target.value as PresetKey)}>
          {(Object.keys(PRESETS) as Exclude<PresetKey, "custom">[]).map((k) => (
            <option key={k} value={k}>
              {PRESETS[k].name}
              {k === auto.preset ? " (automatic)" : ""}
            </option>
          ))}
          {s.preset === "custom" && <option value="custom">Custom</option>}
        </select>
      </div>
      {!schedule ? (
        <p className="sched-tip">
          {autoReason(auto)} It follows the quote&rsquo;s HST and material until you change it.
        </p>
      ) : (
        !sameSchedule(schedule, auto) && (
          <p className="sched-tip">
            Picked by hand. The automatic one for this quote is {PRESETS[auto.preset as Exclude<PresetKey, "custom">]?.name ?? "35 / 35 / 30"}.{" "}
            <button type="button" className="linkbtn" onClick={() => onChange(null)}>
              Use it
            </button>
          </p>
        )
      )}
      {flags.length > 0 && (
        <div className="sq-msg warn" role="status">
          <b>Fix the payment schedule before sending</b>
          <ul>
            {flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      <ol className="sched-l">
        {s.stages.map((x, i) => {
          const last = i === s.stages.length - 1;
          const a = amounts[i];
          return (
            <li key={`${i}:${JSON.stringify(x)}`} className="sched-r">
              <input className="cell-in" aria-label="Payment name" defaultValue={x.label} onBlur={(e) => e.currentTarget.value !== x.label && patch(i, { label: e.currentTarget.value })} />
              <span className="sched-part">
                {x.part.kind === "share" || x.part.kind === "topUp" || x.part.kind === "ofTotal" ? (
                  <>
                    <input
                      className="cell-in num"
                      inputMode="decimal"
                      aria-label="Share, percent"
                      defaultValue={String(x.part.pct)}
                      onBlur={(e) => {
                        const v = Number(e.currentTarget.value.replace(/[%\s]/g, ""));
                        if (Number.isFinite(v) && (x.part.kind === "share" || x.part.kind === "topUp" || x.part.kind === "ofTotal") && v !== x.part.pct) patch(i, { part: { kind: x.part.kind, pct: v } });
                      }}
                    />
                    {x.part.kind === "topUp" ? "% in all" : x.part.kind === "ofTotal" ? "% of the total" : "%"}
                  </>
                ) : x.part.kind === "materials" ? (
                  "the material"
                ) : x.part.kind === "amount" ? (
                  money(x.part.amount)
                ) : (
                  "the balance"
                )}
              </span>
              <input className="cell-in sched-when" aria-label="When it is due" placeholder="When" defaultValue={x.when} onBlur={(e) => e.currentTarget.value !== x.when && patch(i, { when: e.currentTarget.value })} />
              <select aria-label="How it is paid" value={x.pay ?? ""} onChange={(e) => patch(i, { pay: (e.target.value || null) as PayHow })}>
                <option value="">Not said</option>
                {PAY_HOWS.map((p) => (
                  <option key={p} value={p}>
                    {PAY_LABELS[p]}
                  </option>
                ))}
              </select>
              <span className={`sched-amt${a && a.amount < 0 ? " bad" : ""}`}>{a ? `${money(a.amount)} · ${a.pct}%` : ""}</span>
              {!last && i > 0 ? (
                <button type="button" className="linkbtn" aria-label={`Remove ${x.label}`} onClick={() => edit(s.stages.filter((_, k) => k !== i))}>
                  Remove
                </button>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ol>
      {s.stages.length < MAX_STAGES && (
        <button type="button" className="linkbtn" onClick={add}>
          + Add a payment
        </button>
      )}
      {problems.length > 0 && (
        <ul className="sched-bad" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
