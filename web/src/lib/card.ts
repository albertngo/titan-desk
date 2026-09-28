/**
 * How a search result reads. Pure: the card component only lays these out.
 *
 * Product names follow the catalogue's naming rule, "Line — Colour (grade)" for flooring and
 * "Series — Colour — Size (finish)" for tile, so the part staff scan for (the colour) sits in
 * the middle. We lift it out as the title and push the rest into smaller lines. A name that
 * doesn't follow the rule is shown whole.
 */
import { num } from "./format";

export type CardName = {
  line: string | null;   // "Purelux Betten Laminate": the product line, shown small above
  title: string;         // "Banwell": the colour, shown large
  badge: string | null;  // "Select & Better", "ABCD", "6102": grade or code beside the title
  detail: string | null; // "12 x 24 (Polished)": the third part of a tile name (size and finish)
  size: string | null;   // "7.72\" x 14.3mm": a bracketed size; shown only when no spec chips carry it
};

const DASH = " — ";
const TRAILING_PAREN = /^(.*\S)\s*\(([^()]*)\)\s*$/;
// A parenthetical that is a size ("7.72\" x 14.3mm", "6.5\" x 3/4\", 1.2mm top") rather than a grade.
const LOOKS_LIKE_SIZE = /\d\s*(?:"|mm|x|\*)|\bx\s*\d/i;

const same = (a: string, b: string) => a.replace(/\s+/g, "").toLowerCase() === b.replace(/\s+/g, "").toLowerCase();

export function splitName(name: string | null, brand: string | null, fallback: string): CardName {
  const full = (name ?? "").trim();
  if (!full) return { line: null, title: fallback, badge: null, detail: null, size: null };
  const parts = full.split(DASH).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { line: null, title: full, badge: null, detail: null, size: null };

  let line = parts[0];
  if (brand && !line.toLowerCase().includes(brand.toLowerCase())) line = `${brand} ${line}`;

  let title = parts[1];
  let badge: string | null = null;
  let size: string | null = null;
  const detail = parts.length > 2 ? parts.slice(2).join(DASH) : null;

  const m = TRAILING_PAREN.exec(title);
  if (m) {
    title = m[1];
    if (LOOKS_LIKE_SIZE.test(m[2])) size = m[2];
    else badge = m[2];
  }
  return { line, title, badge, detail, size };
}

/** Show the supplier only when it isn't just the brand again ("Purelux · PURELUX"). */
export function supplierIfDifferent(brand: string | null, supplier: string | null): string | null {
  if (!supplier) return null;
  if (brand && same(brand, supplier)) return null;
  return supplier;
}

export type SpecInput = {
  width_in: number | null;
  thickness_mm: number | null;
  wear_layer_mil: number | null;
  install_profile: string | null;
  waterproof: boolean;
};

/** The few facts staff compare at a glance, from their own fields rather than the name. */
export function specChips(s: SpecInput): string[] {
  // `!= null` on purpose: a search served before migration 004 omits these keys entirely.
  return [
    s.width_in != null ? `${num(s.width_in)}"` : null,
    s.thickness_mm != null ? `${num(s.thickness_mm)}mm` : null,
    s.wear_layer_mil != null ? `${num(s.wear_layer_mil)} mil` : null,
    s.install_profile,
    s.waterproof ? "Waterproof" : null,
  ].filter((x): x is string => Boolean(x));
}

/** Price of one box for a per-sf product: what a customer actually pays per unit carried out. */
export function boxPrice(retail: number | null, unit: "sf" | "piece", onRequest: boolean, boxSf: number | null): number | null {
  if (onRequest || unit !== "sf" || retail == null || !boxSf || boxSf <= 0) return null;
  return Math.round(retail * boxSf * 100) / 100;
}
