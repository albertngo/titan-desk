"use client";

import type { StageAmount } from "@/lib/calc";
import { money } from "@/lib/format";
import { MAX_STAGES, PRESETS, defaultSchedule, scheduleProblems, type PayHow, type PaymentSchedule, type PresetKey, type ScheduleStage } from "@/lib/pricing/schedule";

/**
 * The payment schedule in the editor's terms (Albert, 2026-10-27): pick a preset, then change any
 * stage's name, share, "when" and how it is paid. The last stage is always the balance. Every change
 * makes the schedule "Custom". Amounts are shown for the option on screen; the rules and the checks
 * are in src/lib/pricing/schedule.ts, the money in src/lib/calc.ts.
 */
export function ScheduleEditor({
  schedule,
  onChange,
  suggestMaterials,
  amounts,
}: {
  schedule: PaymentSchedule | null;
  onChange: (next: PaymentSchedule | null) => void;
  /** Some of the work carries no HST: offer the material deposit. */
  suggestMaterials: boolean;
  /** The stages in dollars for the option on screen, in order. */
  amounts: StageAmount[];
}) {
  const s = schedule ?? defaultSchedule();
  const problems = scheduleProblems(s);
  const edit = (stages: ScheduleStage[]) => onChange({ preset: "custom", stages });
  const patch = (i: number, p: Partial<ScheduleStage>) => edit(s.stages.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const pick = (key: PresetKey) => {
    if (key === "custom") return;
    // The default is stored as nothing at all, so an untouched quote stays blank in Airtable.
    onChange(key === "35-35-30" ? null : PRESETS[key].schedule());
  };
  const add = () => {
    const at = s.stages.length - 1;
    edit([...s.stages.slice(0, at), { label: `Payment ${at + 1}`, when: "", part: { kind: "share", pct: 10 }, pay: null }, s.stages[at]]);
  };

  return (
    <div className="sched" aria-labelledby="sched-h">
      <div className="sched-h">
        <span id="sched-h">Payment schedule</span>
        <select aria-label="Payment schedule preset" value={schedule ? s.preset : "35-35-30"} onChange={(e) => pick(e.target.value as PresetKey)}>
          {(Object.keys(PRESETS) as Exclude<PresetKey, "custom">[]).map((k) => (
            <option key={k} value={k}>
              {PRESETS[k].name}
              {k === "35-35-30" ? " (default)" : k === "materials" && suggestMaterials ? " (suggested)" : ""}
            </option>
          ))}
          {s.preset === "custom" && <option value="custom">Custom</option>}
        </select>
      </div>
      {suggestMaterials && s.preset !== "materials" && (
        <p className="sched-tip">
          Some of this quote carries no HST. Suggested: the material deposit, paid by e-transfer, with the rest on site.{" "}
          <button type="button" className="linkbtn" onClick={() => pick("materials")}>
            Use it
          </button>
        </p>
      )}
      <ol className="sched-l">
        {s.stages.map((x, i) => {
          const last = i === s.stages.length - 1;
          const a = amounts[i];
          return (
            <li key={`${i}:${JSON.stringify(x)}`} className="sched-r">
              <input className="cell-in" aria-label="Payment name" defaultValue={x.label} onBlur={(e) => e.currentTarget.value !== x.label && patch(i, { label: e.currentTarget.value })} />
              <span className="sched-part">
                {x.part.kind === "share" ? (
                  <>
                    <input
                      className="cell-in num"
                      inputMode="decimal"
                      aria-label="Share, percent"
                      defaultValue={String(x.part.pct)}
                      onBlur={(e) => {
                        const v = Number(e.currentTarget.value.replace(/[%\s]/g, ""));
                        if (Number.isFinite(v) && x.part.kind === "share" && v !== x.part.pct) patch(i, { part: { kind: "share", pct: v } });
                      }}
                    />
                    %
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
                <option value="etransfer">By e-transfer</option>
                <option value="onsite">To the PM on site</option>
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
