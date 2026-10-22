import "server-only";
import { requireQuoter } from "@/lib/auth";
import { AirtableError, getRecord, listByIds, listRecords, type AirtableRecord } from "@/lib/airtable/client";
import { CAT, CATALOGUE_TABLE, LINE, MATERIAL, MATERIAL_TABLE, OPTION, PROFILE, PROFILE_TABLE, QUICK, QUICK_TABLE, QUOTE, RATE, RATE_TABLE, STAIR, STAIR_TABLE, T, VERSION } from "@/lib/airtable/fields";
import { QUICK_GROUPS, type QuickChoice, type QuickGroup, type QuickPart, type QuickProduct } from "@/lib/quick/plan";
import { isStairMethod, isStairType } from "@/lib/quick/stairs";
import { bool, ids, num, str } from "./values";
import { groupVersions, type QuoteGroup, type QuoteHead } from "./group";
import type { MaterialRow, Quote, QuoteLine, QuoteLink, QuoteOption, RateCard, RateRow, StairProfileRow, StairRow } from "./types";

/** Read-side loaders. Each one checks the caller is a quoter before touching Airtable. */

/** Every quote, newest first, with its versions under it (the All quotes page). */
export async function listQuoteGroups(): Promise<QuoteGroup[]> {
  await requireQuoter();
  const [versions, quotes] = await Promise.all([
    listRecords(T.versions, {
      fields: [VERSION.label, VERSION.version, VERSION.status, VERSION.basis, VERSION.quote, VERSION.options],
    }),
    listRecords(T.quotes, {
      fields: [QUOTE.customerName, QUOTE.lastName, QUOTE.firstName, QUOTE.siteCity, QUOTE.quoteNumber, QUOTE.linkStatus, QUOTE.addressStatus, QUOTE.phone, QUOTE.email, QUOTE.projectNumber],
    }),
  ]);
  const heads = new Map<string, QuoteHead>(
    quotes.map((q) => [
      q.id,
      {
        quoteRecordId: q.id,
        quoteNumber: str(q.fields[QUOTE.quoteNumber]),
        customerName: customerOf(q.fields),
        siteCity: str(q.fields[QUOTE.siteCity]),
        phone: str(q.fields[QUOTE.phone]),
        email: str(q.fields[QUOTE.email]),
        projectNumber: str(q.fields[QUOTE.projectNumber]),
        linkStatus: str(q.fields[QUOTE.linkStatus]),
        addressStatus: str(q.fields[QUOTE.addressStatus]),
      },
    ]),
  );
  return groupVersions(
    versions.map((r) => ({
      id: r.id,
      quoteRecordId: ids(r.fields[VERSION.quote])[0] ?? null,
      label: str(r.fields[VERSION.label]),
      version: num(r.fields[VERSION.version]),
      status: str(r.fields[VERSION.status]),
      basis: str(r.fields[VERSION.basis]),
      optionCount: ids(r.fields[VERSION.options]).length,
      createdTime: r.createdTime,
    })),
    heads,
  );
}

/** "Jane Doe" when GHL gave us the parts (first name first, Albert 2026-10-14), else whatever single name the quote carries. */
function customerOf(f: Record<string, unknown> | undefined): string | null {
  if (!f) return null;
  const name = [str(f[QUOTE.firstName]), str(f[QUOTE.lastName])].filter(Boolean).join(" ");
  return name || str(f[QUOTE.customerName]);
}

function source(f: Record<string, unknown>): Pick<QuoteLine, "sourceKind" | "sourceId"> {
  const rate = ids(f[LINE.rateItem])[0];
  if (rate) return { sourceKind: "rate", sourceId: rate };
  const stair = ids(f[LINE.stairItem])[0];
  if (stair) return { sourceKind: "stair", sourceId: stair };
  const product = ids(f[LINE.product])[0];
  if (product) return { sourceKind: "product", sourceId: product };
  const profile = ids(f[LINE.stairProfile])[0];
  if (profile) return { sourceKind: "profile", sourceId: profile };
  return { sourceKind: "manual", sourceId: null };
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
    noHst: bool(f[LINE.noHst]),
    hasSource: [LINE.rateItem, LINE.stairItem, LINE.product, LINE.stairProfile].some((k) => ids(f[k]).length > 0),
    ...source(f),
    labourType: str(f[LINE.rateLaborType]),
    spec: str(f[LINE.rateSpec]),
    description: str(f[LINE.description]),
    area: str(f[LINE.area]),
    uom: str(f[LINE.uom]),
    contractor: str(f[LINE.contractor]),
    materialId: ids(f[LINE.installMaterial])[0] ?? null,
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
    serviceLevel: str(f[OPTION.serviceLevel]),
    crew: str(f[OPTION.crew]),
    privateLabel: str(f[OPTION.privateLabel]),
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

function linkOf(r: AirtableRecord): QuoteLink {
  const f = r.fields;
  return {
    quoteRecordId: r.id,
    quoteNumber: str(f[QUOTE.quoteNumber]),
    displayName: str(f[QUOTE.displayName]),
    firstName: str(f[QUOTE.firstName]),
    lastName: str(f[QUOTE.lastName]),
    phone: str(f[QUOTE.phone]),
    email: str(f[QUOTE.email]),
    addressStatus: str(f[QUOTE.addressStatus]),
    linkStatus: str(f[QUOTE.linkStatus]),
    projectTiming: str(f[QUOTE.projectTiming]),
    ghlContactId: str(f[QUOTE.ghlContactId]),
    ghlOpportunityId: str(f[QUOTE.ghlOpportunityId]),
    folderUrl: str(f[QUOTE.folderUrl]),
    companyCamUrl: str(f[QUOTE.companyCamUrl]),
    projectNumber: str(f[QUOTE.projectNumber]),
    notionProjectUrl: str(f[QUOTE.notionProjectUrl]),
  };
}

const bySort = <X extends { sortOrder: number | null }>(a: X, b: X) =>
  (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER);

export async function getQuote(id: string): Promise<Quote | null> {
  await requireQuoter();
  let q: AirtableRecord;
  try {
    q = await getRecord(T.versions, id);
  } catch (e) {
    if (e instanceof AirtableError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
  const f = q.fields;
  const familyId = ids(f[VERSION.quote])[0];
  const [family, optionRecs, lineRecs] = await Promise.all([
    familyId ? getRecord(T.quotes, familyId) : Promise.resolve(null),
    listByIds(T.options, ids(f[VERSION.options])),
    listByIds(T.lines, ids(f[VERSION.lines])),
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
    quoteId: str(f[VERSION.label]),
    version: num(f[VERSION.version]),
    status: str(f[VERSION.status]),
    basis: str(f[VERSION.basis]),
    showHst: bool(f[VERSION.showHst]),
    discountRate: num(f[VERSION.discountRate]) ?? 0,
    validUntil: str(f[VERSION.validUntil]),
    sentAt: str(f[VERSION.sentAt]),
    sendBlock: str(f[VERSION.sendBlock]),
    customerToken: str(f[VERSION.customerToken]),
    sentBy: str(f[VERSION.sentBy]),
    sentTo: str(f[VERSION.sentTo]),
    notes: str(f[VERSION.notes]),
    customerName: customerOf(family?.fields),
    siteAddress: str(family?.fields[QUOTE.siteAddress]),
    siteCity: str(family?.fields[QUOTE.siteCity]),
    link: family ? linkOf(family) : null,
    options,
    legacyLineCount,
  };
}

/**
 * Active Stair Profiles (2026-10-20), in their order. A row whose type or method isn't one the app
 * knows, or that has no price, is left off rather than priced or described wrongly.
 */
async function loadProfiles(): Promise<StairProfileRow[]> {
  const recs = await listRecords(PROFILE_TABLE, { fields: Object.values(PROFILE), filterByFormula: `{${PROFILE.active}}` });
  return recs
    .flatMap((r): StairProfileRow[] => {
      const f = r.fields;
      const name = str(f[PROFILE.name]);
      const type = str(f[PROFILE.stairType]);
      const method = str(f[PROFILE.method]);
      const price = num(f[PROFILE.price]);
      if (!name || !isStairType(type) || !isStairMethod(method) || price === null) return [];
      return [
        {
          id: r.id,
          name,
          type,
          method,
          steps: num(f[PROFILE.steps]),
          price,
          cost: num(f[PROFILE.cost]),
          sort: num(f[PROFILE.sort]) ?? 999,
          template: {
            perStep: ids(f[PROFILE.perStep]),
            perStaircase: ids(f[PROFILE.perStaircase]),
            perOpenSide: ids(f[PROFILE.perOpenSide]),
            perHandrailFt: ids(f[PROFILE.perHandrailFt]),
            perSpindle: ids(f[PROFILE.perSpindle]),
            perPost: ids(f[PROFILE.perPost]),
          },
        },
      ];
    })
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

/** The preliminary's staircase dropdown. Costs included: quoters only; the page strips them before the browser. */
export async function getStairProfiles(): Promise<StairProfileRow[]> {
  await requireQuoter();
  return loadProfiles();
}

/** Active Rate Card rows, Stair Items, Install Materials and Stair Profiles, for the editor. Costs included: quoters only. */
export async function getRateCard(): Promise<RateCard> {
  await requireQuoter();
  const [rateRecs, stairRecs, materialRecs, profiles] = await Promise.all([
    listRecords(RATE_TABLE, { fields: Object.values(RATE) }),
    listRecords(STAIR_TABLE, { fields: Object.values(STAIR) }),
    listRecords(MATERIAL_TABLE, { fields: Object.values(MATERIAL), filterByFormula: `{${MATERIAL.active}}` }),
    loadProfiles(),
  ]);
  const rates = rateRecs
    .filter((r) => bool(r.fields[RATE.active]))
    .flatMap((r): RateRow[] => {
      const f = r.fields;
      const labourType = str(f[RATE.laborType]);
      const spec = str(f[RATE.spec]);
      const rate = num(f[RATE.rate]);
      if (!labourType || !spec || rate === null) return [];
      return [
        {
          id: r.id,
          labourType,
          spec,
          contractor: str(f[RATE.contractor]) ?? "Unassigned",
          uom: str(f[RATE.uom]),
          rate,
          cost: num(f[RATE.totalCost]) ?? 0,
          minCharge: num(f[RATE.minCharge]),
          defaultWaste: num(f[RATE.defaultWaste]),
          materialGroup: str(f[RATE.materialGroup]),
          defaultMaterialId: ids(f[RATE.defaultMaterial])[0] ?? null,
        },
      ];
    });
  const stairs = stairRecs
    .filter((r) => bool(r.fields[STAIR.active]))
    .flatMap((r): StairRow[] => {
      const f = r.fields;
      const name = str(f[STAIR.name]);
      const rate = num(f[STAIR.rate]);
      if (!name || rate === null) return [];
      return [{ id: r.id, name, category: str(f[STAIR.category]), size: str(f[STAIR.size]), rate, cost: num(f[STAIR.cost]) }];
    });
  const materials = materialRecs.flatMap((r): MaterialRow[] => {
    const f = r.fields;
    const name = str(f[MATERIAL.name]);
    const group = str(f[MATERIAL.group]);
    return name && group ? [{ id: r.id, name, group, cost: num(f[MATERIAL.cost]), price: num(f[MATERIAL.price]) }] : [];
  });
  return { rates, stairs, materials, profiles };
}

// ---------- the quick form (src/lib/quick/plan.ts) ----------

function toProduct(r: AirtableRecord): QuickProduct | null {
  const f = r.fields;
  const rate = num(f[CAT.retail]);
  const name = str(f[CAT.name]);
  if (rate === null || !name) return null;
  return { recordId: r.id, sku: str(f[CAT.sku]) ?? "", name, rate, cost: num(f[CAT.cost]) };
}

const skuFormula = (skus: string[]) => `OR(${skus.map((s) => `{${CAT.sku}}='${s.replace(/[\\']/g, "")}'`).join(",")})`;

/**
 * The quick form's choices, each with the prices behind it, from the Quick Quote Choices table.
 * Only active choices whose Rate Card rows and Stair Items are active; a material choice keeps
 * its standard product when the SKU is found.
 */
export async function getQuickForm(): Promise<QuickChoice[]> {
  await requireQuoter();
  const [choiceRecs, card] = await Promise.all([listRecords(QUICK_TABLE, { fields: Object.values(QUICK), filterByFormula: `{${QUICK.active}}` }), getRateCard()]);
  const rates = new Map(card.rates.map((r) => [r.id, r]));
  const stairs = new Map(card.stairs.map((s) => [s.id, s]));
  const skus = [...new Set(choiceRecs.map((r) => str(r.fields[QUICK.standardSku])).filter((s): s is string => Boolean(s)))];
  const productRecs = skus.length ? await listRecords(CATALOGUE_TABLE, { fields: Object.values(CAT), filterByFormula: skuFormula(skus) }) : [];
  const bySku = new Map(productRecs.flatMap((r) => { const p = toProduct(r); return p ? [[p.sku, p] as const] : []; }));

  return choiceRecs
    .flatMap((r): QuickChoice[] => {
      const f = r.fields;
      const group = str(f[QUICK.group]);
      const label = str(f[QUICK.choice]);
      if (!label || !group || !(QUICK_GROUPS as readonly string[]).includes(group)) return [];
      const rateParts = ids(f[QUICK.rateCard]).map((id) => rates.get(id));
      const stairParts = ids(f[QUICK.stairItems]).map((id) => stairs.get(id));
      const sku = str(f[QUICK.standardSku]);
      const product = sku ? (bySku.get(sku) ?? null) : null;
      // A material with a standard product is priced from it (2026-10-22): a Rate Card row linked beside
      // it is a fallback for when there is no product, never a requirement, so a dead link doesn't hide the choice.
      const material = group === "Material";
      // Otherwise a linked row that's inactive or unpriced makes the whole choice unpriceable: leave it off rather than quote part of it.
      if (!(material && product) && (rateParts.some((x) => !x) || stairParts.some((x) => !x))) return [];
      const parts: QuickPart[] = [
        ...rateParts.flatMap((x) => (x ? [{ kind: "rate" as const, recordId: x.id, labourType: x.labourType, spec: x.spec, description: `${x.labourType} | ${x.spec}`, contractor: x.contractor, uom: x.uom, rate: x.rate, cost: x.cost, minCharge: x.minCharge }] : [])),
        ...stairParts.flatMap((x) => (x ? [{ kind: "stair" as const, recordId: x.id, labourType: null, spec: null, description: `${x.name}${x.size ? ` (${x.size})` : ""}`, contractor: null, uom: "piece", rate: x.rate, cost: x.cost, minCharge: null }] : [])),
      ];
      if (material ? !product && parts.length === 0 : parts.length === 0) return [];
      return [{ id: r.id, group: group as QuickGroup, label, sort: num(f[QUICK.sort]) ?? 999, times: Math.max(1, Math.round(num(f[QUICK.times]) ?? 1)), parts, product }];
    })
    .sort((a, b) => QUICK_GROUPS.indexOf(a.group) - QUICK_GROUPS.indexOf(b.group) || a.sort - b.sort || a.label.localeCompare(b.label));
}

/** Catalogue products by record id, for the materials staff picked instead of the standard one. */
export async function quickProducts(recordIds: string[]): Promise<Map<string, QuickProduct>> {
  await requireQuoter();
  if (recordIds.length === 0) return new Map();
  const recs = await listByIds(CATALOGUE_TABLE, recordIds, Object.values(CAT));
  return new Map(recs.filter((r) => r.fields[CAT.active] !== false).flatMap((r) => { const p = toProduct(r); return p ? [[p.recordId, p] as const] : []; }));
}

/** Active catalogue products whose SKU, name or collection contains every word typed. At most 12. */
export async function searchProducts(query: string): Promise<QuickProduct[]> {
  await requireQuoter();
  const words = query.toLowerCase().replace(/[^a-z0-9 .\-]/g, " ").split(/\s+/).filter((w) => w.length > 0).slice(0, 4);
  if (words.join("").length < 3) return [];
  const hay = `LOWER({${CAT.sku}}&' '&{${CAT.name}}&' '&{${CAT.collection}}&' '&{${CAT.brand}})`;
  const formula = `AND({${CAT.active}},${words.map((w) => `SEARCH('${w}',${hay})`).join(",")})`;
  const recs = await listRecords(CATALOGUE_TABLE, { fields: Object.values(CAT), filterByFormula: formula });
  return recs.flatMap((r) => { const p = toProduct(r); return p ? [p] : []; }).slice(0, 12);
}
