import { optionTotals, round2 } from "@/lib/calc";
import { PRIVATE_SECTION } from "@/lib/calc";
import { LINE_TYPE, type CardEntry, type EditorLine } from "@/lib/editor/model";
import { defaultInput, expandProfile } from "@/lib/editor/stairBuilder";
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
  const part = c.parts.find((p) => !isFlat(p.uom));
  if (!part) return null;
  if (part.uom === "sqft") return "sqft";
  if (part.uom === "linear ft" || part.uom === "ft") return "linear ft";
  // Anything else counted (a Stair Item in steps, sets or pcs, or with no unit at all) is a count of pieces.
  return part.uom || part.kind === "stair" ? "pieces" : null;
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
/** One staircase: which Stair Profiles row. No typed price since 2026-11-02 (Albert: "remove different price"). */
export type StairWork = { profileId: string };
export type QuickWork = { rows: QuickRow[]; stairs: StairWork[]; extraCost: number | null; description: string; building: string | null };

/**
 * A Stair Profiles row as the form needs it (2026-11-02): the Stair Item lines it adds, worked out
 * from its template and preset counts, and their total. The browser gets the lines with no cost.
 */
export type QuickProfile = Pick<StairProfileRow, "id" | "name" | "type" | "method" | "steps"> & {
  lines: EditorLine[];
  total: number;
  /** True while the row has no Stair Items linked: one line at its old stored price (the changeover). */
  storedPrice: boolean;
};

/**
 * Every profile the form can offer, expanded into its preset Stair Item lines (Albert, 2026-11-02:
 * "once it processes through, it will add the preset items on the stair items for that particular
 * selection"). One linking an item the card no longer offers, or that comes to no line, is left off:
 * it is never priced from part of its items. The changeover: a row with no Stair Items linked at all
 * keeps its old stored price as one line until its links are set, and is left off without one.
 */
export function quickProfiles(rows: StairProfileRow[], catalogue: CardEntry[]): QuickProfile[] {
  return rows.flatMap((p): QuickProfile[] => {
    const head = { id: p.id, name: p.name, type: p.type, method: p.method, steps: p.steps };
    const r = expandProfile(p, defaultInput(p), catalogue);
    if (r.untemplated) return p.price === null ? [] : [{ ...head, lines: [profileLine(p)], total: p.price, storedPrice: true }];
    if (r.missing.length > 0 || r.lines.length === 0) return [];
    return [{ ...head, lines: r.lines, total: optionTotals(r.lines, 0, false).preDiscount, storedPrice: false }];
  });
}

/** The same profiles for the browser: charge rates only, no cost. */
export const browserProfiles = (ps: QuickProfile[]): QuickProfile[] => ps.map((p) => ({ ...p, lines: p.lines.map((l) => ({ ...l, unitCostSnap: null, costOverride: null, manualCost: null })) }));

/**
 * What each staircase's lines are labelled (Quote Lines → Area): the stair type, numbered when an
 * option has two of the same ("Main stairs 1", "Main stairs 2"), so the measure can tell them apart.
 */
export function stairAreas(types: string[]): string[] {
  const count = new Map<string, number>();
  for (const t of types) count.set(t, (count.get(t) ?? 0) + 1);
  const seen = new Map<string, number>();
  return types.map((t) => {
    if ((count.get(t) ?? 0) < 2) return t;
    const n = (seen.get(t) ?? 0) + 1;
    seen.set(t, n);
    return `${t} ${n}`;
  });
}

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
  // A staircase is a profile id, nothing else: a price sent with it is ignored (2026-11-02). Anything malformed is dropped, never guessed.
  const stairs = (Array.isArray(r.stairs) ? r.stairs : []).slice(0, STAIR_ROWS).flatMap((x): StairWork[] => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return typeof o.profileId === "string" && REC.test(o.profileId) ? [{ profileId: o.profileId }] : [];
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

// ---------- material waste (Albert, 2026-11-05) ----------
//
// "It should auto apply a 10% increase in the sf. Herringbones and Tiles should be + 15%. And when
// translating into the quote edit, there is a field for it right now anyways." The row's square feet
// stay the floor's; the waste goes on the Materials line's own Waste field, which the editor shows and
// calc.ts already counts (Qty × (1 + Waste)). Decided here from the choice and the product, never sent
// by the browser.

/** Waste on a material line from the quick form. */
export const MATERIAL_WASTE = 0.1;
/** Herringbone and tile take more cutting. */
export const PATTERN_WASTE = 0.15;
const PATTERN = /\bherringbone|\btiles?\b/i;

/** The waste a material row goes in with: 15% when its choice or its product says herringbone or tile, else 10%. */
export const materialWaste = (choiceLabel: string, productName: string | null): number =>
  PATTERN.test(choiceLabel) || (productName !== null && PATTERN.test(productName)) ? PATTERN_WASTE : MATERIAL_WASTE;

/**
 * The preliminary's lines. A row needs an amount unless every part is flat; a material row needs a
 * product (its chosen one, else the standard one). Rows that can't be priced are skipped and named.
 * Each staircase becomes its profile's preset Stair Item lines (2026-11-02), priced from the card,
 * labelled by stair type (numbered when two share one).
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
      const waste = materialWaste(c.label, p?.name ?? null);
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
          waste,
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
        uom: p.uom,
        qty: isFlat(p.uom) ? c.times : row.amount,
        // A material priced from its Rate Card row (no product) takes the same waste (2026-11-05).
        waste: c.group === "Material" && !isFlat(p.uom) ? materialWaste(c.label, null) : null,
        unitPriceSnap: p.rate,
        unitCostSnap: p.cost,
        minChargeSnap: p.minCharge,
        hasSource: true,
      });
    }
  }
  const picked = work.stairs.flatMap((s) => {
    const p = profiles.get(s.profileId);
    if (!p) skipped.push("a staircase profile that's no longer on the form");
    return p ? [p] : [];
  });
  const areas = stairAreas(picked.map((p) => p.type));
  picked.forEach((p, i) => {
    for (const l of p.lines) lines.push({ ...l, id: lineId(), area: areas[i] });
    stairs = true;
  });
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


// ---------- baseboards follow the install (Albert, 2026-10-22; a basis per row 2026-11-04) ----------

/** Baseboard linear feet default to a third of the install square feet, rounded to the nearest foot. */
export const BASEBOARD_PER_SQFT = 1 / 3;

export const baseboardDefault = (installSqft: number | null): number | null =>
  installSqft !== null && installSqft > 0 ? Math.round(installSqft * BASEBOARD_PER_SQFT) : null;

// ---------- a basis per baseboard row (Albert, 2026-11-04) ----------
//
// "The baseboards / shoemoulds should always calculate for the total sqft in the INSTALL tab as
// default and always be live. There then is a manual override when the value is changed (with an
// option to reset to 1/3 of ___ sf). If there are multiple baseboards and shoemould rows, then we
// should be offered the option to select (1/3 of ___ sf) depending on how many different install
// options there are."
//
// Each Baseboards row carries a basis: TOTAL_BASIS (every Install row's square feet added up), one
// Install row's key, or null (typed by hand, or a later row nobody has pointed anywhere yet). A row
// with a basis always shows a third of it; typing an amount clears the basis; a chip sets it again.
// The server never sees a basis: it gets the amount, a number, as before.

/** The basis that follows every Install row's square feet added up. */
export const TOTAL_BASIS = "total";

/** The few fields of a form row these rules read; the form's own rows carry more. */
export type BasisRow = { key: string; group: QuickGroup; choiceId: string; amount: string; basis?: string | null };

/** A typed amount as a positive number, or null ("1,200 " reads as 1200). */
export function typedSqft(amount: string): number | null {
  const t = amount.replace(/[$,\s]/g, "");
  const v = Number(t);
  return t !== "" && Number.isFinite(v) && v > 0 ? v : null;
}

const installRows = <T extends BasisRow>(rows: T[]) => rows.filter((r) => r.group === "Install" && r.choiceId);

/** Every Install row's square feet added up; null when there is none. */
export function installTotal(rows: BasisRow[]): number | null {
  const sum = installRows(rows).reduce((a, r) => a + (typedSqft(r.amount) ?? 0), 0);
  return sum > 0 ? sum : null;
}

/**
 * The basis a row really follows: one naming an Install row that is gone (removed, or its choice
 * cleared) falls back to the total, and so does one naming the only Install row left. Null stays null.
 */
export function resolveBasis(basis: string | null | undefined, rows: BasisRow[]): string | null {
  if (!basis) return null;
  if (basis === TOTAL_BASIS) return TOTAL_BASIS;
  const installs = installRows(rows);
  return installs.length > 1 && installs.some((r) => r.key === basis) ? basis : TOTAL_BASIS;
}

/** The square feet a basis stands for right now. */
export function basisSqft(basis: string | null | undefined, rows: BasisRow[]): number | null {
  const b = resolveBasis(basis, rows);
  if (b === null) return null;
  if (b === TOTAL_BASIS) return installTotal(rows);
  return typedSqft(rows.find((r) => r.key === b)?.amount ?? "");
}

/**
 * `third` is the amount the row takes from this basis: a third of the square feet, rounded, on a
 * Baseboards row; the square feet themselves on a Material row (2026-11-05).
 */
export type BasisChoice = { basis: string; sqft: number; third: number; label: string };

/**
 * The groups whose rows follow the install (Material since 2026-11-05, Albert: "Material selection
 * should ALSO have the same option to select to match each selection on install if desired").
 */
export const BASIS_GROUPS: readonly QuickGroup[] = ["Baseboards", "Material"];

/** What a row of this group takes from a basis of `sqft` square feet. */
export function basisAmount(group: QuickGroup, sqft: number | null): number | null {
  if (group === "Baseboards") return baseboardDefault(sqft);
  return sqft !== null && sqft > 0 ? round2(sqft) : null;
}

const sqftWords = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-CA") : String(round2(n)));

/**
 * The chips under a baseboard row: "⅓ of 820 sf" for the total and, with two or more Install rows
 * that have square feet, one per row named for its choice ("⅓ of 500 sf (Hardwood)"), the total then
 * saying "(all install)". Two rows of the same choice are numbered. Nothing when no Install row has
 * square feet yet. A Material row's chips are the same without the third: "820 sf", "500 sf (Hardwood)".
 */
export function basisChoices(rows: BasisRow[], labelOf: (choiceId: string) => string, group: QuickGroup = "Baseboards"): BasisChoice[] {
  const total = installTotal(rows);
  if (total === null) return [];
  const withSqft = installRows(rows).filter((r) => typedSqft(r.amount) !== null);
  const take = (sqft: number) => basisAmount(group, sqft) ?? 0;
  const lead = group === "Baseboards" ? "⅓ of " : "";
  const many = withSqft.length > 1;
  const out: BasisChoice[] = [{ basis: TOTAL_BASIS, sqft: total, third: take(total), label: `${lead}${sqftWords(total)} sf${many ? " (all install)" : ""}` }];
  if (!many) return out;
  const names = withSqft.map((r) => labelOf(r.choiceId) || "Install");
  withSqft.forEach((r, i) => {
    const sqft = typedSqft(r.amount)!;
    const twin = names.filter((x) => x === names[i]).length > 1;
    const name = twin ? `${names[i]} ${names.slice(0, i + 1).filter((x) => x === names[i]).length}` : names[i];
    out.push({ basis: r.key, sqft, third: take(sqft), label: `${lead}${sqftWords(sqft)} sf (${name})` });
  });
  return out;
}

/**
 * After any change to the rows, every Baseboards row with a basis shows a third of it, and every
 * Material row with a basis its square feet, live; a basis with no square feet behind it blanks the
 * amount. Rows `follows` says no to (no choice picked yet) and rows with no basis are left exactly as
 * they are.
 */
export function followBases<T extends BasisRow>(rows: T[], follows: (r: T) => boolean): T[] {
  return rows.map((r) => {
    if (!BASIS_GROUPS.includes(r.group) || !r.basis || !follows(r)) return r;
    const d = basisAmount(r.group, basisSqft(r.basis, rows));
    const amount = d === null ? "" : String(d);
    return amount === r.amount ? r : { ...r, amount };
  });
}

/** A copied tab's baseboard rows point at the copy's Install rows, never the original's (Duplicate, 2026-10-31). */
export function remapBases<T extends BasisRow>(rows: T[], keyFor: Map<string, string>): T[] {
  return rows.map((r) => (r.basis && r.basis !== TOTAL_BASIS ? { ...r, basis: keyFor.get(r.basis) ?? TOTAL_BASIS } : r));
}
