import { chargesHst, isPriced, materialsDeposit, optionTotals, PAYMENT_SPLIT, sectionOf, type LineInput } from "@/lib/calc";

/**
 * The payment schedule (Albert, 2026-10-27): editable per quote. 35 / 35 / 30 is the default, or
 * 25 / 25 / 25 / 25, or 50 / 50, and each stage's share and "when" can be changed. It belongs to the
 * version, so every option follows it, and it is frozen on the customer copy when the version is sent.
 * Pure, no I/O, and no money: the amounts are worked out in src/lib/calc.ts (`stageAmounts`), the
 * only place money is computed.
 *
 * How the stages add up:
 * - the first stage is always the deposit;
 * - the last stage is always "the balance", whatever is left, so the schedule always comes to 100%;
 * - a "share" stage is a percent of the total, or of what is left after a material deposit;
 * - a "materials" stage is the material the customer is billed HST on, with its HST (the suggestion
 *   for a quote where some of the work carries none, below);
 * - an "amount" stage is fixed dollars: a change after acceptance keeps the stages already agreed as
 *   they were and the difference lands on the balance;
 * - a "topUp" stage (2026-11-05) brings what is paid so far up to its percent of the total, and is nothing
 *   when the stages before it already reach that: the rest of a 35% deposit after the material;
 * - an "ofTotal" stage (2026-11-05) is its percent of the whole total, whatever came before, never more
 *   than what is left.
 *
 * `pay` says how a stage is paid, in words the customer sees: by e-transfer (to the address the
 * acceptance email gives, with the quote number in the message), handed to the project manager on
 * site, paid in store, in cash at the showroom, in cash to the project manager, or nothing said.
 *
 * With no schedule of its own a version follows `autoSchedule()` (Albert, 2026-11-05): cash when nothing on
 * it carries HST, the material first when only the material does, else 35 / 35 / 30. Since 2026-11-06 the material
 * also comes first whenever it costs as much as the 35% deposit or more (`materialFirst()`), worded "Purchasing of the
 * flooring material is required first".
 */

export type StagePart =
  | { kind: "share"; pct: number }
  | { kind: "materials" }
  | { kind: "amount"; amount: number }
  | { kind: "topUp"; pct: number }
  | { kind: "ofTotal"; pct: number }
  | { kind: "balance" };
/**
 * How a stage is paid. "instore", "cash" and "cashOnsite" since 2026-11-05 (Albert: with no HST "the suggested payment
 * method should never be e-transfer. and only cash"; the rest of a material deposit is paid "in-store but implying it is
 * cash").
 */
export type PayHow = "etransfer" | "onsite" | "instore" | "cash" | "cashOnsite" | null;
export const PAY_HOWS: readonly Exclude<PayHow, null>[] = ["etransfer", "onsite", "instore", "cash", "cashOnsite"];
export type ScheduleStage = { label: string; when: string; part: StagePart; pay: PayHow };
export type PresetKey = "35-35-30" | "25-25-25-25" | "50-50" | "materials" | "cash" | "custom";
export type PaymentSchedule = { preset: PresetKey; stages: ScheduleStage[] };

export const MAX_STAGES = 5;

/** The "when" words, from the Project Expectations guide's payment section (v2.1). */
export const WHEN = {
  acceptance: "On acceptance, to secure your materials and your dates",
  firstDay: "On the first day of work",
  midway: "Halfway through the work",
  completion: "Within 48 hours of completion",
} as const;

const stage = (label: string, when: string, part: StagePart, pay: PayHow = null): ScheduleStage => ({ label, when, part, pay });

export const PRESETS: Record<Exclude<PresetKey, "custom">, { name: string; schedule: () => PaymentSchedule }> = {
  "35-35-30": {
    name: "35 / 35 / 30",
    schedule: () => ({
      preset: "35-35-30",
      stages: [
        stage("Deposit", WHEN.acceptance, { kind: "share", pct: 35 }, "etransfer"),
        stage("Second payment", WHEN.firstDay, { kind: "share", pct: 35 }),
        stage("Final payment", WHEN.completion, { kind: "balance" }),
      ],
    }),
  },
  "25-25-25-25": {
    name: "25 / 25 / 25 / 25",
    schedule: () => ({
      preset: "25-25-25-25",
      stages: [
        stage("Deposit", WHEN.acceptance, { kind: "share", pct: 25 }, "etransfer"),
        stage("Second payment", WHEN.firstDay, { kind: "share", pct: 25 }),
        stage("Third payment", WHEN.midway, { kind: "share", pct: 25 }),
        stage("Final payment", WHEN.completion, { kind: "balance" }),
      ],
    }),
  },
  "50-50": {
    name: "50 / 50",
    schedule: () => ({
      preset: "50-50",
      stages: [stage("Deposit", WHEN.acceptance, { kind: "share", pct: 50 }, "etransfer"), stage("Final payment", WHEN.completion, { kind: "balance" })],
    }),
  },
  /**
   * The material deposit (Albert, 2026-10-27; reworked 2026-11-05): on a quote where some of the work carries no HST,
   * the material billed with HST comes first, by e-transfer. Since 2026-11-05 ("IF there is an HST on materials. then
   * the auto payment plan should go to 'Materials' first. Now; if the value of it is lower than the 35% original, we
   * should also include a breakdown in paying the remaining balance 'in-store'"): the rest of a 35% deposit is paid in
   * store, nothing when the material alone reaches 35%; then 35% of the total on the first day and the balance within
   * 48 hours of completion, handed to the project manager on site. The words say the amount and how to pay, and
   * nothing about HST.
   */
  materials: {
    name: "Material deposit",
    schedule: () => ({
      preset: "materials",
      stages: [
        stage("Materials", "On acceptance, for your materials, to secure them and your dates", { kind: "materials" }, "etransfer"),
        stage("Rest of the deposit", "On acceptance, to secure your dates", { kind: "topUp", pct: 35 }, "instore"),
        stage("Second payment", WHEN.firstDay, { kind: "ofTotal", pct: 35 }, "onsite"),
        stage("Final payment", WHEN.completion, { kind: "balance" }, "onsite"),
      ],
    }),
  },
  /**
   * Cash (Albert, 2026-11-05): "when there is no HST at all. The suggested payment method should never be e-transfer. and
   * only cash." 35 / 35 / 30, the deposit in cash at the showroom and the rest in cash to the project manager on site.
   */
  cash: {
    name: "Cash (35 / 35 / 30)",
    schedule: () => ({
      preset: "cash",
      stages: [
        stage("Deposit", WHEN.acceptance, { kind: "share", pct: 35 }, "cash"),
        stage("Second payment", WHEN.firstDay, { kind: "share", pct: 35 }, "cashOnsite"),
        stage("Final payment", WHEN.completion, { kind: "balance" }, "cashOnsite"),
      ],
    }),
  },
};

/** The default, for a version with no schedule of its own: exactly the old 35 / 35 / balance. */
export const defaultSchedule = (): PaymentSchedule => PRESETS["35-35-30"].schedule();

/**
 * The words on the material stage when the material costs as much as the deposit or more (Albert, 2026-11-06: "if the
 * material cost is above the 35% or above the deposit requirement amount; then the wording should be - purchasing of
 * the flooring material is required first. And the selected option of clearing material first is selected").
 */
export const MATERIAL_FIRST_WHEN = "Purchasing of the flooring material is required first";

/**
 * The material deposit with the material-first words (2026-11-06). `cash` (nothing on the quote carries HST) pays every
 * stage in cash, as `PRESETS.cash` does, so it never asks for an e-transfer.
 */
export function materialFirstSchedule(cash: boolean): PaymentSchedule {
  const s = PRESETS.materials.schedule();
  return {
    preset: "materials",
    stages: s.stages.map((x, i) => ({
      ...x,
      when: i === 0 ? MATERIAL_FIRST_WHEN : x.when,
      pay: cash ? (i === 0 || x.part.kind === "topUp" ? "cash" : "cashOnsite") : x.pay,
    })),
  };
}

/**
 * Whether the material on any option costs at least the 35% deposit (2026-11-06): `materialsDeposit()` (the material,
 * after the discount, with its HST) against 35% of that option's total.
 */
export function materialFirst(options: { lines: LineInput[]; showHst: boolean; discountRate?: number }[]): boolean {
  return options.some((o) => {
    const rate = o.discountRate ?? 0;
    const total = optionTotals(o.lines, rate, o.showHst).total;
    const m = materialsDeposit(o.lines, rate, o.showHst);
    return total > 0 && m > 0 && m >= total * PAYMENT_SPLIT - 0.005;
  });
}

/** How a stage is paid, in the customer's words. Never says why. */
export const payWords = (pay: PayHow): string | null =>
  pay === "etransfer"
    ? "by e-transfer"
    : pay === "onsite"
      ? "handed to your project manager on site"
      : pay === "instore"
        ? "paid in store"
        : pay === "cash"
          ? "in cash at our showroom"
          : pay === "cashOnsite"
            ? "in cash, handed to your project manager on site"
            : null;

/** How a stage is paid, in the editor's short words. */
export const PAY_LABELS: Record<Exclude<PayHow, null>, string> = {
  etransfer: "By e-transfer",
  onsite: "To the PM on site",
  instore: "In store",
  cash: "Cash at the showroom",
  cashOnsite: "Cash to the PM on site",
};

/**
 * Whether the material deposit fits: some material on the quote is billed with HST while some priced work carries
 * none. A quote taxed throughout, or with no HST at all (that one is paid in cash, 2026-11-05), never gets it.
 */
export function suggestsMaterialDeposit(lines: LineInput[], showHst: boolean): boolean {
  const priced = lines.filter((l) => isPriced(l) && l.include);
  if (!priced.some((l) => sectionOf(l) === "Materials" && chargesHst(l, showHst))) return false;
  return priced.some((l) => !chargesHst(l, showHst));
}

/** The schedule the HST rules alone give (2026-11-05), before the material-first rule; what `scheduleFlags()` checks. */
function hstSchedule(options: { lines: LineInput[]; showHst: boolean }[]): PaymentSchedule {
  const priced = options.map((o) => ({ showHst: o.showHst, lines: o.lines.filter((l) => isPriced(l) && l.include) }));
  const anything = priced.some((o) => o.lines.length > 0);
  const taxed = priced.some((o) => o.lines.some((l) => chargesHst(l, o.showHst)));
  if (anything && !taxed) return PRESETS.cash.schedule();
  if (options.some((o) => suggestsMaterialDeposit(o.lines, o.showHst))) return PRESETS.materials.schedule();
  return defaultSchedule();
}

/**
 * The schedule a version gets when it has none of its own (Albert, 2026-11-05). Every option on it is looked at:
 * nothing priced on any of them carries HST → cash (`PRESETS.cash`); some option bills HST on its material while other
 * work carries none → the material first (`PRESETS.materials`); otherwise 35 / 35 / 30 with the deposit by e-transfer.
 * Since 2026-11-06, an option whose material costs the 35% deposit or more puts the material first whatever the HST
 * (`materialFirstSchedule()`, in cash when nothing carries HST). Staff can still pick any schedule in the editor, which
 * then stays.
 */
export function autoSchedule(options: { lines: LineInput[]; showHst: boolean; discountRate?: number }[]): PaymentSchedule {
  const byHst = hstSchedule(options);
  if (materialFirst(options)) return materialFirstSchedule(byHst.preset === "cash");
  return byHst;
}

/** Why the automatic schedule is what it is, in the editor's words (2026-11-06). */
export function autoReason(auto: PaymentSchedule): string {
  if (auto.preset === "materials" && auto.stages[0]?.when === MATERIAL_FIRST_WHEN)
    return auto.stages[0].pay === "cash"
      ? "The material costs the 35% deposit or more, so purchasing it is required first, in cash: nothing on this quote carries HST."
      : "The material costs the 35% deposit or more, so purchasing it is required first, by e-transfer, then the rest of a 35% deposit in store if it falls short.";
  if (auto.preset === "cash") return "Nothing on this quote carries HST, so it is paid in cash: the deposit at the showroom, the rest to the PM on site.";
  if (auto.preset === "materials") return "HST is on the material only, so the material comes first by e-transfer, then the rest of a 35% deposit in store.";
  return "Automatic: 35 / 35 / 30, the deposit by e-transfer.";
}

/**
 * Where a schedule goes against the HST rules (Albert, 2026-11-05: "it should FLAG us if the payment plan picked goes
 * against the rules for both"), said to staff; empty means it follows them. A flag never stops a save or a send.
 * - nothing on the quote carries HST: no stage may be paid by e-transfer (cash only);
 * - HST on the material only: the first stage is the material, and when the material comes to under 35% of an option's
 *   total, a stage right after it brings the deposit up to 35% (the rest, in store).
 * `options` carry their names and discount for the money: the material's share is `materialsDeposit()` over the total.
 */
export function scheduleFlags(s: PaymentSchedule, options: { name: string; lines: LineInput[]; showHst: boolean; discountRate: number }[]): string[] {
  const auto = hstSchedule(options);
  const out: string[] = [];
  if (auto.preset === "cash") {
    const et = s.stages.filter((x) => x.pay === "etransfer").map((x) => x.label || "a payment");
    if (et.length) out.push(`Nothing on this quote carries HST, so it is paid in cash, but ${et.join(" and ")} ${et.length === 1 ? "is" : "are"} set to e-transfer.`);
  }
  if (auto.preset === "materials") {
    if (s.stages[0]?.part.kind !== "materials") out.push(`HST is on the material only, so Materials should come first, but the schedule starts with ${s.stages[0]?.label || "another payment"}.`);
    else if (s.stages[1]?.part.kind !== "topUp") {
      for (const o of options) {
        const total = optionTotals(o.lines, o.discountRate, o.showHst).total;
        const m = materialsDeposit(o.lines, o.discountRate, o.showHst);
        if (total > 0 && m < total * 0.35 - 0.005)
          out.push(`On ${o.name || "an option"} the material is ${Math.round((m / total) * 100)}% of the total, under 35%, and no payment after it brings the deposit up to 35% in store.`);
      }
    }
  }
  return out;
}

/** The schedule that applies: the version's own, else the automatic one. */
export const scheduleFor = (schedule: PaymentSchedule | null | undefined, options: { lines: LineInput[]; showHst: boolean; discountRate?: number }[]): PaymentSchedule =>
  schedule ?? autoSchedule(options);

/**
 * Whether a stage is shown to anyone (2026-11-05): a top-up the material already covered, or a material deposit on an
 * option with no material, comes to nothing and is left out of every page, PDF, email and text. It stays in the stored
 * stages, so restaging lines up.
 */
export const shownStage = (s: { kind: string; amount: number | null }) => !((s.kind === "topUp" || s.kind === "materials") && s.amount !== null && Math.abs(s.amount) < 0.005);

/* ---------- checking and reading ---------- */

/** What is wrong with a schedule, said to staff; empty means it may be saved and sent. */
export function scheduleProblems(s: PaymentSchedule): string[] {
  const out: string[] = [];
  const n = s.stages.length;
  if (n === 0) return ["The payment schedule has no stages."];
  if (n > MAX_STAGES) out.push(`A payment schedule has at most ${MAX_STAGES} stages.`);
  if (s.stages[n - 1].part.kind !== "balance") out.push("The last payment is always the balance.");
  if (s.stages.slice(0, -1).some((x) => x.part.kind === "balance")) out.push("Only the last payment can be the balance.");
  if (s.stages.slice(1).some((x) => x.part.kind === "materials")) out.push("Only the deposit can be the material.");
  const shares = s.stages.flatMap((x) => (x.part.kind === "share" ? [x.part.pct] : []));
  if (shares.some((p) => !(p > 0) || p >= 100)) out.push("Each share is more than 0% and less than 100%.");
  const ofTotal = s.stages.flatMap((x) => (x.part.kind === "topUp" || x.part.kind === "ofTotal" ? [x.part.pct] : []));
  if (ofTotal.some((p) => !(p > 0) || p >= 100)) out.push("Each percent of the total is more than 0% and less than 100%.");
  if (shares.reduce((a, b) => a + b, 0) >= 100) out.push("The shares add up to 100% or more, which leaves nothing for the balance.");
  if (s.stages.some((x) => x.part.kind === "amount" && !(x.part.amount >= 0))) out.push("A fixed payment can't be negative.");
  if (s.stages.some((x) => !x.label.trim())) out.push("Every payment needs a name.");
  return out;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const PRESET_KEYS: readonly PresetKey[] = ["35-35-30", "25-25-25-25", "50-50", "materials", "cash", "custom"];

function readPart(raw: unknown): StagePart | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (r.kind === "share") {
    const pct = num(r.pct);
    return pct === null ? null : { kind: "share", pct: Math.round(pct * 100) / 100 };
  }
  if (r.kind === "amount") {
    const amount = num(r.amount);
    return amount === null ? null : { kind: "amount", amount: Math.round(amount * 100) / 100 };
  }
  if (r.kind === "topUp" || r.kind === "ofTotal") {
    const pct = num(r.pct);
    return pct === null ? null : { kind: r.kind, pct: Math.round(pct * 100) / 100 };
  }
  if (r.kind === "materials" || r.kind === "balance") return { kind: r.kind };
  return null;
}

/**
 * A schedule as the server will trust it, from the browser or from Airtable: types checked, sizes
 * capped, unknown keys dropped. Anything unreadable is null, which means the default; a readable one
 * that fails `scheduleProblems` is returned as is, for the editor to say what is wrong.
 */
export function cleanSchedule(raw: unknown): PaymentSchedule | null {
  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r || !Array.isArray(r.stages)) return null;
  const stages: ScheduleStage[] = [];
  for (const x of r.stages.slice(0, MAX_STAGES)) {
    const s = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const part = readPart(s.part);
    if (!part) return null;
    stages.push({ label: text(s.label, 40), when: text(s.when, 120), part, pay: PAY_HOWS.includes(s.pay as Exclude<PayHow, null>) ? (s.pay as PayHow) : null });
  }
  if (stages.length === 0) return null;
  return { preset: PRESET_KEYS.includes(r.preset as PresetKey) ? (r.preset as PresetKey) : "custom", stages };
}

/**
 * What goes into Quote Versions → Payment Schedule: null for none, so an untouched quote stays blank and follows
 * `autoSchedule()`. Since 2026-11-05 a schedule picked in the editor is stored even when it is 35 / 35 / 30, since
 * blank no longer means that.
 */
export function scheduleField(s: PaymentSchedule | null | undefined): string | null {
  if (!s) return null;
  return JSON.stringify({ preset: s.preset, stages: s.stages });
}

/** The same schedule, blank (automatic) only matching blank. */
export const sameSchedule = (a: PaymentSchedule | null | undefined, b: PaymentSchedule | null | undefined) => JSON.stringify(a?.stages ?? null) === JSON.stringify(b?.stages ?? null);

/** The deposit's share, for words like "35% deposit"; null when the deposit is the material or a fixed amount. */
export const depositPct = (s: PaymentSchedule): number | null => (s.stages[0]?.part.kind === "share" ? s.stages[0].part.pct : null);

/**
 * The schedule of a change after acceptance since 2026-10-30 (Albert: "just readjust it entirely… It should be on
 * the whole balance of the accepted quotes"; vault 05_decisions/2026-10-30-quote-contract-from-any-version): the
 * contract's own stages restaged on the new total. A share stays a share, a material deposit the material, a fixed
 * amount its amount, and the last stage is the balance. What has already been received counts toward it, on the
 * invoice or receipt. Staff can still edit it before sending.
 */
export function restagedSchedule(stages: { label: string; when: string; pay: PayHow; kind: string; pct: number | null; amount: number | null; target?: number | null }[]): PaymentSchedule {
  const last = stages.length - 1;
  return {
    preset: "custom",
    stages: stages.map((s, i) => ({
      label: s.label,
      when: s.when,
      pay: s.pay,
      part:
        i === last
          ? { kind: "balance" as const }
          : s.kind === "share" && s.pct !== null
            ? { kind: "share" as const, pct: s.pct }
            : s.kind === "materials"
              ? { kind: "materials" as const }
              : (s.kind === "topUp" || s.kind === "ofTotal") && (s.target ?? s.pct) !== null
                ? { kind: s.kind, pct: (s.target ?? s.pct)! }
                : { kind: "amount" as const, amount: s.amount ?? 0 },
    })),
  };
}

/**
 * Before 2026-10-30, the schedule of a change after acceptance (Albert, 2026-10-27: the difference goes into the final
 * payment): every stage already agreed keeps its dollars, and the last stage is the balance, so a
 * change up or down lands on the final payment only. Staff can still edit it before sending.
 */
export function fixedSchedule(stages: { label: string; when: string; pay: PayHow; amount: number | null }[]): PaymentSchedule {
  const last = stages.length - 1;
  return {
    preset: "custom",
    stages: stages.map((s, i) => ({ label: s.label, when: s.when, pay: s.pay, part: i === last ? { kind: "balance" as const } : { kind: "amount" as const, amount: s.amount ?? 0 } })),
  };
}

