/**
 * The editor's data and every change it can make, as pure functions. No React, no I/O:
 * the screen calls these, and tests/editor.test.ts proves them. Money is still computed
 * only by src/lib/calc.ts, from the same LineInput fields Airtable stores.
 */
import { lineTotal, optionTotals, PRIVATE_SECTION, round2, sectionOf, SECTIONS, type LineInput } from "@/lib/calc";
import { impliedRate } from "@/lib/pricing/accepted";
import type { PaymentSchedule } from "@/lib/pricing/schedule";
import { levelApplies, levelOf, levelPrice, type ServiceLevel } from "@/lib/pricing/service";
import { optionScope } from "@/lib/quotes/scope";
import type { MaterialRow, Quote, QuoteLine, RateRow, Scope, StairRow } from "@/lib/quotes/types";

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
  | { kind: "stair"; key: string; name: string; size: string | null; category: string | null; rate: number; cost: number | null; recordId: string };

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
  Exclusions: "Note",
  Stairs: "Stairs",
};

export const UOMS = ["sqft", "linear ft", "each", "piece", "hour", "roll", "flat"] as const;

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
    entries.push({ kind: "stair", key: `stair|${s.id}`, name: s.name, size: s.size, category: s.category, rate: s.rate, cost: s.cost, recordId: s.id });
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

/** A line priced from the card, at the option's service level (Premium adds to labour only). */
export function lineFromEntry(entry: CardEntry, section: string, contractorName?: string, level: ServiceLevel = "Standard"): EditorLine {
  if (entry.kind === "stair") {
    return {
      ...baseLine(section),
      sourceKind: "stair",
      sourceId: entry.recordId,
      stairCategory: entry.category,
      description: entryLabel(entry),
      uom: "piece",
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

export function updateOption(q: EditorQuote, optionId: string, patch: Partial<Pick<EditorOption, "name" | "description" | "recommended" | "privateLabel" | "scope">>): EditorQuote {
  let next = mapOption(q, optionId, (o) => ({ ...o, ...patch }));
  // One recommended option per scope (2026-10-28): a customer picks one flooring and one stairs option.
  const me = next.options.find((o) => o.id === optionId);
  if (me?.recommended && (patch.recommended || patch.scope !== undefined)) {
    const scope = optionScope(me);
    next = { ...next, options: next.options.map((o) => (o.id === optionId || optionScope(o) !== scope ? o : { ...o, recommended: false })) };
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
  const quote = mapOption(q, optionId, (o) => ({
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
  return { quote, notRepriced };
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
    const t = optionTotals(o?.lines ?? [], q.discountRate, q.showHst);
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

/** The payment schedule (2026-10-27): null puts the version back on 35 / 35 / balance. Checked by scheduleProblems() before a save. */
export function setSchedule(q: EditorQuote, schedule: PaymentSchedule | null): EditorQuote {
  return { ...q, schedule };
}

/**
 * The private line the accepted price adds when it is above the list price (2026-10-22). Known by
 * its words: rename it and it is an ordinary private line the accepted price no longer touches.
 */
export const PRICE_ADJUSTMENT = "Accepted price adjustment";

const adjustmentOf = (o: EditorOption) => o.lines.find((l) => l.section === PRIVATE_SECTION && l.sourceKind === "manual" && l.description === PRICE_ADJUSTMENT);

/** An option's list price before any discount and without the accepted-price adjustment, and that adjustment line. */
function listPriceOf(q: EditorQuote, o: EditorOption): { base: number; adj: EditorLine | undefined } {
  const adj = adjustmentOf(o);
  return { base: round2(optionTotals(o.lines, 0, q.showHst).preDiscount - (adj ? (lineTotal(adj) ?? 0) : 0)), adj };
}

/**
 * "They accept this price" (Albert, 2026-10-22): land this option's price before HST on the amount
 * the customer agreed to. Below the list price that is the quote's discount, worked out from this
 * option's list price; the discount is one per version, so every option follows it. Above the list
 * price the difference goes in as a private line, "Accepted price adjustment", which the customer
 * sees as the Private section's one row in Other, and the discount is cleared; the line is updated
 * in place, and removed again when a price at or below the list is typed. An option with nothing
 * priced changes nothing.
 */
export function setAcceptedPrice(q: EditorQuote, optionId: string, acceptedPreTax: number | null): EditorQuote {
  const o = q.options.find((x) => x.id === optionId);
  if (!o || acceptedPreTax === null || !(acceptedPreTax >= 0)) return q;
  const { base, adj } = listPriceOf(q, o);
  if (!(base > 0)) return q;
  if (acceptedPreTax <= base) {
    const without = adj ? removeLine(q, optionId, adj.id) : q;
    return setTerms(without, { discountRate: Math.max(0, impliedRate(base, acceptedPreTax) ?? 0) });
  }
  const extra = round2(acceptedPreTax - base);
  const patch = { uom: "flat", qty: 1, unitPrice: extra, include: true, costOverride: null, manualCost: null };
  const withLine = adj ? updateLine(q, optionId, adj.id, patch) : addLine(q, optionId, { ...manualLine(PRIVATE_SECTION, PRICE_ADJUSTMENT), ...patch });
  return setTerms(withLine, { discountRate: 0 });
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
