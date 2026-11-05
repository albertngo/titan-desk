/**
 * The editor's data and every change it can make, as pure functions. No React, no I/O:
 * the screen calls these, and tests/editor.test.ts proves them. Money is still computed
 * only by src/lib/calc.ts, from the same LineInput fields Airtable stores.
 */
import { lineTotal, optionHst, optionTotals, round2, sectionOf, SECTIONS, type LineInput } from "@/lib/calc";
import { ACCEPTED_LINE, CONTRACTOR_LINE, contractorAmount, DISCOUNTS_SECTION, grossOf, isAcceptedLine, isAdjustmentLine, isContractorLine, isDiscountLine, PRICE_ADJUSTMENT, priceAtMargin, priceAtTotalDiscount } from "@/lib/pricing/discounts";
import type { PaymentSchedule } from "@/lib/pricing/schedule";
import { levelApplies, levelOf, levelPrice, type ServiceLevel } from "@/lib/pricing/service";
import { partKey } from "@/lib/quotes/scope";
import { STAIR_UNITS } from "./stairGroups";
import type { MaterialRow, Part, Quote, QuoteLine, RateRow, Scope, StairRow } from "@/lib/quotes/types";

export type Section = (typeof SECTIONS)[number] | "Unsorted";

export type EditorLine = LineInput & {
  id: string;
  sourceKind: "rate" | "stair" | "product" | "profile" | "manual";
  sourceId: string | null;
  labourType: string | null;
  spec: string | null;
  description: string;
  contractor: string | null;
  /** The Install Material picked for a Rate Card line (2026-10-16); null/absent = none. See `rateSnap`. */
  materialId?: string | null;
  /** The Stair Item's Category (2026-10-28), for grouping the Stairs section; display only, never saved. */
  stairCategory?: string | null;
  area: string;
  uom: string | null;
  clientNote: string;
};

export type EditorOption = {
  id: string;
  name: string;
  description: string;
  recommended: boolean;
  /** Standard when absent (older drafts and options saved before 2026-10-16). See src/lib/pricing/service.ts. */
  serviceLevel?: ServiceLevel;
  /** The contractor picked for the whole option (a Rate Card Contractor name); null or absent = none. See setCrew. */
  crew?: string | null;
  /** What the customer sees in place of the Private section's lines (2026-10-22); null or absent = "Additional work". */
  privateLabel?: string | null;
  /** Flooring or Stairs (2026-10-28); null or absent = worked out from the lines. See src/lib/quotes/scope.ts. */
  scope?: Scope | null;
  /** The part of the home (2026-10-30); absent = the scope stands for it. Absent rather than null, so older drafts keep their fingerprint. */
  part?: Part;
  /** Kept on the quote, left off what the customer is sent (2026-10-30); absent = offered. */
  notOffered?: true;
  /** This option's own HST (2026-11-04); absent = the version's Show HST. Absent rather than null, so older drafts keep their fingerprint. */
  showHst?: boolean;
  lines: EditorLine[];
};

export type EditorQuote = {
  /** Airtable record id of the quote being edited; null for a new quote. */
  quoteRecordId: string | null;
  /**
   * Customer and site are shown, never edited, here: GHL owns them (Albert, 2026-10-13/14).
   * They come from the quote each time the editor opens; see `withCustomerFrom`.
   */
  customerName: string;
  siteAddress: string;
  siteCity: string;
  ghlContactId: string | null;
  ghlOpportunityId: string | null;
  addressStatus: string | null;
  projectNumber: string | null;
  notionProjectUrl: string | null;
  discountRate: number;
  showHst: boolean;
  /** Why the discount was given, in the customer's words (2026-10-22); prints beside the Discount row. */
  discountReason?: string | null;
  /** Itemised pricing for the customer (2026-10-22). False or absent = lump sum, the default: one price, no line prices. */
  itemised?: boolean;
  /** The payment schedule (2026-10-27); null or absent = 35 / 35 / balance. See src/lib/pricing/schedule.ts. */
  schedule?: PaymentSchedule | null;
  options: EditorOption[];
};

/**
 * One contractor's Rate Card row. `rate` and `cost` are labour only; `material` is set when the row
 * names a group and a default material that is priced, and the line adds the chosen one on top.
 */
export type CardContractor = {
  name: string;
  rate: number;
  cost: number;
  recordId: string;
  material: { default: PricedMaterial; choices: PricedMaterial[] } | null;
};
export type PricedMaterial = MaterialRow & { cost: number; price: number };

/** Everything the picker can add: one entry per labour type + spec (contractors inside), or one stair item. */
export type CardEntry =
  | {
      kind: "rate";
      key: string;
      labourType: string;
      spec: string;
      uom: string | null;
      minCharge: number | null;
      defaultWaste: number | null;
      contractors: CardContractor[];
    }
  | { kind: "stair"; key: string; name: string; size: string | null; category: string | null; rate: number; cost: number | null; recordId: string; unit?: string | null };

/** Which Rate Card labour types belong under each section, best match first. */
export const SECTION_LABOUR: Record<string, string[]> = {
  Install: ["Install", "Refinish", "Sand", "Paint"],
  Stairs: [],
  Removal: ["Remove"],
  Disposal: ["Disposal"],
  Prep: ["Install"],
  Materials: ["Material"],
  Delivery: ["Delivery"],
  Other: ["Other"],
};

/** Quote Lines.Line Type for a section (Airtable's own select values). */
export const LINE_TYPE: Record<string, string> = {
  Install: "Install",
  Removal: "Removal",
  Disposal: "Disposal",
  Prep: "Other",
  Materials: "Material",
  Delivery: "Delivery",
  Other: "Other",
  Private: "Other",
  Discounts: "Other",
  Exclusions: "Note",
  Stairs: "Stairs",
};

/** A typed line's unit choices; the four stair units (2026-11-04) come last. Quote Lines → UOM must offer each. */
export const UOMS = ["sqft", "linear ft", "each", "piece", "hour", "roll", "flat", ...STAIR_UNITS] as const;

let counter = 0;
/** Local ids for new options and lines; Airtable assigns real ones on save. */
export function newId(prefix: "opt" | "line"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

// ---------- catalogue ----------

const priced = (m: MaterialRow): m is PricedMaterial => m.price !== null && m.cost !== null;

/** A row's swappable material, or null when it has none or it isn't fully set up in Airtable. */
function materialFor(r: RateRow, materials: MaterialRow[]): CardContractor["material"] {
  if (!r.materialGroup || !r.defaultMaterialId) return null;
  const choices = materials.filter((m): m is PricedMaterial => m.group === r.materialGroup && priced(m)).sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  const def = choices.find((m) => m.id === r.defaultMaterialId);
  if (!def) return null;
  return { default: def, choices };
}

export function buildCatalogue(rates: RateRow[], stairs: StairRow[], materials: MaterialRow[] = []): CardEntry[] {
  const byKey = new Map<string, Extract<CardEntry, { kind: "rate" }>>();
  for (const r of rates) {
    const key = `${r.labourType}|${r.spec}`;
    const e = byKey.get(key) ?? {
      kind: "rate" as const,
      key,
      labourType: r.labourType,
      spec: r.spec,
      uom: r.uom,
      minCharge: r.minCharge,
      defaultWaste: r.defaultWaste,
      contractors: [],
    };
    e.contractors.push({ name: r.contractor, rate: r.rate, cost: r.cost, recordId: r.id, material: materialFor(r, materials) });
    byKey.set(key, e);
  }
  const entries: CardEntry[] = [...byKey.values()];
  for (const e of entries) if (e.kind === "rate") e.contractors.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  for (const s of stairs)
    entries.push({ kind: "stair", key: `stair|${s.id}`, name: s.name, size: s.size, category: s.category, rate: s.rate, cost: s.cost, recordId: s.id, unit: s.unit ?? null });
  return entries;
}

export const entryLabel = (e: CardEntry) =>
  e.kind === "rate" ? `${e.labourType} | ${e.spec}` : `${e.name}${e.size ? ` (${e.size})` : ""}`;

/** Cheapest contractor for the same work; the card lists them cheapest first. */
export const bestContractor = (e: Extract<CardEntry, { kind: "rate" }>) => e.contractors[0];

/**
 * Picker search: every word must appear. A section shows only its own work (Albert, 2026-10-27:
 * Install, Stairs, Removal… each open on their own options, not the whole card); `all` searches the
 * whole Rate Card, the section's own work still first. A section with no labour types of its own
 * (Private) always shows the whole card. Stair Items are offered in the Stairs section only (Albert,
 * 2026-10-18), never under flooring work, even with `all`.
 */
export function searchCatalogue(entries: CardEntry[], query: string, section: string, limit = 40, all = false): CardEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const preferred = SECTION_LABOUR[section];
  const belongs = (e: CardEntry) => (e.kind === "stair" ? section === "Stairs" : (preferred ?? []).includes(e.labourType));
  const filtered = !all && preferred !== undefined;
  const rank = (e: CardEntry) => (belongs(e) ? 0 : 1);
  return entries
    .filter((e) => e.kind !== "stair" || section === "Stairs")
    .filter((e) => !filtered || belongs(e))
    .filter((e) => {
      const hay = entryLabel(e).toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => rank(a) - rank(b) || entryLabel(a).localeCompare(entryLabel(b)))
    .slice(0, limit);
}

/**
 * Waste is a materials thing (Albert, 2026-10-27): only a Materials line offers it. A line elsewhere
 * that already carries waste (saved before then) keeps its box so it can be seen and cleared.
 */
export const showsWaste = (l: Pick<EditorLine, "section" | "waste">) => sectionOf(l) === "Materials" || (l.waste ?? 0) !== 0;

// ---------- building lines ----------

function baseLine(section: string): Omit<EditorLine, "description" | "sourceKind"> {
  return {
    id: newId("line"),
    sourceId: null,
    labourType: null,
    spec: null,
    contractor: null,
    area: "",
    uom: null,
    clientNote: "",
    lineType: LINE_TYPE[section] ?? "Other",
    section,
    include: true,
    qty: null,
    waste: null,
    unitPrice: null,
    unitPriceSnap: null,
    unitCostSnap: null,
    costOverride: null,
    manualCost: null,
    minChargeSnap: null,
    hasSource: false,
  };
}

// ---------- material (2026-10-16) ----------
//
// A Rate Card row can name a Material Group and a Default Material. On a line the material can be
// swapped for any other in the group: one line for the customer, named with its material. The
// row's Titan Rate and Total Cost are labour only (2026-10-28: the 2026-10-16 reading, that they
// already included the default material, left a glue-down line priced as labour alone), so the
// line = the row (at the service level, so Premium marks up labour only) + the chosen material.

type RateEntry = Extract<CardEntry, { kind: "rate" }>;

/** A Rate Card line's card price and cost for one contractor, material and service level. */
export function rateSnap(entry: RateEntry, c: CardContractor, materialId: string | null | undefined, level: ServiceLevel) {
  const applies = levelApplies({ sourceKind: "rate", labourType: entry.labourType });
  const m = c.material;
  if (!m) return { price: levelPrice(c.rate, level, applies), cost: c.cost, material: null };
  const chosen = m.choices.find((x) => x.id === materialId) ?? m.default;
  return {
    price: round2(levelPrice(c.rate, level, applies) + chosen.price),
    cost: round2(c.cost + chosen.cost),
    material: chosen,
  };
}

/** The wording of a Rate Card line: the work, then the material when it has one. */
export const rateWording = (entry: RateEntry, material: MaterialRow | null) => (material ? `${entryLabel(entry)} · ${material.name}` : entryLabel(entry));

/** Re-price a Rate Card line from the card for a contractor and material. Typed overrides stay as typed. */
function snapLine(l: EditorLine, entry: RateEntry, c: CardContractor, materialId: string | null | undefined, level: ServiceLevel): EditorLine {
  const s = rateSnap(entry, c, materialId, level);
  const material = s.material?.id ?? null;
  return {
    ...l,
    contractor: c.name,
    sourceId: c.recordId,
    unitPriceSnap: s.price,
    unitCostSnap: s.cost,
    materialId: material,
    ...(material !== (l.materialId ?? null) ? { description: rateWording(entry, s.material) } : {}),
  };
}

/** The materials a line can be swapped between (empty when it has no choice), and the one it has. */
export function materialChoices(l: EditorLine, entries: CardEntry[]): { choices: PricedMaterial[]; current: PricedMaterial | null; base: PricedMaterial | null } {
  const e = entryFor(l, entries);
  const c = e && e.kind === "rate" ? e.contractors.find((x) => x.name === l.contractor) : undefined;
  const m = c?.material;
  if (!m) return { choices: [], current: null, base: null };
  return { choices: m.choices, current: m.choices.find((x) => x.id === l.materialId) ?? m.default, base: m.default };
}

/** Swap a line's material: price and cost follow the card; a typed price or cost stays as typed. */
export function setMaterial(q: EditorQuote, optionId: string, lineId: string, materialId: string, entries: CardEntry[]): EditorQuote {
  const level = levelOf(q.options.find((o) => o.id === optionId) ?? {});
  return mapLine(q, optionId, lineId, (l) => {
    const e = entryFor(l, entries);
    if (!e || e.kind !== "rate") return l;
    const c = e.contractors.find((x) => x.name === l.contractor);
    if (!c?.material?.choices.some((m) => m.id === materialId)) return l;
    return snapLine(l, e, c, materialId, level);
  });
}

/**
 * The material's share of a line's unit price and cost (2026-10-28: "put the unit cost and unit price
 * for the material so that they are also editable"). Labour is the card row at the option's level;
 * the material is what the line charges on top of it, so a typed material price is stored as the
 * line's own Unit Price (labour + material) and Airtable needs no new field. `price` / `cost` are
 * null while the line follows the card; `cardPrice` / `cardCost` are the picked material's own.
 */
export function materialSplit(l: EditorLine, entries: CardEntry[], level: ServiceLevel) {
  const e = entryFor(l, entries);
  if (!e || e.kind !== "rate") return null;
  const c = e.contractors.find((x) => x.name === l.contractor);
  if (!c?.material) return null;
  const s = rateSnap(e, c, l.materialId, level);
  const chosen = s.material!;
  const labourPrice = round2(s.price - chosen.price);
  const labourCost = round2(s.cost - chosen.cost);
  return {
    labourPrice,
    labourCost,
    cardPrice: chosen.price,
    cardCost: chosen.cost,
    price: l.unitPrice === null ? null : round2(l.unitPrice - labourPrice),
    cost: l.costOverride === null ? null : round2(l.costOverride - labourCost),
  };
}

/** Type the material's price or cost on a line: the line's unit price or cost becomes labour + it. Null goes back to the card. */
export function setMaterialFigures(q: EditorQuote, optionId: string, lineId: string, patch: { price?: number | null; cost?: number | null }, entries: CardEntry[]): EditorQuote {
  const level = levelOf(q.options.find((o) => o.id === optionId) ?? {});
  return mapLine(q, optionId, lineId, (l) => {
    const m = materialSplit(l, entries, level);
    if (!m) return l;
    const next = { ...l };
    if (patch.price !== undefined) next.unitPrice = patch.price === null ? null : round2(m.labourPrice + patch.price);
    if (patch.cost !== undefined) next.costOverride = patch.cost === null ? null : round2(m.labourCost + patch.cost);
    return next;
  });
}

/**
 * A Stair Item charged once per staircase starts at quantity 1 (Albert, 2026-11-04: "Stringers painting white should
 * auto 1"). Read from the item's name, "(per staircase)", which the three stringer items (paint white, oak skin, sand
 * and stain) carry; staff can still change it. The builder and the site sheet set their own quantity.
 */
export const perStaircase = (name: string) => /\(\s*per\s+staircase\s*\)/i.test(name);

/** A line priced from the card, at the option's service level (Premium adds to labour only). */
export function lineFromEntry(entry: CardEntry, section: string, contractorName?: string, level: ServiceLevel = "Standard"): EditorLine {
  if (entry.kind === "stair") {
    return {
      ...baseLine(section),
      sourceKind: "stair",
      sourceId: entry.recordId,
      stairCategory: entry.category,
      description: entryLabel(entry),
      // The Stair Item's own Unit (2026-11-04): steps, sets, ft, pcs, or none for the number alone.
      uom: entry.unit ?? null,
      qty: perStaircase(entry.name) ? 1 : null,
      unitPriceSnap: levelPrice(entry.rate, level, true),
      unitCostSnap: entry.cost,
      hasSource: true,
    };
  }
  const c = entry.contractors.find((x) => x.name === contractorName) ?? bestContractor(entry);
  const s = rateSnap(entry, c, null, level);
  return {
    ...baseLine(section),
    sourceKind: "rate",
    sourceId: c.recordId,
    labourType: entry.labourType,
    spec: entry.spec,
    description: rateWording(entry, s.material),
    contractor: c.name,
    materialId: s.material?.id ?? null,
    uom: entry.uom,
    // A flat card row (a bin, a trip) starts at one (Albert, 2026-11-04: "it should already go as 1 as the
    // quantity"), as the preliminary has always made it; anything measured starts blank for the amount.
    ...(entry.uom === "flat" ? { qty: 1 } : {}),
    // A card row's default waste is taken only in Materials (2026-10-27); see showsWaste.
    waste: section === "Materials" ? entry.defaultWaste : null,
    unitPriceSnap: s.price,
    unitCostSnap: s.cost,
    minChargeSnap: entry.minCharge,
    hasSource: true,
  };
}

export function manualLine(section: string, description = ""): EditorLine {
  return { ...baseLine(section), sourceKind: "manual", description, uom: section === "Delivery" ? "flat" : null };
}

export function exclusionLine(text: string): EditorLine {
  return { ...baseLine("Exclusions"), sourceKind: "manual", description: text, lineType: "Note" };
}

/** The card entry a line was priced from, if it still exists. */
export function entryFor(line: EditorLine, entries: CardEntry[]): CardEntry | undefined {
  if (line.sourceKind === "rate" && line.labourType && line.spec) return entries.find((e) => e.key === `${line.labourType}|${line.spec}`);
  if (line.sourceKind === "stair") return entries.find((e) => e.kind === "stair" && e.recordId === line.sourceId);
  return undefined;
}

// ---------- changes ----------

const mapOption = (q: EditorQuote, optionId: string, f: (o: EditorOption) => EditorOption): EditorQuote => ({
  ...q,
  options: q.options.map((o) => (o.id === optionId ? f(o) : o)),
});

const mapLine = (q: EditorQuote, optionId: string, lineId: string, f: (l: EditorLine) => EditorLine): EditorQuote =>
  mapOption(q, optionId, (o) => ({ ...o, lines: o.lines.map((l) => (l.id === lineId ? f(l) : l)) }));

export function addOption(q: EditorQuote, name = `Option ${q.options.length + 1}`): EditorQuote {
  return { ...q, options: [...q.options, { id: newId("opt"), name, description: "", recommended: false, serviceLevel: "Standard", crew: null, lines: [] }] };
}

/**
 * An option built elsewhere (the editor's + From quick form, 2026-10-31) added at the end, with
 * fresh ids so it never shares a line id with the quote it joins.
 */
export function addBuiltOption(q: EditorQuote, built: { name: string; description: string; lines: EditorLine[] }): EditorQuote {
  const option: EditorOption = { id: newId("opt"), name: built.name, description: built.description, recommended: false, serviceLevel: "Standard", crew: null, lines: built.lines.map((l) => ({ ...l, id: newId("line") })) };
  return { ...q, options: [...q.options, option] };
}

/** A full, independent copy: changing the copy never changes the original (no shared lines). */
export function duplicateOption(q: EditorQuote, optionId: string): EditorQuote {
  const src = q.options.find((o) => o.id === optionId);
  if (!src) return q;
  const copy: EditorOption = {
    ...src,
    id: newId("opt"),
    name: `${src.name} (copy)`,
    recommended: false,
    lines: src.lines.map((l) => ({ ...l, id: newId("line") })),
  };
  const i = q.options.indexOf(src);
  return { ...q, options: [...q.options.slice(0, i + 1), copy, ...q.options.slice(i + 1)] };
}

export function removeOption(q: EditorQuote, optionId: string): EditorQuote {
  return { ...q, options: q.options.filter((o) => o.id !== optionId) };
}

export function updateOption(
  q: EditorQuote,
  optionId: string,
  patch: Partial<Pick<EditorOption, "name" | "description" | "recommended" | "privateLabel" | "scope">> & { part?: Part | null; notOffered?: boolean },
): EditorQuote {
  let next = mapOption(q, optionId, (o) => {
    const { part, notOffered, ...rest } = patch;
    const out: EditorOption = { ...o, ...rest };
    // Absent, not null or false, when unset: an option saved before these existed keeps its fingerprint.
    if (part !== undefined) {
      if (part) out.part = part;
      else delete out.part;
    }
    if (notOffered !== undefined) {
      if (notOffered) out.notOffered = true;
      else delete out.notOffered;
    }
    return out;
  });
  // One recommended option per Part (2026-10-30; per scope before then): a customer picks one option for each.
  const me = next.options.find((o) => o.id === optionId);
  if (me?.recommended && (patch.recommended || patch.scope !== undefined || patch.part !== undefined)) {
    const key = partKey(me);
    next = { ...next, options: next.options.map((o) => (o.id === optionId || partKey(o) !== key ? o : { ...o, recommended: false })) };
  }
  return next;
}

export function addLine(q: EditorQuote, optionId: string, line: EditorLine): EditorQuote {
  return mapOption(q, optionId, (o) => ({ ...o, lines: [...o.lines, line] }));
}

/** Several lines at once (the stair builder), optionally in place of lines it replaces (a profile's preset line). */
export function addLines(q: EditorQuote, optionId: string, lines: EditorLine[], replacing: string[] = []): EditorQuote {
  const drop = new Set(replacing);
  return mapOption(q, optionId, (o) => ({ ...o, lines: [...o.lines.filter((l) => !drop.has(l.id)), ...lines] }));
}

export function updateLine(q: EditorQuote, optionId: string, lineId: string, patch: Partial<EditorLine>): EditorQuote {
  return mapLine(q, optionId, lineId, (l) => ({ ...l, ...patch }));
}

export function removeLine(q: EditorQuote, optionId: string, lineId: string): EditorQuote {
  return mapOption(q, optionId, (o) => ({ ...o, lines: o.lines.filter((l) => l.id !== lineId) }));
}

/** Switch contractor: the card rate and cost follow the new contractor; any override stays as typed. */
export function setContractor(q: EditorQuote, optionId: string, lineId: string, name: string, entries: CardEntry[]): EditorQuote {
  const level = levelOf(q.options.find((o) => o.id === optionId) ?? {});
  return mapLine(q, optionId, lineId, (l) => {
    const e = entryFor(l, entries);
    if (!e || e.kind !== "rate") return l;
    const c = e.contractors.find((x) => x.name === name);
    if (!c) return l;
    // The material stays when the new contractor's row offers it; otherwise it is that row's default.
    return snapLine(l, e, c, l.materialId, level);
  });
}

/**
 * Change an option's service level. Every labour line priced from the card is re-priced from the
 * card at the new level (same contractor, cost unchanged). A typed price (override) stays as typed.
 * A line whose card row no longer exists can't be re-priced from the card; it is left as it was and
 * returned in `notRepriced` so the screen can say so.
 */
export function setServiceLevel(
  q: EditorQuote,
  optionId: string,
  level: ServiceLevel,
  entries: CardEntry[],
): { quote: EditorQuote; notRepriced: EditorLine[] } {
  const notRepriced: EditorLine[] = [];
  const repriced = mapOption(q, optionId, (o) => ({
    ...o,
    serviceLevel: level,
    lines: o.lines.map((l) => {
      if (!levelApplies(l)) return l;
      const e = entryFor(l, entries);
      if (e?.kind === "stair") return { ...l, unitPriceSnap: levelPrice(e.rate, level, true) };
      const c = e?.kind === "rate" ? e.contractors.find((x) => x.name === l.contractor) : undefined;
      // A material no longer offered can't be priced from the card either.
      const gone = !c || !e || e.kind !== "rate" || (!!l.materialId && !c.material?.choices.some((m) => m.id === l.materialId));
      if (gone) {
        notRepriced.push(l);
        return l;
      }
      return { ...l, unitPriceSnap: rateSnap(e, c, l.materialId, level).price };
    }),
  }));
  // An accepted price is the master (Albert, 2026-11-04): the slider moves the list price, the price stays.
  return { quote: keepAccepted(q, optionId, settleContractor(repriced)), notRepriced };
}

// ---------- crew ----------
//
// Crew per option (Albert, 2026-10-16): pick one contractor for the whole option and every line
// they have a Rate Card row for moves to them; any single line can still be set by hand. The
// crew sets our cost; the customer's price comes from the card at the option's service level.
//
// A crew is a contractor offered as a choice somewhere on the card (an entry with two or more
// contractors). Work only one contractor is listed for (shared rows) is never changed by picking
// a crew. Nothing here names a contractor: one added to the Rate Card shows up as a crew by itself.

export type Crew = { name: string; covers: number };

/** Every crew on the card, the one covering the most work first. */
export function crewsOf(entries: CardEntry[]): Crew[] {
  const covers = new Map<string, number>();
  for (const e of entries)
    if (e.kind === "rate" && e.contractors.length > 1) for (const c of e.contractors) covers.set(c.name, (covers.get(c.name) ?? 0) + 1);
  return [...covers].map(([name, n]) => ({ name, covers: n })).sort((a, b) => b.covers - a.covers || a.name.localeCompare(b.name));
}

/**
 * How a line stands against its option's crew:
 * `crew` it is with the crew · `hand` the crew could do it but someone picked another contractor ·
 * `cannot` there is a choice of contractor but the crew has no rate for it (or its card row is
 * gone) · null no crew picked, not a Rate Card line, or work only one contractor does.
 */
export type CrewState = "crew" | "hand" | "cannot" | null;

export function crewState(l: EditorLine, crew: string | null | undefined, entries: CardEntry[]): CrewState {
  if (!crew || l.sourceKind !== "rate") return null;
  const e = entryFor(l, entries);
  if (!e) return "cannot";
  if (e.kind !== "rate") return null;
  if (!e.contractors.some((c) => c.name === crew)) return e.contractors.length > 1 ? "cannot" : null;
  return l.contractor === crew ? "crew" : "hand";
}

/**
 * Pick (or clear) an option's crew. Lines the new crew has a card row for move to it, with the
 * card's rate and cost for that crew. Kept as they are, and returned so the screen can say so:
 * lines set to someone else by hand under the old crew (`kept`), and lines the new crew has no
 * rate for (`cannot`). Typed prices and costs (overrides) are never changed. Clearing the crew
 * leaves every line with whoever it has.
 */
export function setCrew(
  q: EditorQuote,
  optionId: string,
  crew: string | null,
  entries: CardEntry[],
): { quote: EditorQuote; kept: EditorLine[]; cannot: EditorLine[] } {
  const kept: EditorLine[] = [];
  const cannot: EditorLine[] = [];
  const quote = mapOption(q, optionId, (o) => {
    const level = levelOf(o);
    if (!crew) return { ...o, crew: null };
    return {
      ...o,
      crew,
      lines: o.lines.map((l) => {
        if (l.sourceKind !== "rate") return l;
        if (crewState(l, o.crew, entries) === "hand") {
          // Set by hand to someone else under the old crew: it stays. Already the new crew: nothing to say.
          if (l.contractor !== crew) kept.push(l);
          return l;
        }
        const e = entryFor(l, entries);
        if (!e || e.kind !== "rate") {
          cannot.push(l);
          return l;
        }
        const c = e.contractors.find((x) => x.name === crew);
        if (!c) {
          if (e.contractors.length > 1) cannot.push(l);
          return l;
        }
        return snapLine(l, e, c, l.materialId, level);
      }),
    };
  });
  return { quote, kept, cannot };
}

export type CrewCompare = Crew & { cost: number; profit: number; marginPct: number | null; cannot: number };

/**
 * What the option would cost with each crew, keeping the lines set by hand. For the crew picker:
 * the price only moves where the card itself prices the crews differently.
 */
export function compareCrews(q: EditorQuote, optionId: string, entries: CardEntry[]): CrewCompare[] {
  return crewsOf(entries).map((crew) => {
    const r = setCrew(q, optionId, crew.name, entries);
    const o = r.quote.options.find((x) => x.id === optionId);
    const t = optionTotals(o?.lines ?? [], q.discountRate, optionHst(q, o));
    return { ...crew, cost: t.cost, profit: t.profit, marginPct: t.marginPct, cannot: r.cannot.length };
  });
}

/** "Back to the card": clear both overrides so the line uses the card rate and cost again. */
export function revertLine(q: EditorQuote, optionId: string, lineId: string): EditorQuote {
  return updateLine(q, optionId, lineId, { unitPrice: null, costOverride: null });
}

export function setTerms(q: EditorQuote, patch: Partial<Pick<EditorQuote, "discountRate" | "showHst" | "discountReason" | "itemised">>): EditorQuote {
  return { ...q, ...patch };
}

/**
 * Charge HST on one option only (Albert, 2026-11-04: "ONLY apply for the option it is on. Not to all options"). The
 * other options keep theirs; one never set follows the version's Show HST, as before.
 */
export function setOptionHst(q: EditorQuote, optionId: string, on: boolean): EditorQuote {
  return { ...q, options: q.options.map((o) => (o.id === optionId ? { ...o, showHst: on } : o)) };
}

/**
 * Charge HST on every option at once, or on none (Albert, 2026-11-04: "a button that can turn all options on or off",
 * behind a confirmation). Each option is set explicitly, and the version's Show HST follows, so an option added
 * afterwards starts the same way.
 */
export function setAllHst(q: EditorQuote, on: boolean): EditorQuote {
  return { ...q, showHst: on, options: q.options.map((o) => ({ ...o, showHst: on })) };
}

/** The payment schedule (2026-10-27): null puts the version back on 35 / 35 / balance. Checked by scheduleProblems() before a save. */
export function setSchedule(q: EditorQuote, schedule: PaymentSchedule | null): EditorQuote {
  return { ...q, schedule };
}

/**
 * The private line the accepted price adds when it is above the list price (2026-10-22). Known by
 * its words: rename it and it is an ordinary private line the accepted price no longer touches.
 * Defined in src/lib/pricing/discounts.ts since 2026-11-04; re-exported for the screens.
 */
export { PRICE_ADJUSTMENT };

const adjustmentOf = (o: EditorOption) => o.lines.find((l) => isAdjustmentLine(l));
const acceptedLineOf = (o: EditorOption) => o.lines.find((l) => isAcceptedLine(l));

/** An option's price before the accepted price touches it (discount items in), and its two accepted-price lines. */
function listPriceOf(q: EditorQuote, o: EditorOption): { base: number; adj: EditorLine | undefined; acc: EditorLine | undefined } {
  const adj = adjustmentOf(o);
  const acc = acceptedLineOf(o);
  const rest = o.lines.filter((l) => l !== adj && l !== acc);
  return { base: round2(optionTotals(rest, 0, optionHst(q, o)).preDiscount), adj, acc };
}

/**
 * The accepted price's discount line on one option: `amount` off, the reason kept from the line it replaces.
 * A price typed at the price as it stands keeps the line at $0, so it is still pinned (2026-11-04: the
 * accepted price is held, below); only Reset takes it off.
 */
function putAccepted(q: EditorQuote, optionId: string, acc: EditorLine | undefined, amount: number, reason?: string): EditorQuote {
  const off = amount > 0 ? round2(amount) : 0;
  const patch = { uom: "flat", qty: 1, unitPrice: off > 0 ? -off : 0, include: true, costOverride: null, manualCost: null, ...(reason !== undefined ? { clientNote: reason } : {}) };
  return acc ? updateLine(q, optionId, acc.id, patch) : addLine(q, optionId, { ...discountLine(ACCEPTED_LINE, off), ...patch });
}

/**
 * A version saved before 2026-11-04 may carry one Discount Rate that every option follows. The first time
 * an accepted price is set or reset, that rate is handed to each option as its own accepted price discount
 * (the same dollars, so no price moves), with the version's reason, and the rate and reason are cleared.
 * From then on each option's accepted price is its own.
 */
export function detachVersionDiscount(q: EditorQuote): EditorQuote {
  if (!q.discountRate) return q;
  const reason = q.discountReason ?? "";
  let next: EditorQuote = { ...q, discountRate: 0, discountReason: null };
  for (const o of q.options) {
    const off = -optionTotals(o.lines, q.discountRate, optionHst(q, o)).discount;
    if (!(off > 0)) continue;
    const { acc } = listPriceOf(q, o);
    next = putAccepted(next, o.id, acc, round2(off + (acc ? -(lineTotal(acc) ?? 0) : 0)), reason);
  }
  return next;
}

/**
 * The highest accepted price an option takes (2026-11-04): what the slider and the discount items make,
 * with no accepted-price discount. Null when nothing is priced.
 */
export function priceCeiling(q: EditorQuote, optionId: string): number | null {
  const o = q.options.find((x) => x.id === optionId);
  if (!o) return null;
  const { base } = listPriceOf(q, o);
  return base > 0 ? base : null;
}

/**
 * "They accept this price" (Albert, 2026-10-22): land this option's price before HST on the amount
 * the customer agreed to. **This option only (Albert, 2026-11-04: "it should only apply to the selected
 * option and not carry over to the other items. Same as the discount section").** The difference is this
 * option's "Accepted price discount", a dollar line in its Discounts section like a discount item, updated
 * in place and removed when the price typed is the price as it stands. No other option moves (an old
 * version rate is first handed to each, `detachVersionDiscount()`). An option with nothing priced changes
 * nothing.
 *
 * **Never above that price (Albert, 2026-11-04: "lets block it. This means any pricing increases
 * should be added in as private line items; or increased rates. The goal is to have less change for
 * mistakes").** A price above `priceCeiling()` changes nothing; the card says how to charge more. The
 * 2026-10-22 above-list "Accepted price adjustment" line is no longer made; one on an older quote is
 * taken off by any accepted price typed now, and by Reset.
 */
export function setAcceptedPrice(q: EditorQuote, optionId: string, acceptedPreTax: number | null): EditorQuote {
  if (!q.options.some((x) => x.id === optionId) || acceptedPreTax === null || !(acceptedPreTax >= 0)) return q;
  const price = round2(acceptedPreTax);
  const ceiling = priceCeiling(q, optionId);
  if (ceiling === null || price > ceiling) return q;
  const q0 = detachVersionDiscount(q);
  const o = q0.options.find((x) => x.id === optionId)!;
  const { base, adj, acc } = listPriceOf(q0, o);
  return putAccepted(adj ? removeLine(q0, optionId, adj.id) : q0, optionId, acc, round2(base - price));
}

/** Whether an accepted price is set on this option: its discount line, an older above-list line, or an old version rate. */
export const acceptedIsSet = (q: EditorQuote, o: EditorOption) => q.discountRate !== 0 || !!adjustmentOf(o) || !!acceptedLineOf(o);

/** The reason the customer sees beside this option's accepted price discount, kept on that line. */
export const acceptedReason = (o: EditorOption) => acceptedLineOf(o)?.clientNote ?? "";

/** Set the reason on this option's accepted price discount; nothing when it has none. */
export function setAcceptedReason(q: EditorQuote, optionId: string, reason: string): EditorQuote {
  const o = q.options.find((x) => x.id === optionId);
  const acc = o ? acceptedLineOf(o) : undefined;
  return acc ? updateLine(q, optionId, acc.id, { clientNote: reason.trim() }) : q;
}

/**
 * Reset (Albert, 2026-11-04: "Pressing reset should clear all 3 out"): back to the price the slider and
 * the discount items make, on this option only: its accepted price discount and adjustment line come off.
 * Other options keep theirs (an old version rate is first handed to each). The discount items stay.
 */
export function resetAccepted(q: EditorQuote, optionId: string): EditorQuote {
  const q0 = detachVersionDiscount(q);
  const o = q0.options.find((x) => x.id === optionId);
  if (!o) return q0;
  return o.lines.filter((l) => isAdjustmentLine(l) || isAcceptedLine(l)).reduce((acc, l) => removeLine(acc, optionId, l.id), q0);
}

/**
 * The accepted price stays where it was across a change to the slider or the discount items
 * (Albert, 2026-11-04: "Accepted price is the master value that overrides the discount % adjustment,
 * the contractor/standard/premium slider"). With no accepted price set, `next` is returned as it is.
 * When holding it would need a markup, `next` is returned as it is too, and the editor's
 * `holdAccepted()` refuses the change.
 */
function keepAccepted(before: EditorQuote, optionId: string, next: EditorQuote): EditorQuote {
  const o = before.options.find((x) => x.id === optionId);
  if (!o || !acceptedIsSet(before, o)) return next;
  const target = optionTotals(o.lines, before.discountRate, optionHst(before, o)).subtotal;
  const ceiling = priceCeiling(next, optionId);
  if (ceiling === null || target > ceiling) return next;
  return setAcceptedPrice(next, optionId, target);
}

/** What the accepted price itself is on an option: its lines and any old version rate. A change here is the accepted price being set. */
function acceptedSig(q: EditorQuote, o: EditorOption): string {
  const one = (l: EditorLine | undefined) => (l ? [l.unitPrice, l.include, l.qty] : null);
  return JSON.stringify([q.discountRate, one(acceptedLineOf(o)), one(adjustmentOf(o))]);
}

export type HoldRefusal = { optionId: string; name: string; price: number };

/**
 * **The accepted price is held, firmly (Albert, 2026-11-04: "Keep this a firm rule. When the accepted price
 * is edited. no other pricing adjustments like discounts can move that accepted price number. Meaning the
 * margins and discount % can change there. But the value doesnt change").** Run by the editor on every
 * change: for each option whose accepted price is set and was not itself just set, reset or cleared, the
 * price before HST stays exactly where it was; the option's accepted price discount takes up whatever else
 * moved (discount items, the slider, the Contractor level, lines), so the margin and the total discount %
 * change and the price does not. A change that could only be held with a markup (the price before the
 * accepted discount would fall under it) is refused: `before` comes back with the option and its price, and
 * nothing changes until Reset.
 */
export function holdAccepted(before: EditorQuote, next: EditorQuote): { quote: EditorQuote; refused: HoldRefusal | null } {
  let q = next;
  for (const o of before.options) {
    if (!acceptedIsSet(before, o)) continue;
    const n = next.options.find((x) => x.id === o.id);
    if (!n || acceptedSig(before, o) !== acceptedSig(next, n)) continue;
    const target = optionTotals(o.lines, before.discountRate, optionHst(before, o)).subtotal;
    const cur = q.options.find((x) => x.id === o.id)!;
    if (optionTotals(cur.lines, q.discountRate, optionHst(q, cur)).subtotal === target) continue;
    const ceiling = priceCeiling(q, o.id);
    if (ceiling === null || target > ceiling) return { quote: before, refused: { optionId: o.id, name: o.name, price: target } };
    q = setAcceptedPrice(q, o.id, target);
  }
  return { quote: q, refused: null };
}

/** The accepted price from a total discount percent: everything off the list price, discount items included. */
export function setTotalDiscount(q: EditorQuote, optionId: string, pct: number | null): EditorQuote {
  const o = q.options.find((x) => x.id === optionId);
  if (!o || pct === null) return q;
  const price = priceAtTotalDiscount(grossOf(o.lines), pct);
  return price === null ? q : setAcceptedPrice(q, optionId, Math.max(0, price));
}

/** The accepted price from a margin percent on the option's cost. */
export function setMarginTarget(q: EditorQuote, optionId: string, pct: number | null): EditorQuote {
  const o = q.options.find((x) => x.id === optionId);
  if (!o || pct === null) return q;
  const price = priceAtMargin(optionTotals(o.lines, 0, optionHst(q, o)).cost, pct);
  return price === null ? q : setAcceptedPrice(q, optionId, Math.max(0, price));
}

// ---------- discount items (2026-11-04) ----------
//
// Albert: "another discount section on the left side of the accepted price card; there is a place to
// put multiple discount items. This is separate from the reset and is persistent until removed." Each
// is a line in the Discounts section priced below zero (one, flat), so calc.ts and Airtable count it
// like any other line. The accepted price keeps them where they are and moves its own adjustment.

/** A discount item's line: `amount` is what comes off, in dollars. */
export function discountLine(label: string, amount: number): EditorLine {
  return { ...manualLine(DISCOUNTS_SECTION, label), uom: "flat", qty: 1, unitPrice: -Math.abs(round2(amount)), costOverride: null, manualCost: null };
}

/**
 * What someone typed as a discount item: dollars only (Albert, 2026-11-04: "please only allow for
 * dollar discounts in the discounts tab"; "discounts are dollar line values only. not % by the way"),
 * "250" or "$250". A percent, or anything that isn't a positive amount, is null.
 */
export function discountAmountFrom(text: string): number | null {
  const t = text.trim();
  if (t.includes("%")) return null;
  const n = parseNum(t);
  return n !== null && n > 0 ? round2(n) : null;
}

export function addDiscount(q: EditorQuote, optionId: string, label: string, amount: number): EditorQuote {
  if (!(amount > 0)) return q;
  return keepAccepted(q, optionId, settleContractor(addLine(q, optionId, discountLine(label.trim() || "Discount", amount))));
}

export function updateDiscount(q: EditorQuote, optionId: string, lineId: string, patch: { label?: string; amount?: number }): EditorQuote {
  const next = mapLine(q, optionId, lineId, (l) =>
    !isDiscountLine(l) || isContractorLine(l) || isAcceptedLine(l)
      ? l
      : { ...l, ...(patch.label !== undefined ? { description: patch.label.trim() || "Discount" } : {}), ...(patch.amount !== undefined && patch.amount > 0 ? { unitPrice: -round2(patch.amount) } : {}) },
  );
  return keepAccepted(q, optionId, settleContractor(next));
}

export function removeDiscount(q: EditorQuote, optionId: string, lineId: string): EditorQuote {
  const o = q.options.find((x) => x.id === optionId);
  const l = o?.lines.find((x) => x.id === lineId);
  if (!l || !isDiscountLine(l) || isContractorLine(l) || isAcceptedLine(l)) return q;
  return keepAccepted(q, optionId, settleContractor(removeLine(q, optionId, lineId)));
}

/**
 * Keep every option's Contractor discount in step (2026-11-04): on a Contractor option one line,
 * "Contractor pricing (10% off)", is 10% of the list price as it stands; on any other level there is
 * none. Run after every change (the editor's apply), so the 10% follows the lines. Returns the same
 * quote when nothing moved.
 */
export function settleContractor(q: EditorQuote): EditorQuote {
  let changed = false;
  const options = q.options.map((o) => {
    const mine = o.lines.filter((l) => isContractorLine(l));
    if (levelOf(o) !== "Contractor") {
      if (!mine.length) return o;
      changed = true;
      return { ...o, lines: o.lines.filter((l) => !isContractorLine(l)) };
    }
    const amount = contractorAmount(grossOf(o.lines));
    const [first, ...extra] = mine;
    if (first && !extra.length && first.unitPrice === -amount && first.include && first.qty === 1) return o;
    changed = true;
    const others = o.lines.filter((l) => !isContractorLine(l));
    if (!(amount > 0)) return { ...o, lines: others };
    const line = first ? { ...first, qty: 1, include: true, uom: "flat", unitPrice: -amount } : discountLine(CONTRACTOR_LINE, amount);
    return { ...o, lines: [...others, line] };
  });
  return changed ? { ...q, options } : q;
}

/** A discount typed in dollars on an option (2026-10-22): the same as accepting the list price less that amount. */
export function setDiscountAmount(q: EditorQuote, optionId: string, amount: number | null): EditorQuote {
  const o = q.options.find((x) => x.id === optionId);
  if (!o || amount === null || !(amount >= 0)) return q;
  const { base } = listPriceOf(q, o);
  return setAcceptedPrice(q, optionId, Math.max(0, round2(base - amount)));
}

/**
 * A restored draft keeps its lines and terms but always shows the customer and site as they
 * are now, so a draft saved last week can never show (or later save) an old address.
 */
export function withCustomerFrom(draft: EditorQuote, current: EditorQuote): EditorQuote {
  const { customerName, siteAddress, siteCity, ghlContactId, ghlOpportunityId, addressStatus, projectNumber, notionProjectUrl } = current;
  return { ...draft, customerName, siteAddress, siteCity, ghlContactId, ghlOpportunityId, addressStatus, projectNumber, notionProjectUrl };
}

// ---------- starting points ----------

export function blankQuote(): EditorQuote {
  return addOption(
    { quoteRecordId: null, customerName: "", siteAddress: "", siteCity: "", ghlContactId: null, ghlOpportunityId: null, addressStatus: null, projectNumber: null, notionProjectUrl: null, discountRate: 0, showHst: true, options: [] },
    "Option 1",
  );
}

/**
 * Where the editor keeps a quote's unsaved draft on this device. Keyed by the editor quote's own
 * `quoteRecordId` (which holds the version's record id). Anything that hands the editor a draft (the
 * Site sheet's Build stair options) must use this, never build the key itself: on 2026-10-28 it keyed by
 * the Quotes record instead, and the editor opened without the new options.
 */
export const draftKey = (q: Pick<EditorQuote, "quoteRecordId">) => `titan-quote-draft:${q.quoteRecordId ?? "new"}`;

// ---------- autosave (Albert, 2026-11-05) ----------

/**
 * The quote with its option and line ids put through `ids` (an id not in it stays as it is). An
 * autosave hands back the record each new line and option became; the editor keeps its own ids
 * on screen, so rows never remount mid-edit, and this turns them into Airtable's before anything
 * is saved, compared or kept on the device.
 */
export function renameIds(q: EditorQuote, ids: Readonly<Record<string, string>>): EditorQuote {
  if (Object.keys(ids).length === 0) return q;
  return { ...q, options: q.options.map((o) => ({ ...o, id: ids[o.id] ?? o.id, lines: o.lines.map((l) => (ids[l.id] ? { ...l, id: ids[l.id] } : l)) })) };
}

/** `ids` the other way round: Airtable's record back to the editor's own id. */
export function invertIds(ids: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(ids).map(([mine, rec]) => [rec, mine]));
}

/**
 * The quote with every option and line id used once (the same quote when they already are). Two
 * lines sharing an id would both be renamed to one record after an autosave, and every save after
 * would make a line and detach another; a second use gets a new id instead.
 */
export function distinctIds(q: EditorQuote): EditorQuote {
  const seen = new Set<string>();
  let renamed = false;
  const own = (id: string, prefix: "opt" | "line") => {
    if (!seen.has(id)) {
      seen.add(id);
      return id;
    }
    renamed = true;
    const next = newId(prefix);
    seen.add(next);
    return next;
  };
  const options = q.options.map((o) => {
    const id = own(o.id, "opt");
    const lines = o.lines.map((l) => {
      const lid = own(l.id, "line");
      return lid === l.id ? l : { ...l, id: lid };
    });
    return id === o.id && lines.every((l, i) => l === o.lines[i]) ? o : { ...o, id, lines };
  });
  return renamed ? { ...q, options } : q;
}

/**
 * Whether this device holds unsaved changes for a version, read from what is stored under its
 * `draftKey`: when they were kept, "unknown" when the draft has no time, null when there are none.
 * Sending is held while there are (Albert, 2026-11-05: "grey out the send button if there is an
 * outstanding unsaved version"). Something the editor itself could not read is no draft, as the
 * editor treats it.
 */
export function unsavedDraftAt(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as { savedAt?: unknown; quote?: unknown } | null;
    if (!d || typeof d !== "object" || !d.quote || typeof d.quote !== "object") return null;
    return typeof d.savedAt === "string" && d.savedAt ? d.savedAt : "unknown";
  } catch {
    return null;
  }
}

export function fromQuote(quote: Quote): EditorQuote {
  return {
    quoteRecordId: quote.id,
    customerName: quote.customerName ?? "",
    siteAddress: quote.siteAddress ?? "",
    siteCity: quote.siteCity ?? "",
    ghlContactId: quote.link?.ghlContactId ?? null,
    ghlOpportunityId: quote.link?.ghlOpportunityId ?? null,
    addressStatus: quote.link?.addressStatus ?? null,
    projectNumber: quote.link?.projectNumber ?? null,
    notionProjectUrl: quote.link?.notionProjectUrl ?? null,
    discountRate: quote.discountRate,
    showHst: quote.showHst,
    discountReason: quote.discountReason ?? null,
    itemised: quote.itemised ?? false,
    schedule: quote.schedule ?? null,
    options: quote.options.map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description ?? "",
      recommended: o.recommended,
      serviceLevel: levelOf(o),
      crew: o.crew,
      privateLabel: o.privateLabel ?? null,
      scope: o.scope ?? null,
      ...(o.part ? { part: o.part } : {}),
      ...(o.notOffered ? { notOffered: true as const } : {}),
      ...(o.showHst !== undefined ? { showHst: o.showHst } : {}),
      lines: o.lines.map((l: QuoteLine): EditorLine => ({
        id: l.id,
        sourceKind: l.sourceKind,
        sourceId: l.sourceId,
        labourType: l.labourType,
        spec: l.spec,
        description: l.description ?? "",
        contractor: l.contractor,
        materialId: l.materialId ?? null,
        stairCategory: l.stairCategory ?? null,
        area: l.area ?? "",
        uom: l.uom,
        clientNote: l.clientNote ?? "",
        lineType: l.lineType,
        section: l.section,
        include: l.include,
        qty: l.qty,
        waste: l.waste,
        unitPrice: l.unitPrice,
        unitPriceSnap: l.unitPriceSnap,
        unitCostSnap: l.unitCostSnap,
        costOverride: l.costOverride,
        manualCost: l.manualCost,
        minChargeSnap: l.minChargeSnap,
        noHst: l.noHst ?? false,
        hasSource: l.hasSource,
      })),
    })),
  };
}

/** Parse what someone typed into a number cell: blank means "no value" (use the card), not zero. */
export function parseNum(text: string): number | null {
  const t = text.replace(/[$,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
