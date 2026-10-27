import { round2 } from "@/lib/calc";
import type { CopyItem, CopyOption, CopyStage } from "@/lib/send/copy";

/**
 * What changed since the customer accepted (Albert, 2026-10-27: "the accepted version is frozen;
 * those adjustments will have a new version, and the customer is sent an updated version"). Staff
 * edit the whole quote as usual; this compares the contract as it stood (the accepted copy, or the
 * last change) with the updated copy, line by line, so the customer sees the change at the top of
 * the full updated quote. Pure; tested in tests/change.test.ts.
 *
 * Lines are matched by section and wording, in order. On a lump sum the customer was never shown
 * line prices, so a line's amount is compared only when both copies show one; quantities always.
 */

export type ChangeLine = { section: string; description: string; qty: number | null; uom: string | null; amount: number | null };
export type ChangeItem =
  | { kind: "added"; after: ChangeLine }
  | { kind: "removed"; before: ChangeLine }
  | { kind: "changed"; before: ChangeLine; after: ChangeLine };

/** The frozen summary on a change's copy: the change number, what it is measured against, and what changed. */
export type CopyChange = {
  no: number;
  /** YYYY-MM-DD the contract it changes was agreed: the acceptance, or the last change. */
  sinceOn: string;
  before: { subtotal: number; hst: number; total: number; stages: CopyStage[] };
  items: ChangeItem[];
  /** After minus before, before HST. */
  difference: number;
};

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function linesOf(o: CopyOption): ChangeLine[] {
  return o.sections.flatMap((s) =>
    s.lines.flatMap((l) => (l.kind === "item" && !l.optional ? [{ section: s.name, description: l.description, qty: l.qty, uom: l.uom, amount: (l as CopyItem).amount }] : [])),
  );
}

const differs = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) > 0.004;

export function diffOptions(before: CopyOption, after: CopyOption): ChangeItem[] {
  const pool = new Map<string, ChangeLine[]>();
  for (const l of linesOf(before)) {
    const k = `${key(l.section)}|${key(l.description)}`;
    pool.set(k, [...(pool.get(k) ?? []), l]);
  }
  const out: ChangeItem[] = [];
  for (const l of linesOf(after)) {
    const k = `${key(l.section)}|${key(l.description)}`;
    const match = pool.get(k)?.shift();
    if (!match) out.push({ kind: "added", after: l });
    else if (differs(match.qty, l.qty) || differs(match.amount, l.amount) || (match.qty === null) !== (l.qty === null)) out.push({ kind: "changed", before: match, after: l });
  }
  for (const rest of pool.values()) for (const l of rest) out.push({ kind: "removed", before: l });
  return out;
}

export function changeSummary(no: number, sinceOn: string, before: CopyOption, after: CopyOption): CopyChange {
  return {
    no,
    sinceOn,
    before: { subtotal: before.totals.subtotal, hst: before.totals.hst, total: before.totals.total, stages: before.schedule ?? [] },
    items: diffOptions(before, after),
    difference: round2(after.totals.subtotal - before.totals.subtotal),
  };
}

/** "+$975.00", "−$120.00", "no change". */
export function signedMoney(n: number, money: (x: number) => string): string {
  if (Math.abs(n) < 0.005) return "no change";
  return `${n > 0 ? "+" : "−"}${money(Math.abs(n))}`;
}

/** One line of the "What changed" box, in words. */
export function changeWords(c: ChangeItem): string {
  const q = (l: ChangeLine) => (l.qty !== null ? `${Number(l.qty.toFixed(2)).toLocaleString("en-CA")}${l.uom ? ` ${l.uom}` : ""}` : null);
  if (c.kind === "added") return `Added: ${c.after.description}${q(c.after) ? `, ${q(c.after)}` : ""}`;
  if (c.kind === "removed") return `Removed: ${c.before.description}`;
  const from = q(c.before);
  const to = q(c.after);
  return `Changed: ${c.after.description}${from && to && from !== to ? `, ${from} to ${to}` : ""}`;
}

/** A line's own amount difference, when both copies showed one (an itemised quote). */
export function itemDifference(c: ChangeItem): number | null {
  if (c.kind === "added") return c.after.amount;
  if (c.kind === "removed") return c.before.amount === null ? null : -c.before.amount;
  return c.before.amount !== null && c.after.amount !== null ? round2(c.after.amount - c.before.amount) : null;
}
