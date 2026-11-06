import { round2, sectionOf } from "@/lib/calc";

/**
 * The material against the install (Albert, 2026-11-06: "there should also be a check for sf of flooring; and sf of
 * install. This should usually fall inside of the 10-15% rule difference… flag this as well and give an option to 'ok'
 * it and re-open the send option… unless there's no material at all of course"). Pure.
 *
 * On one option: the install is the square feet of its Install lines (no refinishing, sanding or painting, and not a
 * stand-alone glue assist line, which lies over a floor already counted); the material is what its square-foot
 * Materials lines order, quantity plus waste. The material should be 10 to 15% over the install. An option with no
 * material, or no install, is not checked. Only lines in the total count.
 */

export const SQFT_OVER_MIN = 0.1;
export const SQFT_OVER_MAX = 0.15;
/** Rounding room either side of the band, so 10% waste on a rounded quantity never trips it. */
const SLACK = 0.005;

type Line = { section: string | null; uom: string | null; qty: number | null; waste: number | null; include: boolean; labourType?: string | null; spec?: string | null };

const NOT_INSTALL = new Set(["Refinish", "Sand", "Paint"]);
const sqft = (l: Line) => l.include && l.uom === "sqft" && (l.qty ?? 0) > 0;

export type SqftCheck = { install: number; material: number; over: number; inBand: boolean; key: string };

/** The option's figures, or null when there is nothing to check. `over` is the material's share above the install. */
export function sqftCheck(lines: Line[]): SqftCheck | null {
  const install = round2(
    lines
      .filter((l) => sqft(l) && sectionOf(l) === "Install" && !NOT_INSTALL.has(l.section ?? "") && !NOT_INSTALL.has(l.labourType ?? "") && !/^glue assist/i.test(l.spec ?? ""))
      .reduce((a, l) => a + (l.qty ?? 0), 0),
  );
  const material = round2(lines.filter((l) => sqft(l) && sectionOf(l) === "Materials").reduce((a, l) => a + (l.qty ?? 0) * (1 + (l.waste ?? 0)), 0));
  if (install <= 0 || material <= 0) return null;
  const over = material / install - 1;
  return { install, material, over, inBand: over >= SQFT_OVER_MIN - SLACK && over <= SQFT_OVER_MAX + SLACK, key: sqftKey(install, material) };
}

/** What an OK remembers: the two figures it approved, so a change to either brings the flag back. */
export const sqftKey = (install: number, material: number) => `${round2(install)}/${round2(material)}`;

const fmt = (n: number) => n.toLocaleString("en-CA", { maximumFractionDigits: 2 });

/** The words for a flag: "Material is 650 sf for 820 sf of install, 21% under. It is usually 10 to 15% over." */
export function sqftWords(c: SqftCheck): string {
  const pct = Math.round(Math.abs(c.over) * 100);
  return `Material is ${fmt(c.material)} sf for ${fmt(c.install)} sf of install, ${pct}% ${c.over < 0 ? "under" : "over"}. It is usually 10 to 15% over.`;
}

/** The option's flag, or null: outside the band and not OK'd for these exact figures. */
export function sqftFlag(lines: Line[], okKey: string | null | undefined): SqftCheck | null {
  const c = sqftCheck(lines);
  return c && !c.inBand && c.key !== okKey ? c : null;
}
