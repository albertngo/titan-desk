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

/** How many rows of each group the form offers (the GHL form had the same). */
export const GROUP_ROWS: Record<QuickGroup, number> = { Remove: 3, Disposal: 1, "Subfloor prep": 2, Install: 3, Baseboards: 1, Material: 3 };

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

// ---------- what the browser sends ----------

export type QuickRow = { choiceId: string; amount: number | null; productId: string | null };
export type QuickWork = { rows: QuickRow[]; stairs: StairWork[]; extraCost: number | null; description: string; building: string | null };

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
  const building = typeof r.building === "string" && (BUILDINGS as readonly string[]).includes(r.building) ? r.building : null;
  return { rows, stairs, extraCost: amountOf(r.extraCost), description: typeof r.description === "string" ? r.description.trim().slice(0, 2000) : "", building };
}

export const workIsEmpty = (w: QuickWork) => w.rows.length === 0 && w.stairs.length === 0 && w.extraCost === null;

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
  if (work.extraCost !== null) {
    lines.push({ ...blank("Other"), sourceKind: "manual", description: "Additional work", uom: "flat", qty: 1, unitPrice: work.extraCost });
  }
  return { lines, skipped };
}
