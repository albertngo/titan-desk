import { restageAmounts, round2, type AcceptedTotals } from "@/lib/calc";
import { defaultSchedule } from "@/lib/pricing/schedule";
import type { Acceptance, AcceptedAddOn } from "@/lib/accept/plan";
import type { Part, Scope } from "@/lib/quotes/types";
import { scopeOf, stagesOf, type CopyOption, type CopySection, type CopyStage, type CopyTotals, type CustomerCopy } from "@/lib/send/copy";

/**
 * The contract (Albert, 2026-10-30, vault 05_decisions/2026-10-30-quote-contract-from-any-version):
 * a list on the quote (Quotes → Contract) of pointers to the options the customer has, each an option
 * on some version's frozen copy, with the totals and the payment schedule on the whole. Nothing is
 * merged when it is stored; the joined copy the PDF, the invoice and "what changed" are drawn from is
 * worked out from the pointers each time (`contractView()`).
 *
 * Pure, no I/O. Read and written by src/lib/quotes/contract.ts (read), src/lib/accept/record.ts
 * (acceptance, cancel) and src/lib/quotes/send.ts (a change sent). Tested in tests/contract.test.ts.
 *
 * Step 1 of three: the contract is the same as before (one version's picks, or the latest change),
 * only held as pointers. Parts and swapping from any version (step 2) and accepting a second Part on a
 * later link (step 3) build on it.
 */

export const CONTRACT_VERSION = 1;

/** One option on the contract: where it is (a version's frozen copy and its place there), what it is, and the add-ons taken with it. */
export type ContractItem = {
  versionId: string;
  index: number;
  /** The Quote Options record, when the copy carried it. */
  ref: string | null;
  name: string;
  /** Null on a change that joined a flooring and a stairs option into one (how changes were made before Parts). */
  scope: Scope | null;
  /** The part of the home (2026-10-30); absent = the scope stands for it. */
  part?: Part;
  /** Keys "option.section.line" on that copy. */
  addOns: AcceptedAddOn[];
  /** How it got onto the contract, and the day (Toronto). */
  via: "accepted" | "change";
  on: string;
};

export type Contract = {
  v: typeof CONTRACT_VERSION;
  items: ContractItem[];
  totals: AcceptedTotals;
  /** The payment schedule on the whole contract, in dollars. The first stage is the deposit. */
  stages: CopyStage[];
};

/* ---------- built from what happened ---------- */

/** "1.2" on an older record's one option reads as "<option>.1.2". */
const fullKey = (key: string, option: number) => (key.split(".").length === 2 ? `${option}.${key}` : key);

/** A customer's yes on one version: one item per option they took, its add-ons with it. */
export function fromAcceptance(versionId: string, a: Acceptance): Contract {
  const picks = a.picks?.length ? a.picks : [{ ...a.option, scope: "Flooring" as Scope }];
  const keyed = a.addOns.map((x) => ({ ...x, key: fullKey(x.key, a.option.index) }));
  return {
    v: CONTRACT_VERSION,
    items: picks.map((p) => ({
      versionId,
      index: p.index,
      ref: p.ref,
      name: p.name,
      scope: p.scope,
      ...("part" in p && p.part ? { part: p.part } : {}),
      addOns: keyed.filter((x) => x.key.startsWith(`${p.index}.`)),
      via: "accepted",
      on: a.on,
    })),
    totals: a.totals,
    stages: a.stages,
  };
}

/** A change sent for the record: its one option is the contract now. */
export function fromChange(versionId: string, copy: CustomerCopy): Contract | null {
  const o = copy.options[0];
  if (!o) return null;
  return {
    v: CONTRACT_VERSION,
    items: [{ versionId, index: 0, ref: o.ref ?? null, name: o.name, scope: o.scope === "Stairs" ? "Stairs" : null, ...(o.part ? { part: o.part } : {}), addOns: [], via: "change", on: copy.sentOn }],
    totals: { subtotal: o.totals.subtotal, hst: o.totals.hst, total: o.totals.total },
    stages: stagesOf(o),
  };
}

/** A quote accepted before Quotes → Contract existed: the contract worked out from the one version that was it. Null when it has none. */
export function legacyContract(versionId: string, copy: CustomerCopy | null, a: Acceptance | null): Contract | null {
  if (!copy) return null;
  if (a) return a.cancelled ? null : fromAcceptance(versionId, a);
  return copy.change ? fromChange(versionId, copy) : null;
}

/* ---------- stored and read back ---------- */

export const serializeContract = (c: Contract) => JSON.stringify(c);

export function parseContract(raw: string | null | undefined): Contract | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Contract;
    if (c?.v !== CONTRACT_VERSION || !Array.isArray(c.items) || c.items.length === 0 || !c.totals || !Array.isArray(c.stages)) return null;
    if (c.items.some((i) => typeof i.versionId !== "string" || !Number.isInteger(i.index) || !Array.isArray(i.addOns))) return null;
    return c;
  } catch {
    return null;
  }
}

/** The versions whose frozen copies the contract points into. */
export const contractVersions = (c: Contract) => [...new Set(c.items.map((i) => i.versionId))];

/** What the contract covers, as Parts (2026-10-30): each item's Part, else its scope; a joined change counts as both scopes. */
export const contractParts = (c: Contract): string[] => [...new Set(c.items.flatMap((i) => (i.part ? [i.part] : i.scope ? [i.scope] : ["Flooring", "Stairs"])))];

/** The day the contract last changed: what "What changed since <date>" counts from. */
export const contractOn = (c: Contract) => c.items.map((i) => i.on).sort().at(-1) ?? "";

/* ---------- the joined copy ---------- */

/** The frozen stages of several options, added stage by stage, so a material deposit keeps the dollars of each. */
export function frozenStages(parts: CopyOption[]): CopyStage[] {
  const [first, ...rest] = parts.map(stagesOf);
  if (!first) return [];
  return first.map((s, i) => ({ ...s, amount: s.amount === null ? null : round2(s.amount + rest.reduce((a, st) => a + (st[i]?.amount ?? 0), 0)) }));
}

/**
 * A change's options as the one project they are (Albert, 2026-10-31, vault 05_decisions/2026-10-31-quote-changes-for-record):
 * everything on a change is part of the project when it is sent, so a change with new work beside the project as
 * agreed (a basement, an extra) is frozen as one option, the options joined in order, with the totals added and the
 * version's schedule restaged on the whole. A change with one option is returned as it is.
 */
export function joinChange(copy: CustomerCopy): CustomerCopy {
  if (copy.options.length < 2) return copy;
  const add = (k: "subtotal" | "hst" | "total") => round2(copy.options.reduce((a, o) => a + o.totals[k], 0));
  const totals = { subtotal: add("subtotal"), hst: add("hst"), total: add("total") };
  const frozen = frozenStages(copy.options);
  const schedule = copy.paymentSchedule ?? defaultSchedule();
  const restaged = schedule.stages.length === frozen.length ? restageAmounts(schedule, frozen, totals.total) : restageAmounts(defaultSchedule(), frozen, totals.total);
  const stages: CopyStage[] = restaged.map((s, i) => ({ label: s.label, when: s.when || frozen[i]?.when || "", pay: s.pay, amount: s.amount, pct: s.pct, kind: s.kind }));
  const SELF = "change";
  const c: Contract = {
    v: CONTRACT_VERSION,
    items: copy.options.map((o, i) => ({ versionId: SELF, index: i, ref: o.ref ?? null, name: o.name, scope: o.scope === "Stairs" ? "Stairs" : null, ...(o.part ? { part: o.part } : {}), addOns: [], via: "change", on: copy.sentOn })),
    totals,
    stages,
  };
  return contractView(c, { [SELF]: copy }) ?? copy;
}

function sumTotals(parts: CopyTotals[]): CopyTotals {
  const add = (k: keyof CopyTotals) => round2(parts.reduce((a, t) => a + t[k], 0));
  return { preDiscount: add("preDiscount"), discount: add("discount"), subtotal: add("subtotal"), hst: add("hst"), total: add("total"), payment1: add("payment1"), payment2: add("payment2"), paymentFinal: add("paymentFinal") };
}

/**
 * The contract as one copy: every item's option joined into one (the flooring's sections, then the
 * stairs', a section both have holding both, numbered through), ticked add-ons part of the work and
 * the others left off, with the contract's totals and schedule. The rest of the copy (customer,
 * letterhead, terms) is the newest copy it points into. Null when a copy or an option it points at is
 * missing.
 */
export function contractView(c: Contract, copies: Record<string, CustomerCopy | null | undefined>): CustomerCopy | null {
  const parts = c.items.map((it) => ({ it, o: copies[it.versionId]?.options[it.index] }));
  if (parts.length === 0 || parts.some((p) => !p.o)) return null;
  const base = contractVersions(c)
    .map((id) => copies[id]!)
    .sort((a, b) => a.sentOn.localeCompare(b.sentOn))
    .at(-1)!;
  const options = parts.map((p) => p.o!);
  const sections: CopySection[] = [];
  let n = 0;
  parts.forEach(({ it, o }) => {
    o!.sections.forEach((s, si) => {
      const lines = s.lines.flatMap((l, li) => {
        if (l.kind !== "item" || !l.optional) return [l];
        return it.addOns.some((x) => x.key === `${it.index}.${si}.${li}`) ? [{ ...l, optional: false, added: true }] : [];
      });
      if (lines.length === 0) return;
      const into = sections.find((x) => x.name === s.name);
      if (into) {
        into.lines.push(...lines);
        into.total = into.total === null || s.total === null ? null : round2(into.total + s.total);
      } else sections.push({ ...s, lines: [...lines] });
    });
  });
  // Numbered through when options are joined; an add-on taken keeps no number, as before.
  if (options.length > 1) for (const s of sections) s.lines = s.lines.map((l) => (l.kind === "item" && l.n !== null ? { ...l, n: ++n } : l));
  const extra = round2(c.items.reduce((sum, it) => sum + it.addOns.reduce((a, x) => a + x.amount, 0), 0));
  const sent = sumTotals(options.map((o) => o.totals));
  const pay = (i: number) => c.stages[i]?.amount ?? 0;
  const option: CopyOption = {
    ...options[0],
    name: options.map((o) => o.name).join(" + "),
    description: options.map((o) => o.description).filter(Boolean).join("\n\n") || null,
    sections,
    exclusions: [...new Set(options.flatMap((o) => o.exclusions))],
    recommended: false,
    totals: {
      ...sent,
      preDiscount: round2(sent.preDiscount + extra),
      subtotal: c.totals.subtotal,
      hst: c.totals.hst,
      total: c.totals.total,
      payment1: pay(0),
      payment2: c.stages.length > 2 ? pay(1) : 0,
      paymentFinal: pay(c.stages.length - 1),
    },
    schedule: c.stages,
  };
  delete option.range;
  if (new Set(options.map(scopeOf)).size > 1) delete option.scope;
  return { ...base, options: [option] };
}
