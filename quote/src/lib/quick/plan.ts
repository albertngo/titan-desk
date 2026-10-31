import { optionTotals, round2 } from "@/lib/calc";
import { PRIVATE_SECTION } from "@/lib/calc";
import { LINE_TYPE, type EditorLine } from "@/lib/editor/model";
import type { StairProfileRow } from "@/lib/quotes/types";
import { profileLine, STAIR_ROWS } from "./stairs";

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
/** Baseboards went from 1 to 3 rows on 2026-10-22 (Albert): baseboard in one area, shoe only in another. */
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
    if (p) return { perUnit: p.rate, flat: 0 };
    // No product: the Material Rate Card row behind the choice prices it (2026-10-22), below.
  }
  const perUnitParts = c.parts.filter((p) => !isFlat(p.uom));
  const perUnit = perUnitParts.length ? round2(perUnitParts.reduce((s, p) => s + p.rate, 0)) : null;
  const flat = round2(c.parts.filter((p) => isFlat(p.uom)).reduce((s, p) => s + p.rate * c.times, 0));
  return { perUnit, flat };
}

// ---------- what the browser sends ----------

export type QuickRow = { choiceId: string; amount: number | null; productId: string | null };
/** One staircase: which Stair Profiles row, and a different price only when staff typed one. */
export type StairWork = { profileId: string; price: number | null };
export type QuickWork = { rows: QuickRow[]; stairs: StairWork[]; extraCost: number | null; description: string; building: string | null };

/** A Stair Profiles row as the form needs it. The browser gets these with `cost` null. */
export type QuickProfile = Pick<StairProfileRow, "id" | "name" | "type" | "method" | "steps" | "price" | "cost">;

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
  // A staircase is a profile id; a typed price is kept only as an override. Anything else is dropped, never guessed.
  const stairs = (Array.isArray(r.stairs) ? r.stairs : []).slice(0, STAIR_ROWS).flatMap((x): StairWork[] => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return typeof o.profileId === "string" && REC.test(o.profileId) ? [{ profileId: o.profileId, price: amountOf(o.price) }] : [];
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

export type BuildResult = { lines: EditorLine[]; skipped: string[]; name: string; materials: string[] };

/** Install choices that aren't an install: their label already says the work. */
const NOT_INSTALL = /^(sand|refinish|stain|buff|install)\b/i;
const MAX_NAME = 80;

/**
 * The preliminary's option name, from what it installs (Albert, 2026-10-31): the option used to be
 * called "Preliminary", which stayed on the tab (and the customer's heading) after the quote was
 * measured. Built from the Install rows that made it onto the quote, in form order:
 * "Install Hardwood (Nail Down)", "Install Tiles + Laminate / Vinyl / Eng Click". A refinish keeps
 * its own words. No install row: the materials ("Install Engineered (Click)"), else "Stairs" for a
 * stairs-only job, else "Flooring". Never says Preliminary or Measured: the basis is the version's.
 */
export function optionName(installs: string[], materials: string[], hasStairs: boolean): string {
  const tidy = (s: string) => s.replace(/\s*\|\s*/g, " / ").replace(/\s+/g, " ").trim();
  const uniq = (xs: string[]) => [...new Set(xs.map(tidy).filter(Boolean))];
  const work = uniq(installs);
  const done = work.filter((w) => NOT_INSTALL.test(w));
  const put = work.filter((w) => !NOT_INSTALL.test(w));
  const mats = put.length === 0 && done.length === 0 ? uniq(materials) : [];
  const parts = [
    ...(put.length ? [`Install ${put.join(" + ")}`] : mats.length ? [`Install ${mats.join(" + ")}`] : []),
    ...done,
    ...(hasStairs ? ["Stairs"] : []),
  ];
  const name = parts.join(" + ") || "Flooring";
  return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1).trimEnd()}…` : name;
}

/**
 * The preliminary's lines. A row needs an amount unless every part is flat; a material row needs a
 * product (its chosen one, else the standard one). Rows that can't be priced are skipped and named.
 * Each staircase becomes one Stairs line at its profile's preset price (or the typed override).
 */
export function buildPreliminary(choices: QuickChoice[], work: QuickWork, products: Map<string, QuickProduct>, profiles: Map<string, QuickProfile> = new Map()): BuildResult {
  const byId = new Map(choices.map((c) => [c.id, c]));
  const lines: EditorLine[] = [];
  const skipped: string[] = [];
  const installs: string[] = [];
  const materials: string[] = [];
  let stairs = false;
  for (const row of work.rows) {
    const c = byId.get(row.choiceId);
    if (!c) {
      skipped.push("a choice that's no longer on the form");
      continue;
    }
    const section = GROUP_SECTION[c.group];
    if (c.group === "Material") {
      const p = (row.productId ? products.get(row.productId) : null) ?? c.product;
      if (p) {
        if (row.amount === null) {
          skipped.push(`${c.label} (no square footage)`);
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
        materials.push(c.label);
        continue;
      }
      if (c.parts.length === 0) {
        skipped.push(`${c.label} (no product)`);
        continue;
      }
      // No product set: the Material Rate Card row behind the choice prices it, like any other row (2026-10-22).
    }
    const needsAmount = c.parts.some((p) => !isFlat(p.uom));
    if (c.parts.length === 0 || (needsAmount && row.amount === null)) {
      skipped.push(`${c.label} (${c.parts.length === 0 ? "nothing to price it from" : "no amount"})`);
      continue;
    }
    if (c.group === "Install") installs.push(c.label);
    if (c.group === "Material") materials.push(c.label);
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
  for (const s of work.stairs) {
    const p = profiles.get(s.profileId);
    if (!p) {
      skipped.push("a staircase profile that's no longer on the form");
      continue;
    }
    lines.push(profileLine(p, s.price));
    stairs = true;
  }
  // The preliminary's additional cost is a Private line (Albert, 2026-10-22): the customer sees it as the one rolled-up "Additional work" row, never itemised.
  if (work.extraCost !== null) {
    lines.push({ ...blank(PRIVATE_SECTION), sourceKind: "manual", description: "Additional work", uom: "flat", qty: 1, unitPrice: work.extraCost });
  }
  return { lines, skipped, name: optionName(installs, materials, stairs), materials };
}

/** At most this many options from one quick form (the one-working-quote decision revisits at about six). */
export const MAX_QUICK_OPTIONS = 6;

/** Every option's work from a request: `works` (several options, 2026-10-31), else the single `work`. Empty ones are dropped. */
export function parseWorks(raw: unknown): QuickWork[] {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.works) ? r.works.slice(0, MAX_QUICK_OPTIONS) : [r.work];
  return list.map(parseWork).filter((w) => !workIsEmpty(w));
}

/**
 * Names for several options built from the quick form, none the same: a name already taken adds
 * the option's material ("Install Hardwood (Nail Down) · Solid Hardwood"), and if that is taken
 * too, its number ("… (2)").
 */
export function distinctNames(built: Pick<BuildResult, "name" | "materials">[]): string[] {
  const seen = new Set<string>();
  return built.map((b, i) => {
    const tidy = [...new Set(b.materials.map((m) => m.replace(/\s*\|\s*/g, " / ").trim()))].join(" + ");
    const tries = [b.name, tidy && !b.name.includes(tidy) ? `${b.name} · ${tidy}` : null, `${b.name} (${i + 1})`].filter((x): x is string => Boolean(x));
    const name = tries.find((t) => !seen.has(t.toLowerCase())) ?? `${b.name} (${i + 1}·${seen.size})`;
    seen.add(name.toLowerCase());
    return name;
  });
}

/**
 * One row's total for the column beside it, priced the same way the quote will be (so minimum
 * charges count), before discount and HST. Null when the row can't be priced yet.
 */
export function rowTotal(choices: QuickChoice[], row: QuickRow, products: Map<string, QuickProduct>): number | null {
  const { lines } = buildPreliminary(choices, { rows: [row], stairs: [], extraCost: null, description: "", building: null }, products);
  return lines.length === 0 ? null : optionTotals(lines, 0, false).preDiscount;
}

/** What one staircase row shows beside its dropdown: the preset, or the price staff typed over it. */
export const stairTotal = (p: Pick<QuickProfile, "price">, override: number | null): number => override ?? p.price;

// ---------- baseboards follow the install (Albert, 2026-10-22) ----------

/** Baseboard linear feet default to a third of the install square feet, rounded to the nearest foot. */
export const BASEBOARD_PER_SQFT = 1 / 3;

export const baseboardDefault = (installSqft: number | null): number | null =>
  installSqft !== null && installSqft > 0 ? Math.round(installSqft * BASEBOARD_PER_SQFT) : null;

/**
 * What a baseboard row's amount becomes when the install square footage goes from `from` to `to`:
 * blank, or still the default the old figure gave, follows the new figure (and blanks when there is
 * no install any more); anything typed by hand stays. Null means leave the amount as it is.
 */
export function baseboardFollow(amount: string, from: number | null, to: number | null): string | null {
  const typed = amount.trim();
  const prev = baseboardDefault(from);
  if (typed !== "" && (prev === null || Number(typed) !== prev)) return null;
  const next = baseboardDefault(to);
  if (next === null) return typed === "" ? null : "";
  return String(next);
}
