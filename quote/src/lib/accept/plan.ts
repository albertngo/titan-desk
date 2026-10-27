import { acceptedTotals, restageAmounts, round2, type AcceptedTotals } from "@/lib/calc";
import { defaultSchedule } from "@/lib/pricing/schedule";
import { stagesOf, type CopyItem, type CopyOption, type CopyStage, type CopyState, type CustomerCopy } from "@/lib/send/copy";
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
 * - one option, and any of its add-ons ticked, at exactly the prices shown;
 * - they tick that they have read the Project Expectations, and the version they saw is recorded
 *   (a newer one saved since they opened the page means they reload and look again);
 * - the accepted copy is frozen like the sent one: nothing live is ever read to show it again.
 */

export const ACCEPTANCE_VERSION = 1;

export type AcceptMethod = "link" | "store" | "staff";

export type AcceptedAddOn = { key: string; description: string; amount: number };

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
  option: { index: number; name: string; ref: string | null };
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
};

export type AcceptInput = {
  optionIndex: number;
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
  const optionIndex = typeof r.optionIndex === "number" && Number.isInteger(r.optionIndex) ? r.optionIndex : null;
  if (optionIndex === null) return null;
  const addOns = Array.isArray(r.addOns) ? [...new Set(r.addOns.filter((k): k is string => typeof k === "string" && /^\d{1,3}\.\d{1,3}$/.test(k)))].slice(0, 50) : [];
  const signature = typeof r.signature === "string" && r.signature.trim() ? r.signature.trim() : null;
  const termsId = typeof r.termsId === "string" && /^rec[A-Za-z0-9]{14}$/.test(r.termsId) ? r.termsId : null;
  return { optionIndex, addOns, name: text(r.name, 120), terms: r.terms === true, termsId, signature, reason: text(r.reason, 500) || null };
}

/** "2.3": the add-on at line 3 of section 2 of the option, as the copy has it. */
export const addOnKey = (section: number, line: number) => `${section}.${line}`;

/** Whether HST is charged on a line, as the copy said it. */
const taxed = (copy: Pick<CustomerCopy, "showHst">, l: Pick<CopyItem, "hst">) => (copy.showHst ? l.hst !== "none" : l.hst === "plus");

/** The add-ons an option offers, with the key the Accept panel sends back for each. */
export function addOnsOf(copy: Pick<CustomerCopy, "showHst">, o: CopyOption): (AcceptedAddOn & { taxed: boolean })[] {
  return o.sections.flatMap((s, si) =>
    s.lines.flatMap((l, li) => (l.kind === "item" && l.optional && l.amount !== null ? [{ key: addOnKey(si, li), description: l.description, amount: l.amount, taxed: taxed(copy, l) }] : [])),
  );
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
  if (copy.change) return "This is your updated quote, for your records. There's nothing to accept.";
  if (copy.basis !== "Measured") return "A preliminary estimate can't be accepted. We'll measure and send you a quote to accept.";
  return null;
}

/** Everything that stops this acceptance; empty means it may be recorded. Each line is said as is. */
export function acceptProblems(copy: CustomerCopy, state: CopyState, input: AcceptInput, ctx: { terms: Terms | null; method: AcceptMethod }): string[] {
  const whole = notAcceptable(copy, state, ctx.terms);
  if (whole) return [whole];
  const out: string[] = [];
  const o = copy.options[input.optionIndex];
  if (!o) return ["Choose the option you're accepting."];
  const offered = new Set(addOnsOf(copy, o).map((a) => a.key));
  if (input.addOns.some((k) => !offered.has(k))) out.push("An add-on you ticked isn't on that option. Reload the page and try again.");
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
  const o = copy.options[input.optionIndex];
  const offered = addOnsOf(copy, o);
  const chosen = offered.filter((a) => input.addOns.includes(a.key));
  const totals = acceptedTotals(o.totals, chosen);
  const frozen = stagesOf(o);
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
    option: { index: input.optionIndex, name: o.name, ref: o.ref ?? null },
    addOns: chosen.map(({ key, description, amount }) => ({ key, description, amount })),
    totals,
    stages,
    terms: ctx.terms.on,
    termsId: ctx.terms.id,
    signature: ctx.method === "store" || parseSignature(input.signature) ? input.signature : null,
    recordedBy: ctx.method === "link" ? null : ctx.recordedBy,
    reason: ctx.method === "staff" ? input.reason : null,
    userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 300) : null,
  };
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

/**
 * The accepted copy (2026-10-27): the one option accepted, its ticked add-ons now part of the work,
 * the others left off, and the totals and payment schedule as accepted. The stamped PDF and the
 * customer's accepted page are drawn from it, so they show exactly what was agreed.
 */
export function acceptedCopy(copy: CustomerCopy, a: Acceptance): CustomerCopy {
  const o = copy.options[a.option.index];
  if (!o) return copy;
  const ticked = new Set(a.addOns.map((x) => x.key));
  const sections = o.sections
    .map((s, si) => ({
      ...s,
      lines: s.lines.flatMap((l, li) => {
        if (l.kind !== "item" || !l.optional) return [l];
        return ticked.has(addOnKey(si, li)) ? [{ ...l, optional: false, added: true }] : [];
      }),
    }))
    .filter((s) => s.lines.length > 0);
  const extra = round2(a.addOns.reduce((sum, x) => sum + x.amount, 0));
  const pay = (i: number) => a.stages[i]?.amount ?? 0;
  const option: CopyOption = {
    ...o,
    sections,
    recommended: false,
    totals: {
      ...o.totals,
      preDiscount: round2(o.totals.preDiscount + extra),
      subtotal: a.totals.subtotal,
      hst: a.totals.hst,
      total: a.totals.total,
      payment1: pay(0),
      payment2: a.stages.length > 2 ? pay(1) : 0,
      paymentFinal: pay(a.stages.length - 1),
    },
    schedule: a.stages,
  };
  delete option.range;
  return { ...copy, options: [option] };
}

/** The deposit: the first stage of the accepted schedule. */
export const depositOf = (a: Acceptance): CopyStage => a.stages[0];
