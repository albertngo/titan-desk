import { acceptedTotals, restageAmounts, round2, type AcceptedTotals } from "@/lib/calc";
import { defaultSchedule } from "@/lib/pricing/schedule";
import type { Part, Scope } from "@/lib/quotes/types";
import { offersOf, pickKey, scopeOf, stagesOf, type CopyItem, type CopyOption, type CopyStage, type CopyState, type CopyTotals, type CustomerCopy } from "@/lib/send/copy";
import { contractView, fromAcceptance } from "@/lib/contract/model";
import type { Terms } from "./terms";

/**
 * Accepting a quote (Albert, 2026-10-27). Pure, no I/O: what may be accepted, what an acceptance
 * records, and the accepted copy the stamped PDF and the customer's page are drawn from. Carried
 * out by src/lib/accept/record.ts; tested in tests/accept.test.ts.
 *
 * The rules, from the grilling that day:
 * - there is always an accept step: the customer taps Accept on their link, on their own phone or
 *   handed the store tablet (which also takes a drawn signature); staff may accept on their behalf
 *   only with a reason saying where the written yes is;
 * - only a measured version that is out with the customer and still good can be accepted: a
 *   preliminary is an estimate, and a change after acceptance is sent for the record;
 * - one option, and any of its add-ons ticked, at exactly the prices shown; since 2026-10-28, one
 *   option of each scope (a flooring option and a stairs option, or just one of them), which become
 *   one contract: one total, one deposit, one schedule;
 * - they tick that they have read the Project Expectations, and the version they saw is recorded
 *   (a newer one saved since they opened the page means they reload and look again);
 * - the accepted copy is frozen like the sent one: nothing live is ever read to show it again.
 */

export const ACCEPTANCE_VERSION = 1;

export type AcceptMethod = "link" | "store" | "staff";

/** `key` is "option.section.line" (2026-10-28), or "section.line" on the one option of an older record. */
export type AcceptedAddOn = { key: string; description: string; amount: number };

/** One option the customer took (2026-10-28): its place in the copy, its name, its Quote Options record and its scope. */
export type AcceptedPick = { index: number; name: string; ref: string | null; scope: Scope; part?: Part };

/** What happened after the yes, kept on the record so staff can see it and retry: GHL Won, and the messages. */
export type Handoff = { at: string; ghl: "done" | "failed" | "off"; ghlMessage: string | null; told: string[]; tellFailed: string | null };

export type Acceptance = {
  v: typeof ACCEPTANCE_VERSION;
  /** ISO timestamp, and the day in Toronto. */
  at: string;
  on: string;
  method: AcceptMethod;
  /** The customer's full name as they typed it (or as staff typed it, on their behalf). */
  name: string;
  /** What was accepted as one: the first pick's place and record, and every pick's name joined ("Oak floors + Red oak caps"). */
  option: { index: number; name: string; ref: string | null };
  /** Every option taken, flooring first (2026-10-28). Absent on a record from before then: the one `option`. */
  picks?: AcceptedPick[];
  addOns: AcceptedAddOn[];
  totals: AcceptedTotals;
  /** The payment schedule on the accepted total, in dollars. The first stage is the deposit. */
  stages: CopyStage[];
  /** The Project Expectations they ticked: the day that version was saved (YYYY-MM-DD) and its Terms Versions row. */
  terms: string;
  termsId: string | null;
  /** Drawn on the store tablet: an SVG path (M and L only) in a 1000 × 300 box. */
  signature: string | null;
  /** The staff member signed in, for an acceptance in store or on the customer's behalf. */
  recordedBy: string | null;
  /** On behalf only: how the customer said yes and where the written yes is. */
  reason: string | null;
  userAgent: string | null;
  handoff?: Handoff;
  cancelled?: { at: string; by: string; reason: string };
  /**
   * New work added to a project already under contract (2026-10-31): the change's first option, the project as
   * agreed, which the picks join. `totals` and `stages` are then on the whole project, and `paid` is what Notion's
   * Master Payments Log showed received when it was recorded (null when it couldn't be read), so the customer is
   * asked only for what is due now. Absent on every first acceptance.
   */
  base?: { index: number; name: string; ref: string | null; scope: Scope | null; part?: Part };
  paid?: number | null;
};

export type AcceptInput = {
  /** The options taken, at most one per Part (2026-10-30; one of each scope before then). */
  optionIndexes: number[];
  addOns: string[];
  name: string;
  terms: boolean;
  /** The Terms Versions row the page showed them; a newer one since means they reload and look again. */
  termsId: string | null;
  signature: string | null;
  reason: string | null;
};

/* ---------- reading what was sent ---------- */

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The request as the server will trust it; anything that isn't one reads as null. */
export function readAcceptInput(raw: unknown): AcceptInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const whole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1000;
  // `optionIndex` is what a page opened before 2026-10-28 sends: one option.
  const optionIndexes = Array.isArray(r.optionIndexes) ? [...new Set(r.optionIndexes.filter(whole))].slice(0, PART_LIMIT) : whole(r.optionIndex) ? [r.optionIndex] : [];
  if (optionIndexes.length === 0) return null;
  // "option.section.line"; an older page's "section.line" belongs to its one option.
  const addOns = Array.isArray(r.addOns)
    ? [...new Set(r.addOns.filter((k): k is string => typeof k === "string" && /^\d{1,3}\.\d{1,3}(\.\d{1,3})?$/.test(k)).map((k) => (k.split(".").length === 2 ? `${optionIndexes[0]}.${k}` : k)))].slice(0, 50)
    : [];
  const signature = typeof r.signature === "string" && r.signature.trim() ? r.signature.trim() : null;
  const termsId = typeof r.termsId === "string" && /^rec[A-Za-z0-9]{14}$/.test(r.termsId) ? r.termsId : null;
  return { optionIndexes, addOns, name: text(r.name, 120), terms: r.terms === true, termsId, signature, reason: text(r.reason, 500) || null };
}

/** "1.2.3": the add-on at line 3 of section 2 of the copy's option 1. */
export const addOnKey = (option: number, section: number, line: number) => `${option}.${section}.${line}`;

/** Whether HST is charged on a line, as the copy said it. */
const taxed = (copy: Pick<CustomerCopy, "showHst">, l: Pick<CopyItem, "hst">) => (copy.showHst ? l.hst !== "none" : l.hst === "plus");

/** The add-ons the copy's option `index` offers, with the key the Accept panel sends back for each. */
export function addOnsOf(copy: Pick<CustomerCopy, "showHst" | "options">, index: number): (AcceptedAddOn & { taxed: boolean })[] {
  const o = copy.options[index];
  if (!o) return [];
  return o.sections.flatMap((s, si) =>
    s.lines.flatMap((l, li) => (l.kind === "item" && l.optional && l.amount !== null ? [{ key: addOnKey(index, si, li), description: l.description, amount: l.amount, taxed: taxed(copy, l) }] : [])),
  );
}

/** At most this many options in one acceptance: one per Part. */
const PART_LIMIT = 6;

/** Why a set of options can't be taken together, or null: at least one, each on the copy, never two for one Part (2026-10-30; one scope before then). */
export function pickProblem(copy: Pick<CustomerCopy, "options">, indexes: number[]): string | null {
  if (indexes.length === 0 || indexes.some((i) => !copy.options[i])) return "Choose the option you're accepting.";
  const parts = indexes.map((i) => pickKey(copy.options[i], i));
  const twice = parts.find((p, i) => parts.indexOf(p) !== i);
  if (twice) return twice === "Flooring" || twice === "Stairs" ? `Choose one ${twice.toLowerCase()} option, not two.` : `Choose one option for the ${twice.toLowerCase()}, not two.`;
  return null;
}

/** The picks in the order the contract lists them: flooring first. */
const ordered = (copy: Pick<CustomerCopy, "options">, indexes: number[]) =>
  [...indexes].sort((a, b) => (scopeOf(copy.options[a]) === scopeOf(copy.options[b]) ? a - b : scopeOf(copy.options[a]) === "Flooring" ? -1 : 1));

/** What one or more options add up to as sent, before anything is ticked. */
function sumTotals(parts: CopyTotals[]): CopyTotals {
  const add = (k: keyof CopyTotals) => round2(parts.reduce((a, t) => a + t[k], 0));
  return { preDiscount: add("preDiscount"), discount: add("discount"), subtotal: add("subtotal"), hst: add("hst"), total: add("total"), payment1: add("payment1"), payment2: add("payment2"), paymentFinal: add("paymentFinal") };
}

/** The frozen stages of the picks, added stage by stage, so a material deposit keeps the dollars of both. */
export function frozenStages(parts: CopyOption[]): CopyStage[] {
  const [first, ...rest] = parts.map(stagesOf);
  if (!first) return [];
  return first.map((s, i) => ({ ...s, amount: s.amount === null ? null : round2(s.amount + rest.reduce((a, st) => a + (st[i]?.amount ?? 0), 0)) }));
}

/* ---------- the signature ---------- */

const SIG_MAX = 20_000;

/** The strokes of a drawn signature, or null when it isn't one this code draws: M/L commands, whole numbers, inside the box. */
export function parseSignature(s: string | null | undefined): [number, number][][] | null {
  if (!s || s.length > SIG_MAX || !/^M[\d ML]+$/.test(s)) return null;
  const strokes: [number, number][][] = [];
  for (const m of s.matchAll(/([ML])\s*(\d{1,4})\s+(\d{1,4})/g)) {
    const x = Number(m[2]);
    const y = Number(m[3]);
    if (x > 1000 || y > 300) return null;
    if (m[1] === "M" || strokes.length === 0) strokes.push([]);
    strokes[strokes.length - 1].push([x, y]);
  }
  return strokes.length && strokes.some((st) => st.length > 1) ? strokes : null;
}

/* ---------- may it be accepted ---------- */

/** Why the quote itself can't be accepted now, whatever is sent; null when it can. Said to the customer as is. */
export function notAcceptable(copy: CustomerCopy, state: CopyState, terms: Terms | null): string | null {
  if (!terms) return "Online acceptance isn't switched on yet. Reply to the message this link came in, or call us, and we'll take it from there.";
  if (state === "accepted") return "This quote has already been accepted.";
  if (state === "expired") return "This quote is past its good-until date. Get in touch and we'll confirm the prices and send a fresh one.";
  if (state === "replaced") return "We've sent you a newer version of this quote. Accept that one instead.";
  if (state !== "open") return "This quote is no longer open.";
  if (copy.change && offersOf(copy).length === 0) return "This is your updated quote, for your records. There's nothing to accept.";
  if (copy.basis !== "Measured") return "A preliminary estimate can't be accepted. We'll measure and send you a quote to accept.";
  return null;
}

/** Everything that stops this acceptance; empty means it may be recorded. Each line is said as is. */
export function acceptProblems(copy: CustomerCopy, state: CopyState, input: AcceptInput, ctx: { terms: Terms | null; method: AcceptMethod }): string[] {
  const whole = notAcceptable(copy, state, ctx.terms);
  if (whole) return [whole];
  const out: string[] = [];
  const pick = pickProblem(copy, input.optionIndexes);
  if (pick) return [pick];
  // On a change (2026-10-31) only the new work offered can be taken: the project itself is already agreed.
  if (copy.change && input.optionIndexes.some((i) => !copy.options[i]?.offer)) return ["Choose from the new work offered below. The rest of your project is already agreed."];
  const offered = new Set(input.optionIndexes.flatMap((i) => addOnsOf(copy, i).map((a) => a.key)));
  if (input.addOns.some((k) => !offered.has(k))) out.push("An add-on you ticked isn't on the options you chose. Reload the page and try again.");
  if (input.name.length < 2 || !/\p{L}/u.test(input.name)) out.push("Type your full name.");
  if (!input.terms) out.push("Tick that you've read and agree to the Project Expectations.");
  else if (input.termsId !== ctx.terms!.id) out.push("The Project Expectations were just updated. Reload the page and review them, then accept.");
  if (ctx.method === "store" && !parseSignature(input.signature)) out.push("Sign in the box.");
  if (ctx.method !== "store" && input.signature && !parseSignature(input.signature)) out.push("That signature couldn't be read. Clear it and sign again.");
  if (ctx.method === "staff" && !input.reason) out.push("Say how the customer said yes and where the written yes is (a signed paper, an email).");
  return out;
}

/** "Wednesday, November 4, 2026 at 2:14 pm", Toronto. */
export function acceptedWhen(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }).replace(/\./g, "").toLowerCase();
  return `${day} at ${time}`;
}

const torontoDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** The record of the yes. Call only after acceptProblems() came back empty. */
export function buildAcceptance(
  copy: CustomerCopy,
  input: AcceptInput,
  ctx: { now: Date; terms: Terms; method: AcceptMethod; recordedBy: string | null; userAgent: string | null },
): Acceptance {
  const indexes = ordered(copy, input.optionIndexes);
  const parts = indexes.map((i) => copy.options[i]);
  const offered = indexes.flatMap((i) => addOnsOf(copy, i));
  const chosen = offered.filter((a) => input.addOns.includes(a.key));
  // New work on a change (2026-10-31): the project as agreed (the change's first option) is part of the whole, so the
  // totals and the schedule are on everything the customer will have.
  const baseOption = copy.change ? copy.options[0] : undefined;
  const whole = baseOption ? [baseOption, ...parts] : parts;
  const totals = acceptedTotals(sumTotals(whole.map((o) => o.totals)), chosen);
  const frozen = frozenStages(whole);
  const schedule = copy.paymentSchedule ?? defaultSchedule();
  // A copy frozen before schedules existed has the default's three stages; anything else is restaged from its own definition.
  const restaged = schedule.stages.length === frozen.length ? restageAmounts(schedule, frozen, totals.total) : restageAmounts(defaultSchedule(), frozen, totals.total);
  const stages: CopyStage[] = restaged.map((s, i) => ({ label: s.label, when: s.when || frozen[i]?.when || "", pay: s.pay, amount: s.amount, pct: s.pct, kind: s.kind }));
  return {
    v: ACCEPTANCE_VERSION,
    at: ctx.now.toISOString(),
    on: torontoDay(ctx.now),
    method: ctx.method,
    name: input.name,
    option: { index: indexes[0], name: parts.map((o) => o.name).join(" + "), ref: parts[0].ref ?? null },
    picks: indexes.map((i) => ({ index: i, name: copy.options[i].name, ref: copy.options[i].ref ?? null, scope: scopeOf(copy.options[i]), ...(copy.options[i].part ? { part: copy.options[i].part } : {}) })),
    addOns: chosen.map(({ key, description, amount }) => ({ key, description, amount })),
    totals,
    stages,
    terms: ctx.terms.on,
    termsId: ctx.terms.id,
    signature: ctx.method === "store" || parseSignature(input.signature) ? input.signature : null,
    recordedBy: ctx.method === "link" ? null : ctx.recordedBy,
    reason: ctx.method === "staff" ? input.reason : null,
    userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 300) : null,
    ...(baseOption
      ? { base: { index: 0, name: baseOption.name, ref: baseOption.ref ?? null, scope: baseOption.scope === "Stairs" ? ("Stairs" as const) : null, ...(baseOption.part ? { part: baseOption.part } : {}) } }
      : {}),
  };
}

/**
 * What the customer is asked to pay now (2026-10-31). A first acceptance: the deposit. New work added to a project:
 * the deposit on the whole project less what was already received, never below nothing; `paid` null means it
 * couldn't be read, and the words say "less anything you've already paid" instead.
 */
export function dueNow(a: Pick<Acceptance, "stages" | "base" | "paid">): { deposit: number; paid: number | null; due: number } {
  const deposit = a.stages[0]?.amount ?? 0;
  if (!a.base) return { deposit, paid: null, due: deposit };
  const paid = a.paid ?? null;
  return { deposit, paid, due: paid === null ? deposit : Math.max(0, round2(deposit - paid)) };
}

/* ---------- the record, stored and read back ---------- */

export const serializeAcceptance = (a: Acceptance) => JSON.stringify(a);

export function parseAcceptance(raw: string | null | undefined): Acceptance | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as Acceptance;
    if (a?.v !== ACCEPTANCE_VERSION || typeof a.name !== "string" || !a.option || !a.totals || !Array.isArray(a.stages)) return null;
    return a;
  } catch {
    return null;
  }
}

/** The options an acceptance took: its picks, or the one option of a record from before 2026-10-28. */
export const picksOf = (a: Pick<Acceptance, "option" | "picks">): AcceptedPick[] => a.picks?.length ? a.picks : [{ ...a.option, scope: "Flooring" }];

/**
 * The accepted copy (2026-10-27): what was accepted as one option, its ticked add-ons now part of
 * the work, the others left off, and the totals and payment schedule as accepted. The stamped PDF
 * and the customer's accepted page are drawn from it, so they show exactly what was agreed. A
 * flooring option and a stairs option taken together (2026-10-28) are joined into that one option.
 * Since 2026-10-30 this is the contract's own view of this one acceptance (src/lib/contract/model.ts).
 */
export function acceptedCopy(copy: CustomerCopy, a: Acceptance): CustomerCopy {
  return contractView(fromAcceptance(SELF, a), { [SELF]: copy }) ?? copy;
}

const SELF = "this version";

/** The deposit: the first stage of the accepted schedule. */
export const depositOf = (a: Acceptance): CopyStage => a.stages[0];
