import "server-only";
import { createReviewRecord, listRecords, updateRecords } from "@/lib/airtable/client";
import { LINE, RATE, RATE_TABLE, STAIR, STAIR_TABLE, T } from "@/lib/airtable/fields";
import { planTyped, reviewNote, typedLines, type CardRow } from "@/lib/catalog/typed";
import type { QuoteOption } from "@/lib/quotes/types";

/**
 * Typed lines on a sent quote, saved for next time and logged (Albert, 2026-11-01). The rules are pure, in
 * src/lib/catalog/typed.ts; this file reads the Rate Card and Stair Items, creates the rows that don't exist yet
 * (switched off, Needs Review, through `createReviewRecord()`, the only way the app can reach those tables), and
 * links every typed line to its row, which is the usage log Albert checks charges against ("Typed On" on the row).
 * Called from sendQuote() after the quote has gone out; it never stops or changes a send.
 */

const text = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name) : null);

export async function saveTypedItems(options: Pick<QuoteOption, "lines">[], ctx: { quoteLabel: string; by: string; on: string }): Promise<{ created: number; linked: number }> {
  const lines = typedLines(options);
  if (lines.length === 0) return { created: 0, linked: 0 };

  const [rateRecs, stairRecs] = await Promise.all([
    lines.some((l) => l.table === "rate") ? listRecords(RATE_TABLE, { fields: [RATE.laborType, RATE.spec] }) : Promise.resolve([]),
    lines.some((l) => l.table === "stair") ? listRecords(STAIR_TABLE, { fields: [STAIR.name] }) : Promise.resolve([]),
  ]);
  const rates: CardRow[] = rateRecs.map((r) => ({ id: r.id, laborType: text(r.fields[RATE.laborType]), name: text(r.fields[RATE.spec]) }));
  const stairs: CardRow[] = stairRecs.map((r) => ({ id: r.id, laborType: null, name: text(r.fields[STAIR.name]) }));
  const plan = planTyped(lines, rates, stairs);

  const note = reviewNote(ctx.quoteLabel, ctx.by, ctx.on);
  const links = [...plan.link];
  for (const c of plan.create) {
    const i = c.item;
    const fields: Record<string, unknown> =
      i.table === "rate"
        ? {
            [RATE.rateKey]: `${i.laborType} | ${i.description} | (typed)`,
            [RATE.laborType]: i.laborType,
            [RATE.spec]: i.description,
            ...(i.uom ? { [RATE.uom]: i.uom } : {}),
            [RATE.rate]: i.price,
            ...(i.cost !== null ? { [i.material ? RATE.materialCost : RATE.laborCost]: i.cost } : {}),
            [RATE.active]: false,
            [RATE.importStatus]: "Needs Review",
            [RATE.productNote]: note,
          }
        : {
            [STAIR.name]: i.description,
            [STAIR.rate]: i.price,
            ...(i.cost !== null ? { [STAIR.cost]: i.cost } : {}),
            [STAIR.active]: false,
            [STAIR.reviewStatus]: "Needs Review",
            [STAIR.note]: note,
          };
    const row = await createReviewRecord(i.table === "rate" ? RATE_TABLE : STAIR_TABLE, fields);
    for (const lineId of c.lineIds) links.push({ lineId, table: i.table, rowId: row.id });
  }

  await updateRecords(
    T.lines,
    links.map((l) => ({ id: l.lineId, fields: { [l.table === "rate" ? LINE.customRateItem : LINE.customStairItem]: [l.rowId] } })),
  );
  return { created: plan.create.length, linked: links.length };
}
