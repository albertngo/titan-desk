import { describe, expect, it } from "vitest";
import { materialsDeposit, optionTotals, stageAmountProblems, stageAmounts, type LineInput } from "../src/lib/calc";
import { autoSchedule, scheduleFlags, cleanSchedule, defaultSchedule, payWords, PRESETS, sameSchedule, scheduleField, scheduleProblems, shownStage, suggestsMaterialDeposit, type PaymentSchedule } from "../src/lib/pricing/schedule";
import { cleanEditorQuote, fingerprint, planSave } from "../src/lib/quotes/savePlan";
import { VERSION } from "../src/lib/airtable/fields";
import { blankQuote, setSchedule } from "../src/lib/editor/model";
import { acceptedFromAttempts, depositAmount, depositParts, depositSteps, paymentWords, smsDepositHow } from "../src/lib/send/plan";
import { stagesOf, type CopyOption, type CopyStage } from "../src/lib/send/copy";

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
    expect(cleanSchedule({ preset: "nonsense", stages: [{ label: "Only", when: 3, part: { kind: "balance" }, pay: "cheque" }] })).toEqual({
      preset: "custom",
      stages: [{ label: "Only", when: "", part: { kind: "balance" }, pay: null }],
    });
  });

  it("stores nothing for an untouched quote (it follows the automatic schedule), and a picked 35 / 35 / 30 as itself (2026-11-05)", () => {
    expect(scheduleField(null)).toBeNull();
    expect(scheduleField(defaultSchedule())).not.toBeNull();
    expect(scheduleField(PRESETS["50-50"].schedule())).not.toBeNull();
    expect(sameSchedule(null, null)).toBe(true);
    expect(sameSchedule(null, defaultSchedule())).toBe(false);
    expect(sameSchedule(defaultSchedule(), defaultSchedule())).toBe(true);
  });

  it("reads and checks the new stage kinds and ways to pay", () => {
    const s = PRESETS.materials.schedule();
    expect(cleanSchedule(scheduleField(s))).toEqual(s);
    expect(cleanSchedule(scheduleField(PRESETS.cash.schedule()))).toEqual(PRESETS.cash.schedule());
    expect(scheduleProblems(s)).toEqual([]);
    expect(scheduleProblems(PRESETS.cash.schedule())).toEqual([]);
    const bad: PaymentSchedule = { preset: "custom", stages: [s.stages[0], { ...s.stages[1], part: { kind: "topUp", pct: 120 } }, s.stages[3]] };
    expect(scheduleProblems(bad).join(" ")).toMatch(/percent of the total/);
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

  it("with the material deposit over 35%, the deposit is the material alone, then 35% and the balance (2026-11-05)", () => {
    const lines = [install, floor];
    const t = optionTotals(lines, 0, false); // 1,500 untaxed + 2,000 + 260 HST = 3,760
    const a = stageAmounts(PRESETS.materials.schedule(), lines, 0, false, t.total);
    // 35% of 3,760 is 1,316: the material (2,260) already covers it, so the rest of the deposit is nothing.
    expect(a.map((x) => x.amount)).toEqual([2260, 0, 1316, 184]);
    expect(a.map((x) => x.pay)).toEqual(["etransfer", "instore", "onsite", "onsite"]);
    expect(a.map((x) => shownStage(x))).toEqual([true, false, true, true]);
  });

  it("with the material under 35%, the rest of the deposit is paid in store, then 35% and the balance (2026-11-05)", () => {
    const small = L({ section: "Materials", lineType: "Material", qty: 100, unitPriceSnap: 4 }); // 400 + 52 HST
    const big = L({ qty: 1000, unitPriceSnap: 5 }); // 5,000 untaxed
    const lines = [big, small];
    const t = optionTotals(lines, 0, false); // 5,452
    const a = stageAmounts(PRESETS.materials.schedule(), lines, 0, false, t.total);
    // 35% of 5,452 = 1,908.20: 452 for the material, 1,456.20 in store; 35% again on the first day; the balance.
    expect(a.map((x) => x.amount)).toEqual([452, 1456.2, 1908.2, 1635.6]);
    expect(a[0].amount + a[1].amount).toBeCloseTo(t.total * 0.35, 2);
    expect(Math.round(a.reduce((s, x) => s + x.amount, 0) * 100)).toBe(Math.round(t.total * 100));
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

  it("a material deposit on an option with no material is all paid in store, and nothing is refused (2026-11-05)", () => {
    const a = stageAmounts(PRESETS.materials.schedule(), [install], 0, false, 1500);
    expect(a.map((x) => x.amount)).toEqual([0, 525, 525, 450]);
    expect(stageAmountProblems(a, "Option 1")).toEqual([]);
    // Without a top-up after it, a deposit of nothing is still refused.
    const old: PaymentSchedule = { preset: "custom", stages: [PRESETS.materials.schedule().stages[0], { label: "Final payment", when: "", pay: null, part: { kind: "balance" } }] };
    expect(stageAmountProblems(stageAmounts(old, [install], 0, false, 1500), "Option 1").join(" ")).toMatch(/deposit would be nothing/);
  });

  it("picks the schedule by HST when the version has none (2026-11-05)", () => {
    // Nothing taxed anywhere: cash, never e-transfer.
    const cash = autoSchedule([{ lines: [install, untaxedFloor], showHst: false }]);
    expect(cash.preset).toBe("cash");
    expect(cash.stages.map((x) => x.pay)).toEqual(["cash", "cashOnsite", "cashOnsite"]);
    // HST on the material only: the material first.
    expect(autoSchedule([{ lines: [install, floor], showHst: false }]).preset).toBe("materials");
    // Taxed throughout: 35 / 35 / 30 by e-transfer.
    expect(autoSchedule([{ lines: [install, floor], showHst: true }])).toEqual(defaultSchedule());
    // Nothing priced yet: the default.
    expect(autoSchedule([{ lines: [], showHst: false }])).toEqual(defaultSchedule());
    // One option taxed throughout and one with no HST at all: not every option is untaxed, so no cash.
    expect(autoSchedule([{ lines: [install], showHst: true }, { lines: [install], showHst: false }])).toEqual(defaultSchedule());
  });

  it("fits the material deposit only when some material carries HST and some work carries none", () => {
    expect(suggestsMaterialDeposit([install, floor], true)).toBe(false);
    expect(suggestsMaterialDeposit([install, floor], false)).toBe(true);
    expect(suggestsMaterialDeposit([install, floor, untaxedFloor], true)).toBe(true);
    expect(suggestsMaterialDeposit([install], false)).toBe(false);
    // No HST at all is cash now (2026-11-05), not a material deposit.
    expect(suggestsMaterialDeposit([install, untaxedFloor], false)).toBe(false);
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

/* ---------- cash and in store (Albert, 2026-11-05) ---------- */

const ctx = { etransfer: "pay@example.com", quoteNumber: "Q-1", showroom: "1 Example St, Exampletown" };
const st = (o: Partial<CopyStage>): CopyStage => ({ label: "Deposit", when: "", pay: null, amount: 0, pct: null, kind: "share", ...o });
const opt = (schedule: CopyStage[]): CopyOption => ({
  name: "Option 1",
  description: null,
  recommended: false,
  sections: [],
  exclusions: [],
  totals: { preDiscount: 1000, discount: 0, subtotal: 1000, hst: 0, total: 1000, payment1: 350, payment2: 350, paymentFinal: 300 },
  schedule,
});

describe("payment schedule: cash and in-store words", () => {
  it("never says e-transfer when nothing carries HST", () => {
    const words = paymentWords(
      opt([
        st({ label: "Deposit", when: "On acceptance, to secure your materials and your dates", pay: "cash", amount: 350, pct: 35 }),
        st({ label: "Second payment", when: "On the first day of work", pay: "cashOnsite", amount: 350, pct: 35 }),
        st({ label: "Final payment", when: "Within 48 hours of completion", pay: "cashOnsite", amount: 300, pct: 30, kind: "balance" }),
      ]),
    );
    expect(words).toMatch(/^35% deposit on acceptance, to secure your materials and your dates, in cash at our showroom; 35% second payment on the first day of work, in cash, handed to your project manager on site/);
    expect(words).not.toMatch(/e-transfer/i);
    expect(depositSteps([st({ pay: "cash", amount: 350 })], ctx)).toEqual(["Pay it in cash at our showroom, 1 Example St, Exampletown, and mention Q-1."]);
    expect(smsDepositHow([st({ pay: "cash", amount: 350 })], ctx)).toBe("Please pay it in cash at our showroom.");
    expect(payWords("cashOnsite")).toBe("in cash, handed to your project manager on site");
  });

  it("breaks a material deposit under 35% into the material by e-transfer and the rest in store", () => {
    const stages = [
      st({ label: "Materials", pay: "etransfer", amount: 452, kind: "materials" }),
      st({ label: "Rest of the deposit", pay: "instore", amount: 1456.2, kind: "topUp", target: 35 }),
      st({ label: "Second payment", pay: "onsite", amount: 1908.2, kind: "ofTotal", target: 35 }),
      st({ label: "Final payment", pay: "onsite", amount: 1635.6, kind: "balance" }),
    ];
    expect(depositParts(stages).map((s) => s.label)).toEqual(["Materials", "Rest of the deposit"]);
    expect(depositAmount(stages)).toBe(1908.2);
    expect(depositSteps(stages, ctx)).toEqual([
      "$452.00 for your materials: Send it by e-transfer to pay@example.com and put Q-1 in the message.",
      "$1,456.20 for the rest of your deposit: Pay it in store at our showroom, 1 Example St, Exampletown, and mention Q-1.",
    ]);
    const sms = smsDepositHow(stages, ctx);
    expect(sms).toBe("Please e-transfer $452.00 for your materials to pay@example.com and put Q-1 in the message, and pay the other $1,456.20 in store at our showroom.");
    // The text stays GSM-7 and never says cash for the in-store part.
    expect(sms).not.toMatch(/cash|[\u2018\u2019\u201c\u201d\u2013\u2014]/);
    const words = paymentWords(opt(stages));
    expect(words).toMatch(/; the rest of the deposit, \$1,456\.20, paid in store; /);
    // A top-up the material already covered is never shown.
    const covered = [stages[0], { ...stages[1], amount: 0 }, stages[2], stages[3]];
    expect(depositParts(covered).map((s) => s.label)).toEqual(["Materials"]);
    expect(paymentWords(opt(covered))).not.toMatch(/rest of the deposit/);
  });
});

describe("the won email's From line (2026-11-05)", () => {
  it("goes only from the person who sent the version, signed by them; with no sender, from the company", () => {
    expect(acceptedFromAttempts({ email: "pat@titanfloors.ca", firstName: "Pat" }, "hello@titanfloors.ca")).toEqual(["Pat @ Titan Flooring <pat@titanfloors.ca>", "pat@titanfloors.ca"]);
    expect(acceptedFromAttempts({ email: "pat@example.com", firstName: "Pat" }, "hello@titanfloors.ca")).toEqual([]);
    expect(acceptedFromAttempts(null, "hello@titanfloors.ca")).toEqual([null]);
  });
});

describe("flags a schedule that goes against the HST rules (2026-11-05)", () => {
  const o = (lines: LineInput[], showHst: boolean) => [{ name: "Option 1", lines, showHst, discountRate: 0 }];
  const small = L({ section: "Materials", lineType: "Material", qty: 100, unitPriceSnap: 4 }); // 452 with HST
  const big = L({ qty: 1000, unitPriceSnap: 5 }); // 5,000 untaxed

  it("says nothing when the schedule is the automatic one", () => {
    expect(scheduleFlags(autoSchedule(o([install, untaxedFloor], false)), o([install, untaxedFloor], false))).toEqual([]);
    expect(scheduleFlags(autoSchedule(o([big, small], false)), o([big, small], false))).toEqual([]);
    expect(scheduleFlags(defaultSchedule(), o([install, floor], true))).toEqual([]);
  });

  it("flags e-transfer on a quote with no HST at all", () => {
    expect(scheduleFlags(defaultSchedule(), o([install, untaxedFloor], false))).toEqual(["Nothing on this quote carries HST, so it is paid in cash, but Deposit is set to e-transfer."]);
  });

  it("flags a quote with HST on the material only that doesn't start with the material", () => {
    expect(scheduleFlags(defaultSchedule(), o([install, floor], false))).toEqual(["HST is on the material only, so Materials should come first, but the schedule starts with Deposit."]);
  });

  it("flags a material under 35% with nothing after it bringing the deposit up to 35%", () => {
    const m = PRESETS.materials.schedule();
    const noTopUp: PaymentSchedule = { preset: "custom", stages: [m.stages[0], m.stages[2], m.stages[3]] };
    expect(scheduleFlags(noTopUp, o([big, small], false))).toEqual(["On Option 1 the material is 8% of the total, under 35%, and no payment after it brings the deposit up to 35% in store."]);
    // The material over 35% needs no top-up.
    expect(scheduleFlags(noTopUp, o([install, floor], false))).toEqual([]);
  });
});
