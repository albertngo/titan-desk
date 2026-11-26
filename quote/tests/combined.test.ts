import { describe, expect, it } from "vitest";
import { optionTotals, type LineInput } from "../src/lib/calc";
import { acceptPlan, acceptStages, autoFromFacts, cleanCombined, cleanSchedule, PRESETS, scheduleFacts, shownStage, versionScheduleField } from "../src/lib/pricing/schedule";
import { addOption, blankQuote, setCombinedSchedule, setOptionSchedule } from "../src/lib/editor/model";
import { cleanEditorQuote, fingerprint, optionFields, planSave } from "../src/lib/quotes/savePlan";
import { OPTION, VERSION } from "../src/lib/airtable/fields";

/* Invented numbers only (quote/CLAUDE.md rule 4). Vault 05_decisions/2026-11-26-quote-schedule-per-option-and-combined. */

const L = (o: Partial<LineInput>): LineInput => ({
  lineType: "Install",
  section: "Install",
  include: true,
  qty: 100,
  waste: null,
  unitPrice: null,
  unitPriceSnap: 4,
  unitCostSnap: 2,
  costOverride: null,
  manualCost: null,
  minChargeSnap: null,
  hasSource: true,
  ...o,
});
const install = L({ qty: 1000, unitPriceSnap: 3 }); // 3,000, untaxed with HST off
const floor = L({ section: "Materials", lineType: "Material", qty: 500, unitPriceSnap: 4 }); // 2,000 + 260 HST
const stairs = L({ qty: 100, unitPriceSnap: 20 }); // 2,000

describe("a payment schedule per option (2026-11-26)", () => {
  it("changing one option's schedule never changes another's", () => {
    let q = addOption(blankQuote());
    const [a, b] = q.options.map((o) => o.id);
    q = setOptionSchedule(q, a, PRESETS["50-50"].schedule());
    expect(q.options[0].schedule?.preset).toBe("50-50");
    expect(q.options[1].schedule).toBeUndefined();
    q = setOptionSchedule(q, a, null);
    expect(q.options[0].schedule).toBeUndefined();
    expect(q.options.find((o) => o.id === b)?.schedule).toBeUndefined();
  });

  it("a version still on one schedule for every option hands it to the others first", () => {
    const old = { ...addOption(blankQuote()), schedule: PRESETS["25-25-25-25"].schedule() };
    const q = setOptionSchedule(old, old.options[0].id, PRESETS["50-50"].schedule());
    expect(q.schedule).toBeNull();
    expect(q.options.map((o) => o.schedule?.preset)).toEqual(["50-50", "25-25-25-25"]);
  });

  it("saves an option's own schedule on the option, and blank when it has none", () => {
    const q = setOptionSchedule(blankQuote(), blankQuote().options[0].id, PRESETS.cash.schedule());
    const own = setOptionSchedule(q, q.options[0].id, PRESETS.cash.schedule()).options[0];
    expect(cleanSchedule(optionFields(own, 1)[OPTION.paymentSchedule] as string)?.preset).toBe("cash");
    expect(optionFields(blankQuote().options[0], 1)[OPTION.paymentSchedule]).toBeNull();
  });

  it("keeps an older draft's fingerprint: nothing joins it until a schedule is set", () => {
    const q = blankQuote();
    expect(fingerprint({ ...q, combined: null })).toBe(fingerprint(q));
    const own = cleanEditorQuote(JSON.parse(JSON.stringify(setOptionSchedule(q, q.options[0].id, PRESETS["50-50"].schedule()))));
    expect(own.options[0].schedule?.preset).toBe("50-50");
    expect(fingerprint(own)).not.toBe(fingerprint(q));
  });
});

describe("the combined schedule (2026-11-26)", () => {
  it("is kept in the version's Payment Schedule field beside the version-wide one, and read back", () => {
    const field = versionScheduleField(null, PRESETS.materials.schedule());
    expect(cleanSchedule(field)).toBeNull();
    expect(cleanCombined(field)?.preset).toBe("materials");
    const both = versionScheduleField(PRESETS["50-50"].schedule(), PRESETS.materials.schedule());
    expect([cleanSchedule(both)?.preset, cleanCombined(both)?.preset]).toEqual(["50-50", "materials"]);
    expect(versionScheduleField(null, null)).toBeNull();
    // A version saved before it reads as having none.
    expect(cleanCombined(JSON.stringify(PRESETS["50-50"].schedule()))).toBeNull();
  });

  it("is written when set and changes no option", () => {
    const q = addOption(blankQuote());
    const next = setCombinedSchedule(q, PRESETS["50-50"].schedule());
    expect(next.options).toBe(q.options);
    const plan = planSave(q, next);
    expect(cleanCombined(plan.version[VERSION.paymentSchedule] as string)?.preset).toBe("50-50");
  });

  it("is automatic on the options together: the material together against the total together", () => {
    const flooring = scheduleFacts({ lines: [install, floor], showHst: false }); // material 2,260 of 5,260
    const stairsOnly = scheduleFacts({ lines: [stairs], showHst: false }); // nothing carries HST
    expect(autoFromFacts([stairsOnly]).preset).toBe("cash");
    expect(autoFromFacts([flooring, stairsOnly]).preset).toBe("materials");
  });
});

describe("accepting with the combined schedule (2026-11-26)", () => {
  const fl = { lines: [install, floor], showHst: false };
  const st = { lines: [stairs], showHst: false };
  const flPlan = PRESETS.materials.schedule();
  const stPlan = PRESETS.cash.schedule();
  const pick = (o: typeof fl, plan: typeof flPlan) => ({ plan, planFacts: scheduleFacts(o), stages: plan.stages.map(() => ({ amount: null as number | null })) });

  it("one option alone pays by its own schedule, as it was sent", () => {
    expect(acceptPlan([pick(st, stPlan)], PRESETS.materials.schedule(), null).schedule).toBe(stPlan);
  });

  it("two together pay by the combined one: the material of both first, then 35%, up to 80% rounded, and the rest", () => {
    const total = optionTotals(fl.lines, 0, false).total + optionTotals(st.lines, 0, false).total; // 7,260
    const { stages } = acceptStages([pick(fl, flPlan), pick(st, stPlan)], null, null, total);
    // Automatic on both: the material deposit. 2,260 of material, 281 more to 35% (2,541), up to 80% (5,808) rounded to
    // the nearest $50 (3,250), and the final makes up the rest.
    expect(stages.map((s) => s.amount)).toEqual([2260, 281, 3250, 1469]);
    expect(Math.round(stages.reduce((a, s) => a + s.amount, 0) * 100)).toBe(total * 100);
    expect(stages.filter(shownStage)).toHaveLength(4);
  });

  it("uses the combined schedule set on the version when there is one", () => {
    const { schedule } = acceptPlan([pick(fl, flPlan), pick(st, stPlan)], PRESETS["50-50"].schedule(), null);
    expect(schedule.preset).toBe("50-50");
  });

  it("a copy frozen before then adds its options' stages up place by place on the version's schedule", () => {
    const old = [{ stages: [{ amount: 100 }, { amount: 100 }, { amount: 50 }] }, { stages: [{ amount: 10 }, { amount: 10 }, { amount: 5 }] }];
    const r = acceptPlan(old, null, PRESETS["35-35-30"].schedule());
    expect(r.frozen.map((s) => s.amount)).toEqual([110, 110, 55]);
    expect(r.schedule.preset).toBe("35-35-30");
  });
});

describe("rounding and typed figures (2026-11-26)", () => {
  const lines = [L({ qty: 1000, unitPriceSnap: 3.33 })]; // 3,330, untaxed
  const total = optionTotals(lines, 0, false).total;

  it("rounds every payment between the deposit and the final to the nearest $50, the final taking the rest", async () => {
    const { stageAmounts } = await import("../src/lib/calc");
    const four = stageAmounts(PRESETS["25-25-25-25"].schedule(), lines, 0, false, total).map((s) => s.amount);
    expect(four).toEqual([832.5, 850, 850, 797.5]);
    const cash = stageAmounts(PRESETS.cash.schedule(), lines, 0, false, total).map((s) => s.amount);
    expect(cash).toEqual([1165.5, 1150, 1014.5]);
  });

  it("never rounds a schedule frozen before then (no round on it)", async () => {
    const { stageAmounts } = await import("../src/lib/calc");
    const old = { ...PRESETS.cash.schedule(), round: undefined };
    expect(stageAmounts(old, lines, 0, false, total).map((s) => s.amount)).toEqual([1165.5, 1165.5, 999]);
  });

  it("keeps what a stage was before a typed figure, so clearing it puts that back", () => {
    const s = PRESETS["35-35-30"].schedule();
    const typed = { ...s, preset: "custom" as const, stages: s.stages.map((x, i) => (i === 1 ? { ...x, part: { kind: "amount" as const, amount: 1000 }, reset: x.part } : x)) };
    const back = cleanSchedule(JSON.parse(JSON.stringify(typed)));
    expect(back?.stages[1]).toMatchObject({ part: { kind: "amount", amount: 1000 }, reset: { kind: "share", pct: 35 } });
  });
});
