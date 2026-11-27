/**
 * +C/O, the quick change order (Albert, 2026-11-27; vault 05_decisions/2026-11-27-quote-change-order-label). Pure: the
 * lines the card sends and what makes one unusable. Carried out in src/lib/quotes/quickChange.ts. Tested in
 * tests/quickChange.test.ts. The money (each line's amount before HST) is `coLineAmount()` in calc.ts.
 */

/** The sections a C/O line can go in, as the card offers them (the mockup's list). */
export const CO_SECTIONS = ["Install", "Moulding", "Materials", "Stairs", "Other"] as const;

/** One line of a C/O: added work, or a credit (always typed, at a negative price). */
export type CoLine = {
  section: string;
  /** A Rate Card row or Stair Item picked from the card (its key); null = typed. Ignored on a credit. */
  entryKey: string | null;
  description: string;
  qty: number;
  uom: string | null;
  /** Price per unit as a positive number; a credit is made negative when it is added. */
  rate: number;
  credit: boolean;
};

/** Why a line can't go on the change, in plain words; null when it can. */
export function coLineProblem(l: Partial<CoLine> | null | undefined): string | null {
  if (!l || typeof l !== "object") return "A line is missing.";
  if (!CO_SECTIONS.includes(l.section as (typeof CO_SECTIONS)[number])) return "Pick a section for each line.";
  if (typeof l.description !== "string" || !l.description.trim()) return "Each line needs what it is.";
  if (typeof l.qty !== "number" || !Number.isFinite(l.qty) || l.qty <= 0) return `"${l.description.trim()}" needs a quantity above zero.`;
  if (typeof l.rate !== "number" || !Number.isFinite(l.rate) || l.rate <= 0) return `"${l.description.trim()}" needs a rate above zero (a credit is made negative for you).`;
  if (l.qty * l.rate > 100_000) return `"${l.description.trim()}" is over $100,000. Use the full editor for a change that size.`;
  return null;
}
