import { chargesHst, isPriced, sectionOf, type LineInput } from "@/lib/calc";

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
 *   they were and the difference lands on the balance.
 *
 * `pay` says how a stage is paid, in words the customer sees: by e-transfer (to the address the
 * acceptance email gives, with the quote number in the message), handed to the project manager on
 * site, or nothing said.
 */

export type StagePart = { kind: "share"; pct: number } | { kind: "materials" } | { kind: "amount"; amount: number } | { kind: "balance" };
export type PayHow = "etransfer" | "onsite" | null;
export type ScheduleStage = { label: string; when: string; part: StagePart; pay: PayHow };
export type PresetKey = "35-35-30" | "25-25-25-25" | "50-50" | "materials" | "custom";
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
   * The material deposit (Albert, 2026-10-27): on a quote where some of the work carries no HST, the
   * deposit is the material billed with HST, by e-transfer, and the rest is split between the first
   * day of work and completion, handed to the project manager on site. The words say the amount and
   * how to pay, and nothing about HST.
   */
  materials: {
    name: "Material deposit",
    schedule: () => ({
      preset: "materials",
      stages: [
        stage("Deposit", "On acceptance, for your materials, to secure them and your dates", { kind: "materials" }, "etransfer"),
        stage("Second payment", WHEN.firstDay, { kind: "share", pct: 50 }, "onsite"),
        stage("Final payment", WHEN.completion, { kind: "balance" }, "onsite"),
      ],
    }),
  },
};

/** The default, for a version with no schedule of its own: exactly the old 35 / 35 / balance. */
export const defaultSchedule = (): PaymentSchedule => PRESETS["35-35-30"].schedule();

/** How a stage is paid, in the customer's words. Never says why. */
export const payWords = (pay: PayHow): string | null => (pay === "etransfer" ? "by e-transfer" : pay === "onsite" ? "handed to your project manager on site" : null);

/**
 * Whether to suggest the material deposit: some priced work on the quote carries no HST while some
 * material does, or nothing carries HST at all but there is material. A quote taxed throughout never
 * gets the suggestion.
 */
export function suggestsMaterialDeposit(lines: LineInput[], showHst: boolean): boolean {
  const priced = lines.filter((l) => isPriced(l) && l.include);
  if (!priced.some((l) => sectionOf(l) === "Materials")) return false;
  return priced.some((l) => !chargesHst(l, showHst));
}

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
  if (shares.reduce((a, b) => a + b, 0) >= 100) out.push("The shares add up to 100% or more, which leaves nothing for the balance.");
  if (s.stages.some((x) => x.part.kind === "amount" && !(x.part.amount >= 0))) out.push("A fixed payment can't be negative.");
  if (s.stages.some((x) => !x.label.trim())) out.push("Every payment needs a name.");
  return out;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const PRESET_KEYS: readonly PresetKey[] = ["35-35-30", "25-25-25-25", "50-50", "materials", "custom"];

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
    stages.push({ label: text(s.label, 40), when: text(s.when, 120), part, pay: s.pay === "etransfer" || s.pay === "onsite" ? s.pay : null });
  }
  if (stages.length === 0) return null;
  return { preset: PRESET_KEYS.includes(r.preset as PresetKey) ? (r.preset as PresetKey) : "custom", stages };
}

/** What goes into Quote Versions → Payment Schedule: null for the default, so an untouched quote stays blank. */
export function scheduleField(s: PaymentSchedule | null | undefined): string | null {
  if (!s || sameSchedule(s, defaultSchedule())) return null;
  return JSON.stringify({ preset: s.preset, stages: s.stages });
}

export const sameSchedule = (a: PaymentSchedule | null | undefined, b: PaymentSchedule | null | undefined) =>
  JSON.stringify((a ?? defaultSchedule()).stages) === JSON.stringify((b ?? defaultSchedule()).stages);

/** The deposit's share, for words like "35% deposit"; null when the deposit is the material or a fixed amount. */
export const depositPct = (s: PaymentSchedule): number | null => (s.stages[0]?.part.kind === "share" ? s.stages[0].part.pct : null);

/**
 * The schedule of a change after acceptance since 2026-10-30 (Albert: "just readjust it entirely… It should be on
 * the whole balance of the accepted quotes"; vault 05_decisions/2026-10-30-quote-contract-from-any-version): the
 * contract's own stages restaged on the new total. A share stays a share, a material deposit the material, a fixed
 * amount its amount, and the last stage is the balance. What has already been received counts toward it, on the
 * invoice or receipt. Staff can still edit it before sending.
 */
export function restagedSchedule(stages: { label: string; when: string; pay: PayHow; kind: string; pct: number | null; amount: number | null }[]): PaymentSchedule {
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

