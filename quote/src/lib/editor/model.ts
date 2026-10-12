/**
 * The editor's data and every change it can make, as pure functions. No React, no I/O:
 * the screen calls these, and tests/editor.test.ts proves them. Money is still computed
 * only by src/lib/calc.ts, from the same LineInput fields Airtable stores.
 */
import { SECTIONS, type LineInput } from "@/lib/calc";
import type { Quote, QuoteLine, RateRow, StairRow } from "@/lib/quotes/types";

export type Section = (typeof SECTIONS)[number] | "Unsorted";

export type EditorLine = LineInput & {
  id: string;
  sourceKind: "rate" | "stair" | "product" | "manual";
  sourceId: string | null;
  labourType: string | null;
  spec: string | null;
  description: string;
  contractor: string | null;
  area: string;
  uom: string | null;
  clientNote: string;
};

export type EditorOption = { id: string; name: string; description: string; recommended: boolean; lines: EditorLine[] };

export type EditorQuote = {
  /** Airtable record id of the quote being edited; null for a new quote. */
  quoteRecordId: string | null;
  customerName: string;
  siteAddress: string;
  siteCity: string;
  discountRate: number;
  showHst: boolean;
  options: EditorOption[];
};

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
      contractors: { name: string; rate: number; cost: number; recordId: string }[];
    }
  | { kind: "stair"; key: string; name: string; size: string | null; category: string | null; rate: number; cost: number | null; recordId: string };

/** Which Rate Card labour types belong under each section, best match first. */
export const SECTION_LABOUR: Record<string, string[]> = {
  Install: ["Install", "Refinish", "Sand", "Paint"],
  Removal: ["Remove"],
  Disposal: ["Disposal"],
  Prep: ["Install"],
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

export function buildCatalogue(rates: RateRow[], stairs: StairRow[]): CardEntry[] {
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
    e.contractors.push({ name: r.contractor, rate: r.rate, cost: r.cost, recordId: r.id });
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

/** Picker search: every word must appear; entries that belong to the section rank first. */
export function searchCatalogue(entries: CardEntry[], query: string, section: string, limit = 40): CardEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const preferred = SECTION_LABOUR[section] ?? [];
  const belongs = (e: CardEntry) => (e.kind === "stair" ? section === "Stairs" : preferred.includes(e.labourType));
  const rank = (e: CardEntry) => (belongs(e) ? 0 : 1);
  return entries
    .filter((e) => {
      const hay = entryLabel(e).toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => rank(a) - rank(b) || entryLabel(a).localeCompare(entryLabel(b)))
    .slice(0, limit);
}

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

export function lineFromEntry(entry: CardEntry, section: string, contractorName?: string): EditorLine {
  if (entry.kind === "stair") {
    return {
      ...baseLine(section),
      sourceKind: "stair",
      sourceId: entry.recordId,
      description: entryLabel(entry),
      uom: "piece",
      unitPriceSnap: entry.rate,
      unitCostSnap: entry.cost,
      hasSource: true,
    };
  }
  const c = entry.contractors.find((x) => x.name === contractorName) ?? bestContractor(entry);
  return {
    ...baseLine(section),
    sourceKind: "rate",
    sourceId: c.recordId,
    labourType: entry.labourType,
    spec: entry.spec,
    description: entryLabel(entry),
    contractor: c.name,
    uom: entry.uom,
    waste: entry.defaultWaste,
    unitPriceSnap: c.rate,
    unitCostSnap: c.cost,
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
  return { ...q, options: [...q.options, { id: newId("opt"), name, description: "", recommended: false, lines: [] }] };
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

export function updateOption(q: EditorQuote, optionId: string, patch: Partial<Pick<EditorOption, "name" | "description" | "recommended">>): EditorQuote {
  let next = mapOption(q, optionId, (o) => ({ ...o, ...patch }));
  if (patch.recommended) next = { ...next, options: next.options.map((o) => (o.id === optionId ? o : { ...o, recommended: false })) };
  return next;
}

export function addLine(q: EditorQuote, optionId: string, line: EditorLine): EditorQuote {
  return mapOption(q, optionId, (o) => ({ ...o, lines: [...o.lines, line] }));
}

export function updateLine(q: EditorQuote, optionId: string, lineId: string, patch: Partial<EditorLine>): EditorQuote {
  return mapLine(q, optionId, lineId, (l) => ({ ...l, ...patch }));
}

export function removeLine(q: EditorQuote, optionId: string, lineId: string): EditorQuote {
  return mapOption(q, optionId, (o) => ({ ...o, lines: o.lines.filter((l) => l.id !== lineId) }));
}

/** Switch contractor: the card rate and cost follow the new contractor; any override stays as typed. */
export function setContractor(q: EditorQuote, optionId: string, lineId: string, name: string, entries: CardEntry[]): EditorQuote {
  return mapLine(q, optionId, lineId, (l) => {
    const e = entryFor(l, entries);
    if (!e || e.kind !== "rate") return l;
    const c = e.contractors.find((x) => x.name === name);
    if (!c) return l;
    return { ...l, contractor: c.name, sourceId: c.recordId, unitPriceSnap: c.rate, unitCostSnap: c.cost };
  });
}

/** "Back to the card": clear both overrides so the line uses the card rate and cost again. */
export function revertLine(q: EditorQuote, optionId: string, lineId: string): EditorQuote {
  return updateLine(q, optionId, lineId, { unitPrice: null, costOverride: null });
}

export function setTerms(q: EditorQuote, patch: Partial<Pick<EditorQuote, "discountRate" | "showHst" | "customerName" | "siteAddress" | "siteCity">>): EditorQuote {
  return { ...q, ...patch };
}

// ---------- starting points ----------

export function blankQuote(): EditorQuote {
  return addOption({ quoteRecordId: null, customerName: "", siteAddress: "", siteCity: "", discountRate: 0, showHst: true, options: [] }, "Option 1");
}

export function fromQuote(quote: Quote): EditorQuote {
  return {
    quoteRecordId: quote.id,
    customerName: quote.customerName ?? "",
    siteAddress: quote.siteAddress ?? "",
    siteCity: quote.siteCity ?? "",
    discountRate: quote.discountRate,
    showHst: quote.showHst,
    options: quote.options.map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description ?? "",
      recommended: o.recommended,
      lines: o.lines.map((l: QuoteLine): EditorLine => ({
        id: l.id,
        sourceKind: l.sourceKind,
        sourceId: l.sourceId,
        labourType: l.labourType,
        spec: l.spec,
        description: l.description ?? "",
        contractor: l.contractor,
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
