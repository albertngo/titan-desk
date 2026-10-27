import { describe, expect, it } from "vitest";
import { materialsDeposit, optionTotals, stageAmountProblems, stageAmounts, type LineInput } from "../src/lib/calc";
import { cleanSchedule, defaultSchedule, PRESETS, sameSchedule, scheduleField, scheduleProblems, suggestsMaterialDeposit, type PaymentSchedule } from "../src/lib/pricing/schedule";
import { cleanEditorQuote, fingerprint, planSave } from "../src/lib/quotes/savePlan";
import { VERSION } from "../src/lib/airtable/fields";
import { blankQuote, setSchedule } from "../src/lib/editor/model";
import { paymentWords } from "../src/lib/send/plan";
import { stagesOf, type CopyOption } from "../src/lib/send/copy";

/* Invented numbers only (quote/CLAUDE.md rule 4). */

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
const install = L({ qty: 500, unitPriceSnap: 3 }); // 1,500
const floor = L({ section: "Materials", lineType: "Material", qty: 500, unitPriceSnap: 4 }); // 2,000
const untaxedFloor = L({ section: "Materials", lineType: "Material", qty: 100, unitPriceSnap: 5, noHst: true }); // 500

describe("payment schedule: presets and checks", () => {
  it("the default is 35 / 35 / balance and passes its own checks", () => {
    const s = defaultSchedule();
    expect(s.stages.map((x) => x.part)).toEqual([{ kind: "share", pct: 35 }, { kind: "share", pct: 35 }, { kind: "balance" }]);
    expect(s.stages[0].pay).toBe("etransfer");
    expect(scheduleProblems(s)).toEqual([]);
  });

  it("every preset is a valid schedule ending in the balance", () => {
    for (const p of Object.values(PRESETS)) {
      const s = p.schedule();
      expect(scheduleProblems(s)).toEqual([]);
      expect(s.stages.at(-1)!.part.kind).toBe("balance");
    }
  });

  it("refuses shares that leave nothing for the balance, a balance that isn't last, and a material stage that isn't the deposit", () => {
    const s = (stages: PaymentSchedule["stages"]): PaymentSchedule => ({ preset: "custom", stages });
    const st = (pct: number) => ({ label: "Pay", when: "", pay: null, part: { kind: "share" as const, pct } });
    const bal = { label: "Final", when: "", pay: null, part: { kind: "balance" as const } };
    expect(scheduleProblems(s([st(60), st(40), bal])).join(" ")).toMatch(/100% or more/);
    expect(scheduleProblems(s([st(50), st(30)])).join(" ")).toMatch(/always the balance/);
    expect(scheduleProblems(s([bal, st(30), bal])).join(" ")).toMatch(/Only the last/);
    expect(scheduleProblems(s([st(30), { ...bal, part: { kind: "materials" } }, bal])).join(" ")).toMatch(/Only the deposit/);
    expect(scheduleProblems(s([st(0), bal])).join(" ")).toMatch(/more than 0%/);
    expect(scheduleProblems(s([{ ...st(30), label: " " }, bal])).join(" ")).toMatch(/needs a name/);
  });

  it("reads back what it wrote, and anything unreadable is the default (null)", () => {
    const s = PRESETS["25-25-25-25"].schedule();
    expect(cleanSchedule(scheduleField(s))).toEqual(s);
    expect(cleanSchedule("not json")).toBeNull();
    expect(cleanSchedule(JSON.stringify({ stages: [{ label: "x", part: { kind: "weird" } }] }))).toBeNull();
    expect(cleanSchedule({ preset: "nonsense", stages: [{ label: "Only", when: 3, part: { kind: "balance" }, pay: "cash" }] })).toEqual({
      preset: "custom",
      stages: [{ label: "Only", when: "", part: { kind: "balance" }, pay: null }],
    });
  });

  it("stores the default as nothing, so an untouched quote stays blank", () => {
    expect(scheduleField(null)).toBeNull();
    expect(scheduleField(defaultSchedule())).toBeNull();
    expect(scheduleField(PRESETS["50-50"].schedule())).not.toBeNull();
    expect(sameSchedule(null, defaultSchedule())).toBe(true);
  });
});

describe("payment schedule: the money (calc.ts)", () => {
  it("the default schedule is exactly the old payment1 / payment2 / paymentFinal", () => {
    for (const rate of [0, 0.1, 0.137]) {
      const lines = [install, floor];
      const t = optionTotals(lines, rate, true);
      const a = stageAmounts(defaultSchedule(), lines, rate, true, t.total);
      expect(a.map((x) => x.amount)).toEqual([t.payment1, t.payment2, t.paymentFinal]);
      expect(a.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(t.total, 2);
    }
  });

  it("25 x 4 and 50 / 50 always add up to the total, the balance taking the cents", () => {
    const lines = [install, floor, L({ qty: 3, unitPriceSnap: 33.33 })];
    const t = optionTotals(lines, 0.05, true);
    for (const key of ["25-25-25-25", "50-50"] as const) {
      const a = stageAmounts(PRESETS[key].schedule(), lines, 0.05, true, t.total);
      expect(Math.round(a.reduce((s, x) => s + x.amount, 0) * 100)).toBe(Math.round(t.total * 100));
    }
  });

  it("the material deposit is the HST-bearing material with its HST, after the discount", () => {
    // Labour untaxed (Charge HST off), material taxed: deposit = 2,000 less 10% = 1,800, plus 13% = 2,034.
    expect(materialsDeposit([install, floor], 0.1, false)).toBe(2034);
    // An untaxed material is left out while some material is taxed.
    expect(materialsDeposit([install, floor, untaxedFloor], 0.1, false)).toBe(2034);
    // No material carries HST: all of it, with nothing added.
    expect(materialsDeposit([install, untaxedFloor], 0, false)).toBe(500);
    expect(materialsDeposit([install], 0, false)).toBe(0);
  });

  it("with the material deposit, the rest splits 50 / 50 between the first day and completion", () => {
    const lines = [install, floor];
    const t = optionTotals(lines, 0, false); // 1,500 untaxed + 2,000 + 260 HST = 3,760
    const a = stageAmounts(PRESETS.materials.schedule(), lines, 0, false, t.total);
    expect(a.map((x) => x.amount)).toEqual([2260, 750, 750]);
    expect(a.map((x) => x.pay)).toEqual(["etransfer", "onsite", "onsite"]);
  });

  it("fixed amounts keep their dollars and the balance takes the difference (a change after acceptance)", () => {
    const s: PaymentSchedule = {
      preset: "custom",
      stages: [
        { label: "Deposit", when: "", pay: "etransfer", part: { kind: "amount", amount: 1000 } },
        { label: "Second payment", when: "", pay: null, part: { kind: "amount", amount: 1000 } },
        { label: "Final payment", when: "", pay: null, part: { kind: "balance" } },
      ],
    };
    expect(stageAmounts(s, [install], 0, true, 3500).map((x) => x.amount)).toEqual([1000, 1000, 1500]);
    const credit = stageAmounts(s, [install], 0, true, 1800);
    expect(credit.at(-1)!.amount).toBe(-200);
    expect(stageAmountProblems(credit, "Option 1").join(" ")).toMatch(/final payment would be less than nothing/);
  });

  it("a material deposit on a quote with no material is refused before sending", () => {
    const a = stageAmounts(PRESETS.materials.schedule(), [install], 0, false, 1500);
    expect(stageAmountProblems(a, "Option 1").join(" ")).toMatch(/deposit would be nothing/);
  });

  it("suggests the material deposit only when some work carries no HST and there is material", () => {
    expect(suggestsMaterialDeposit([install, floor], true)).toBe(false);
    expect(suggestsMaterialDeposit([install, floor], false)).toBe(true);
    expect(suggestsMaterialDeposit([install, floor, untaxedFloor], true)).toBe(true);
    expect(suggestsMaterialDeposit([install], false)).toBe(false);
  });
});

describe("payment schedule: saving", () => {
  it("writes the schedule only when it changed, and the default as blank", () => {
    const q = blankQuote();
    const withSched = setSchedule(q, PRESETS["50-50"].schedule());
    expect(planSave(q, withSched).version[VERSION.paymentSchedule]).toBe(scheduleField(PRESETS["50-50"].schedule()));
    expect(planSave(withSched, setSchedule(withSched, null)).version[VERSION.paymentSchedule]).toBeNull();
    expect(VERSION.paymentSchedule in planSave(q, q).version).toBe(false);
  });

  it("a quote with the default schedule keeps the fingerprint it had before schedules existed", () => {
    const q = blankQuote();
    expect(fingerprint(setSchedule(q, null))).toBe(fingerprint(q));
    expect(fingerprint(setSchedule(q, PRESETS["50-50"].schedule()))).not.toBe(fingerprint(q));
  });

  it("the browser's schedule is cleaned like everything else it sends", () => {
    const raw = { ...blankQuote(), schedule: { preset: "50-50", stages: [{ label: "Deposit", when: "Now", part: { kind: "share", pct: 50 }, pay: "etransfer", extra: "x" }, { label: "Final", when: "", part: { kind: "balance" }, pay: null }] } };
    expect(cleanEditorQuote(raw).schedule).toEqual({
      preset: "50-50",
      stages: [
        { label: "Deposit", when: "Now", part: { kind: "share", pct: 50 }, pay: "etransfer" },
        { label: "Final", when: "", part: { kind: "balance" }, pay: null },
      ],
    });
  });
});

describe("payment schedule: in words", () => {
  const opt = (schedule: CopyOption["schedule"]): CopyOption => ({
    name: "Option 1",
    description: null,
    recommended: false,
    sections: [],
    exclusions: [],
    totals: { preDiscount: 1000, discount: 0, subtotal: 1000, hst: 130, total: 1130, payment1: 395.5, payment2: 395.5, paymentFinal: 339 },
    ...(schedule ? { schedule } : {}),
  });

  it("a copy frozen before schedules existed still reads 35 / 35 / balance", () => {
    expect(stagesOf(opt(undefined)).map((s) => [s.label, s.amount])).toEqual([
      ["Deposit", 395.5],
      ["Second payment", 395.5],
      ["Final payment", 339],
    ]);
  });

  it("says each stage, when and how, then that nothing is final until the deposit is in, and never mentions HST", () => {
    const words = paymentWords(
      opt([
        { label: "Deposit", when: "On acceptance, for your materials, to secure them and your dates", pay: "etransfer", amount: 2260, pct: 60, kind: "materials" },
        { label: "Second payment", when: "On the first day of work", pay: "onsite", amount: 750, pct: 20, kind: "share" },
        { label: "Final payment", when: "Within 48 hours of completion", pay: "onsite", amount: 750, pct: 20, kind: "balance" },
      ]),
    );
    expect(words).toBe(
      "A deposit of $2,260.00 for your materials on acceptance, by e-transfer; 20% second payment on the first day of work, handed to your project manager on site; and the balance within 48 hours of completion, handed to your project manager on site. Nothing is final until the deposit is in; once it is, your materials are ordered and your date is locked in.",
    );
    expect(words).not.toMatch(/HST|cash/i);
  });
});
