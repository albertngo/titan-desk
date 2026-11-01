import { isPriced, PRIVATE_SECTION, priceUsed, costUsed, sectionOf } from "@/lib/calc";
import type { QuoteOption } from "@/lib/quotes/types";

/**
 * Typed lines saved for next time (Albert, 2026-11-01: "When we add custom items and the quote ends up being SENT…
 * make it so that those items are created for next time use and make them 'require review' in Airtable… There
 * should be a log of where it was used so I can ensure it wasn't wrongly charged").
 *
 * Pure: which typed lines on a sent quote count, how each is matched to a Rate Card / Stair Items row that already
 * has the same name, and what a new row holds. src/lib/quotes/customItems.ts carries the plan out. Tested in
 * tests/customItems.test.ts.
 */

/** A typed line worth keeping: its Quote Lines record, where it sits, its words and its figures. */
export type TypedLine = {
  lineId: string;
  table: "rate" | "stair";
  /** Rate Card → Labor Type for a rate row; null for a stair item. */
  laborType: string | null;
  description: string;
  uom: string | null;
  price: number;
  cost: number | null;
  /** Materials put the cost in Material Cost, everything else in Labor Cost. */
  material: boolean;
};

export type CardRow = { id: string; laborType: string | null; name: string | null };

/** Rate Card → Labor Type for a section (its own choices only; no typecast). Refinish, Paint and Sand keep theirs. */
const LABOR_TYPE: Record<string, string> = {
  Install: "Install",
  Removal: "Remove",
  Disposal: "Disposal",
  Refinish: "Refinish",
  Paint: "Paint",
  Sand: "Sand",
  Materials: "Material",
  Delivery: "Delivery",
  // The editor's picker lists Install rows under Prep (SECTION_LABOUR), so an approved Prep item shows there.
  Prep: "Install",
  Other: "Other",
  Unsorted: "Other",
};

/** Rate Card → UoM's own choices; anything else is left blank for Albert to set. */
const RATE_UOMS = ["sqft", "linear ft", "each", "piece", "hour", "roll", "flat"];

/** The same words, whatever the case, spacing or punctuation: "Baseboard 3.5\" MDF" = "baseboard 3.5 mdf". */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) =>
    (s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, " ")
      // A full stop counts only as a decimal point (3.5); a sentence's last one does not.
      .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return n(a) !== "" && n(a) === n(b);
}

/**
 * The typed lines of the options that went out: typed by hand (no card source), priced, with words. Never a Private
 * line (costs shown to the customer as one row, and the Accepted price adjustment), an exclusion or a note.
 */
export function typedLines(options: Pick<QuoteOption, "lines">[]): TypedLine[] {
  const out: TypedLine[] = [];
  for (const o of options)
    for (const l of o.lines) {
      if (l.sourceKind !== "manual" || !isPriced(l)) continue;
      const section = sectionOf(l);
      if (section === PRIVATE_SECTION) continue;
      const description = (l.description ?? "").trim();
      const price = priceUsed(l);
      if (!description || !(price > 0)) continue;
      const cost = costUsed(l) || (l.manualCost && l.qty ? Math.round((l.manualCost / l.qty) * 100) / 100 : 0);
      const stair = section === "Stairs";
      out.push({
        lineId: l.id,
        table: stair ? "stair" : "rate",
        laborType: stair ? null : (LABOR_TYPE[l.section ?? "Unsorted"] ?? "Other"),
        description,
        uom: l.uom && RATE_UOMS.includes(l.uom) ? l.uom : null,
        price,
        cost: cost > 0 ? cost : null,
        material: section === "Materials",
      });
    }
  return out;
}

export type TypedPlan = {
  /** Lines whose item is already a row: link the line to it (the usage log). */
  link: { lineId: string; table: "rate" | "stair"; rowId: string }[];
  /** New rows to make, switched off and Needs Review, each with every line that typed it. */
  create: { item: TypedLine; lineIds: string[] }[];
};

/**
 * Match each typed line to a row with the same name (a Rate Card row also by Labor Type, Active or not, reviewed or
 * not), else plan one new row per distinct item, so the same words typed twice in one quote make one row. Existing
 * rows are only ever linked, never changed.
 */
export function planTyped(lines: TypedLine[], rates: CardRow[], stairs: CardRow[]): TypedPlan {
  const plan: TypedPlan = { link: [], create: [] };
  for (const l of lines) {
    const found =
      l.table === "rate"
        ? rates.find((r) => r.laborType === l.laborType && sameName(r.name, l.description))
        : stairs.find((r) => sameName(r.name, l.description));
    if (found) {
      plan.link.push({ lineId: l.lineId, table: l.table, rowId: found.id });
      continue;
    }
    const twin = plan.create.find((c) => c.item.table === l.table && c.item.laborType === l.laborType && sameName(c.item.description, l.description));
    if (twin) twin.lineIds.push(l.lineId);
    else plan.create.push({ item: l, lineIds: [l.lineId] });
  }
  return plan;
}

/** The note on a new row: where it came from and what to check before switching it on. */
export function reviewNote(quoteLabel: string, by: string, on: string): string {
  return `Added by the quote app from a typed line on ${quoteLabel}, sent by ${by} on ${on}. Check the price, cost, unit and contractor, then tick Active and set it to OK. Every quote that used it is under Typed On.`;
}
