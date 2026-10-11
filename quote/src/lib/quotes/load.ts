import "server-only";
import { requireQuoter } from "@/lib/auth";
import { AirtableError, getRecord, listByIds, listRecords, type AirtableRecord } from "@/lib/airtable/client";
import { FAMILY, LINE, OPTION, QUOTE, T } from "@/lib/airtable/fields";
import { bool, ids, num, str } from "./values";
import type { Quote, QuoteLine, QuoteOption, QuoteSummary } from "./types";

/** Read-side loaders. Each one checks the caller is a quoter before touching Airtable. */

export async function listQuotes(): Promise<QuoteSummary[]> {
  await requireQuoter();
  const [quotes, families] = await Promise.all([
    listRecords(T.quotes, {
      fields: [QUOTE.quoteId, QUOTE.version, QUOTE.status, QUOTE.basis, QUOTE.family, QUOTE.options],
    }),
    listRecords(T.families, { fields: [FAMILY.customerName, FAMILY.siteCity] }),
  ]);
  const fam = new Map(families.map((f) => [f.id, f.fields]));
  return quotes
    .map((r): QuoteSummary => {
      const f = fam.get(ids(r.fields[QUOTE.family])[0] ?? "");
      return {
        id: r.id,
        quoteId: str(r.fields[QUOTE.quoteId]),
        version: num(r.fields[QUOTE.version]),
        status: str(r.fields[QUOTE.status]),
        basis: str(r.fields[QUOTE.basis]),
        customerName: str(f?.[FAMILY.customerName]),
        siteCity: str(f?.[FAMILY.siteCity]),
        optionCount: ids(r.fields[QUOTE.options]).length,
        createdTime: r.createdTime,
      };
    })
    .sort((a, b) => b.createdTime.localeCompare(a.createdTime));
}

function toLine(r: AirtableRecord): QuoteLine {
  const f = r.fields;
  return {
    id: r.id,
    lineType: str(f[LINE.lineType]),
    section: str(f[LINE.section]),
    include: bool(f[LINE.include]),
    qty: num(f[LINE.qty]),
    waste: num(f[LINE.waste]),
    unitPrice: num(f[LINE.unitPrice]),
    unitPriceSnap: num(f[LINE.unitPriceSnap]),
    unitCostSnap: num(f[LINE.unitCostSnap]),
    costOverride: num(f[LINE.costOverride]),
    manualCost: num(f[LINE.manualCost]),
    minChargeSnap: num(f[LINE.minChargeSnap]),
    hasSource: [LINE.rateItem, LINE.stairItem, LINE.product].some((k) => ids(f[k]).length > 0),
    description: str(f[LINE.description]),
    area: str(f[LINE.area]),
    uom: str(f[LINE.uom]),
    contractor: str(f[LINE.contractor]),
    clientNote: str(f[LINE.clientNote]),
    sortOrder: num(f[LINE.sortOrder]),
    airtableTotal: num(f[LINE.lineTotal]),
    airtableCost: num(f[LINE.lineCost]),
  };
}

function toOption(r: AirtableRecord, lines: QuoteLine[]): QuoteOption {
  const f = r.fields;
  return {
    id: r.id,
    name: str(f[OPTION.name]) ?? "Untitled option",
    description: str(f[OPTION.description]),
    sortOrder: num(f[OPTION.sortOrder]),
    recommended: bool(f[OPTION.recommended]),
    lines,
    airtable: {
      preDiscount: num(f[OPTION.preDiscount]) ?? undefined,
      discount: num(f[OPTION.discount]) ?? undefined,
      subtotal: num(f[OPTION.subtotal]) ?? undefined,
      cost: num(f[OPTION.cost]) ?? undefined,
      profit: num(f[OPTION.profit]) ?? undefined,
      // Airtable leaves margin blank when the subtotal is not positive; so does the app.
      marginPct: num(f[OPTION.marginPct]),
      hst: num(f[OPTION.hst]) ?? undefined,
      total: num(f[OPTION.total]) ?? undefined,
      payment1: num(f[OPTION.payment1]) ?? undefined,
      payment2: num(f[OPTION.payment2]) ?? undefined,
      paymentFinal: num(f[OPTION.paymentFinal]) ?? undefined,
    },
  };
}

const bySort = <X extends { sortOrder: number | null }>(a: X, b: X) =>
  (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER);

export async function getQuote(id: string): Promise<Quote | null> {
  await requireQuoter();
  let q: AirtableRecord;
  try {
    q = await getRecord(T.quotes, id);
  } catch (e) {
    if (e instanceof AirtableError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
  const f = q.fields;
  const familyId = ids(f[QUOTE.family])[0];
  const [family, optionRecs, lineRecs] = await Promise.all([
    familyId ? getRecord(T.families, familyId) : Promise.resolve(null),
    listByIds(T.options, ids(f[QUOTE.options])),
    listByIds(T.lines, ids(f[QUOTE.lines])),
  ]);

  const byOption = new Map<string, QuoteLine[]>();
  let legacyLineCount = 0;
  for (const r of lineRecs) {
    const optionId = ids(r.fields[LINE.option])[0];
    if (!optionId) {
      legacyLineCount++;
      continue;
    }
    byOption.set(optionId, [...(byOption.get(optionId) ?? []), toLine(r)]);
  }

  const options = optionRecs
    .map((r) => toOption(r, (byOption.get(r.id) ?? []).sort(bySort)))
    .sort((a, b) => bySort(a, b) || a.name.localeCompare(b.name));

  return {
    id: q.id,
    quoteId: str(f[QUOTE.quoteId]),
    version: num(f[QUOTE.version]),
    status: str(f[QUOTE.status]),
    basis: str(f[QUOTE.basis]),
    showHst: bool(f[QUOTE.showHst]),
    discountRate: num(f[QUOTE.discountRate]) ?? 0,
    validUntil: str(f[QUOTE.validUntil]),
    sentAt: str(f[QUOTE.sentAt]),
    notes: str(f[QUOTE.notes]),
    customerName: str(family?.fields[FAMILY.customerName]),
    siteAddress: str(family?.fields[FAMILY.siteAddress]),
    siteCity: str(family?.fields[FAMILY.siteCity]),
    options,
    legacyLineCount,
  };
}
