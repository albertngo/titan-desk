import { optionTotals, round2 } from "@/lib/calc";
import { LINE_TYPE, type EditorLine } from "@/lib/editor/model";
import { isStairMethod, isStairType, STAIR_ROWS, stairProfileLine, type StairWork } from "./stairs";

/**
 * The quick form (Albert, 2026-10-15): staff pick the work from short lists and type square
 * footage, and it becomes the preliminary, non-measured v1. Pure, no I/O: load.ts reads the
 * Quick Quote Choices table and the prices behind it; start.ts creates the quote. The server
 * prices from Airtable at create time; what the browser sends is only which choice and how much.
 */

export const QUICK_GROUPS = ["Remove", "Disposal", "Subfloor prep", "Install", "Baseboards", "Material"] as const;
export type QuickGroup = (typeof QUICK_GROUPS)[number];

/** Where each group's lines land on the quote (the editor's sections). */
export const GROUP_SECTION: Record<QuickGroup, string> = {
  Remove: "Removal",
  Disposal: "Disposal",
  "Subfloor prep": "Prep",
  Install: "Install",
  Baseboards: "Install",
  Material: "Materials",
};

/** How many rows of each group the form offers (the GHL form had the same; mouldings got three on 2026-10-20). */
export const GROUP_ROWS: Record<QuickGroup, number> = { Remove: 3, Disposal: 1, "Subfloor prep": 2, Install: 3, Baseboards: 3, Material: 3 };

/** One priced piece behind a choice: a Rate Card row or a Stair Item. */
export type QuickPart = {
  kind: "rate" | "stair";
  recordId: string;
  labourType: string | null;
  spec: string | null;
  description: string;
  contractor: string | null;
  uom: string | null;
  rate: number;
  cost: number | null;
  minCharge: number | null;
};

export type QuickProduct = { recordId: string; sku: string; name: string; rate: number; cost: number | null };

export type QuickChoice = {
  id: string;
  group: QuickGroup;
  label: string;
  sort: number;
  /** Flat-priced parts are counted this many times (e.g. 2 bins). */
  times: number;
  parts: QuickPart[];
  /** Material choices: the standard product, or null when its SKU isn't set or found. */
  product: QuickProduct | null;
};

/** A part counts per square or linear foot (or per piece) typed on the form; a flat part counts `times`. */
export const isFlat = (uom: string | null) => uom === "flat";

/** What the amount on a row is measured in, for its label. */
export function amountUnit(c: QuickChoice): "sqft" | "linear ft" | "pieces" | null {
  if (c.group === "Material") return "sqft";
  const u = c.parts.find((p) => !isFlat(p.uom))?.uom ?? null;
  if (u === "sqft") return "sqft";
  if (u === "linear ft") return "linear ft";
  if (u) return "pieces";
  return null;
}

/**
 * What a choice charges, for the rate column beside it (Albert, 2026-10-18): `perUnit` per square
 * or linear foot (or piece) typed on the row, summed over the parts priced that way, and `flat`
 * for the parts counted `times` regardless of amount. A material charges its product's rate.
 */
export function choiceRate(c: QuickChoice, product: QuickProduct | null = null): { perUnit: number | null; flat: number } {
  if (c.group === "Material") {
    const p = product ?? c.product;
    return { perUnit: p ? p.rate : null, flat: 0 };
  }
  const perUnitParts = c.parts.filter((p) => !isFlat(p.uom));
  const perUnit = perUnitParts.length ? round2(perUnitParts.reduce((s, p) => s + p.rate, 0)) : null;
  const flat = round2(c.parts.filter((p) => isFlat(p.uom)).reduce((s, p) => s + p.rate * c.times, 0));
  return { perUnit, flat };
}

// ---------- a choice with and without its material (Albert, 2026-10-20) ----------

/**
 * "Baseboard (Mat + Labor)" and "Baseboard (Labor)" are two rows in Quick Quote Choices (each on
 * its own Rate Card row) but one thing to the customer: baseboard, with or without our material.
 * The form shows such a pair as one chip and a "Material included" box. The pairing is by label:
 * the same words before a "(Mat + Labor)" or "(Labor)" ending. A choice with neither ending, or
 * without its partner, is shown on its own under its own label.
 */
export type ChoicePair = { label: string; withMaterial: QuickChoice | null; labourOnly: QuickChoice | null };

const WITH_MATERIAL = /\s*\((?:mat(?:erial)?\s*\+\s*labou?r|labou?r\s*\+\s*mat(?:erial)?)\)\s*$/i;
const LABOUR_ONLY = /\s*\(labou?r(?:\s+only)?\)\s*$/i;

export function pairChoices(options: QuickChoice[]): ChoicePair[] {
  const pairs: ChoicePair[] = [];
  const byBase = new Map<string, ChoicePair>();
  for (const c of options) {
    const full = WITH_MATERIAL.test(c.label);
    const labour = !full && LABOUR_ONLY.test(c.label);
    if (!full && !labour) {
      pairs.push({ label: c.label, withMaterial: c, labourOnly: null });
      continue;
    }
    const base = c.label.replace(full ? WITH_MATERIAL : LABOUR_ONLY, "").trim();
    let p = byBase.get(base.toLowerCase());
    if (!p) {
      p = { label: base, withMaterial: null, labourOnly: null };
      byBase.set(base.toLowerCase(), p);
      pairs.push(p);
    }
    if (full && !p.withMaterial) p.withMaterial = c;
    else if (labour && !p.labourOnly) p.labourOnly = c;
    else pairs.push({ label: c.label, withMaterial: c, labourOnly: null }); // a second of the same kind stands alone
  }
  // A lone half keeps its own words, so "Shoemould" never reads as including material it doesn't.
  return pairs.map((p) => (p.withMaterial && p.labourOnly ? p : { ...p, label: (p.withMaterial ?? p.labourOnly)!.label }));
}

/** Whether a pair offers the Material included box. */
export const pairHasToggle = (p: ChoicePair) => p.withMaterial !== null && p.labourOnly !== null;

/** The choice a pair sends for the box ticked or not (a lone half whichever way). */
export const pairChoice = (p: ChoicePair, material: boolean): QuickChoice => (material ? (p.withMaterial ?? p.labourOnly) : (p.labourOnly ?? p.withMaterial))!;

/** The pair a chosen choice belongs to, if any. */
export const pairOf = (pairs: ChoicePair[], choiceId: string) => pairs.find((p) => p.withMaterial?.id === choiceId || p.labourOnly?.id === choiceId) ?? null;

/**
 * What a pair's labour and material each cost per unit, read off the card: the material is the
 * difference between the two rows. Null when the pair is not a pair, or the rows don't split cleanly.
 */
export function pairRate(p: ChoicePair): { labour: number; material: number } | null {
  if (!p.withMaterial || !p.labourOnly) return null;
  const full = choiceRate(p.withMaterial).perUnit;
  const labour = choiceRate(p.labourOnly).perUnit;
  if (full === null || labour === null || full <= labour) return null;
  return { labour, material: round2(full - labour) };
}

// ---------- linear feet from the flooring (Albert, 2026-10-20) ----------

/** A preliminary's guess at the mouldings: a third of the floor's square footage, in whole linear feet. */
export const BASEBOARD_RATIO = 1 / 3;
export const linearFtFromSqft = (sqft: number) => Math.round(sqft * BASEBOARD_RATIO);

/** A row as the form holds it: the group, the choice and the amount typed (null when none). */
export type FormRow = { group: QuickGroup; choiceId: string; amount: number | null };
export type InstallAreas = { areas: { label: string; sqft: number; linearFt: number }[]; sqft: number; linearFt: number };

/** The Install rows with a square footage, each with the linear feet it suggests, and the lot together. Null when there are none. */
export function installAreas(choices: QuickChoice[], rows: FormRow[]): InstallAreas | null {
  const byId = new Map(choices.map((c) => [c.id, c]));
  const areas = rows.flatMap((r) => {
    const c = byId.get(r.choiceId);
    return c && c.group === "Install" && amountUnit(c) === "sqft" && r.amount !== null ? [{ label: c.label, sqft: r.amount, linearFt: linearFtFromSqft(r.amount) }] : [];
  });
  if (areas.length === 0) return null;
  const sqft = round2(areas.reduce((s, a) => s + a.sqft, 0));
  return { areas, sqft, linearFt: linearFtFromSqft(sqft) };
}

/** Whether a choice's row starts at that guess: a moulding priced per linear foot. */
export const takesLinearDefault = (c: QuickChoice | undefined | null) => Boolean(c && c.group === "Baseboards" && amountUnit(c) === "linear ft");

// ---------- what the browser sends ----------

export type QuickRow = { choiceId: string; amount: number | null; productId: string | null };
/** A custom item (Albert, 2026-10-20): typed words and a flat price, shown to the customer like any line. */
export type CustomItem = { description: string; price: number };
/**
 * `adjustment` (Albert, 2026-10-20): a flat amount in the total the customer never sees as a line,
 * for pricing in what we know and they don't. It becomes a private line (see calc.ts LineInput).
 */
export type QuickWork = { rows: QuickRow[]; stairs: StairWork[]; custom: CustomItem[]; adjustment: number | null; description: string; building: string | null };
export const CUSTOM_ROWS = 6;

export const BUILDINGS = ["House", "Townhouse", "Condo / Apartment", "Commercial"] as const;

const REC = /^rec[A-Za-z0-9]{14}$/;
const amountOf = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1_000_000 ? Math.round(v * 100) / 100 : null);

/** The work part of a New quote request, cleaned. Anything malformed is dropped, never guessed. */
export function parseWork(raw: unknown): QuickWork {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rows = (Array.isArray(r.rows) ? r.rows : []).slice(0, 40).flatMap((x): QuickRow[] => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    if (typeof o.choiceId !== "string" || !REC.test(o.choiceId)) return [];
    const productId = typeof o.productId === "string" && REC.test(o.productId) ? o.productId : null;
    return [{ choiceId: o.choiceId, amount: amountOf(o.amount), productId }];
  });
  // A staircase needs a type, a method and a price; anything else is dropped, never guessed.
  const stairs = (Array.isArray(r.stairs) ? r.stairs : []).slice(0, STAIR_ROWS).flatMap((x): StairWork[] => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const price = amountOf(o.price);
    return isStairType(o.type) && isStairMethod(o.method) && price !== null ? [{ type: o.type, method: o.method, price }] : [];
  });
  // A custom item needs words and a price; anything else is dropped.
  const custom = (Array.isArray(r.custom) ? r.custom : []).slice(0, CUSTOM_ROWS).flatMap((x): CustomItem[] => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const description = typeof o.description === "string" ? o.description.trim().slice(0, 200) : "";
    const price = amountOf(o.price);
    return description && price !== null ? [{ description, price }] : [];
  });
  const building = typeof r.building === "string" && (BUILDINGS as readonly string[]).includes(r.building) ? r.building : null;
  return { rows, stairs, custom, adjustment: amountOf(r.adjustment), description: typeof r.description === "string" ? r.description.trim().slice(0, 2000) : "", building };
}

export const workIsEmpty = (w: QuickWork) => w.rows.length === 0 && w.stairs.length === 0 && w.custom.length === 0 && w.adjustment === null;

// ---------- the lines it becomes ----------

let seq = 0;
const lineId = () => `line_quick_${++seq}`;

function blank(section: string): Omit<EditorLine, "description" | "sourceKind"> {
  return {
    id: lineId(),
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

export type BuildResult = { lines: EditorLine[]; skipped: string[] };

/**
 * The preliminary's lines. A row needs an amount unless every part is flat; a material row needs a
 * product (its chosen one, else the standard one). Rows that can't be priced are skipped and named.
 * Each staircase becomes one flat Stairs line at the typed price.
 */
export function buildPreliminary(choices: QuickChoice[], work: QuickWork, products: Map<string, QuickProduct>): BuildResult {
  const byId = new Map(choices.map((c) => [c.id, c]));
  const lines: EditorLine[] = [];
  const skipped: string[] = [];
  for (const row of work.rows) {
    const c = byId.get(row.choiceId);
    if (!c) {
      skipped.push("a choice that's no longer on the form");
      continue;
    }
    const section = GROUP_SECTION[c.group];
    if (c.group === "Material") {
      const p = (row.productId ? products.get(row.productId) : null) ?? c.product;
      if (!p || row.amount === null) {
        skipped.push(`${c.label} (${!p ? "no product" : "no square footage"})`);
        continue;
      }
      lines.push({
        ...blank(section),
        sourceKind: "product",
        sourceId: p.recordId,
        description: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
        uom: "sqft",
        qty: row.amount,
        unitPriceSnap: p.rate,
        unitCostSnap: p.cost,
        hasSource: true,
      });
      continue;
    }
    const needsAmount = c.parts.some((p) => !isFlat(p.uom));
    if (c.parts.length === 0 || (needsAmount && row.amount === null)) {
      skipped.push(`${c.label} (${c.parts.length === 0 ? "nothing to price it from" : "no amount"})`);
      continue;
    }
    for (const p of c.parts) {
      lines.push({
        ...blank(section),
        sourceKind: p.kind,
        sourceId: p.recordId,
        labourType: p.labourType,
        spec: p.spec,
        description: p.description,
        contractor: p.contractor,
        uom: p.kind === "stair" ? "piece" : p.uom,
        qty: isFlat(p.uom) ? c.times : row.amount,
        unitPriceSnap: p.rate,
        unitCostSnap: p.cost,
        minChargeSnap: p.minCharge,
        hasSource: true,
      });
    }
  }
  for (const s of work.stairs) lines.push(stairProfileLine(s.type, s.method, s.price));
  for (const c of work.custom) lines.push({ ...blank("Other"), sourceKind: "manual", description: c.description, uom: "flat", qty: 1, unitPrice: c.price });
  if (work.adjustment !== null) {
    lines.push({ ...blank("Other"), sourceKind: "manual", description: "Private adjustment", uom: "flat", qty: 1, unitPrice: work.adjustment, private: true });
  }
  return { lines, skipped };
}

/**
 * One row's total for the column beside it, priced the same way the quote will be (so minimum
 * charges count), before discount and HST. Null when the row can't be priced yet.
 */
export function rowTotal(choices: QuickChoice[], row: QuickRow, products: Map<string, QuickProduct>): number | null {
  const { lines } = buildPreliminary(choices, { rows: [row], stairs: [], custom: [], adjustment: null, description: "", building: null }, products);
  return lines.length === 0 ? null : optionTotals(lines, 0, false).preDiscount;
}
