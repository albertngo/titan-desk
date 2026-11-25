/**
 * The work on a job in one standard shape (Albert, 2026-11-25: "too crammed; lets standardize the layout to: Work: Flooring
 * Only | Stairs Only | Flooring & Stairs, Install: [sf] Material | ..., Remove: [sf] Material | ..., Stairs: New Steps,
 * Refinish, Vinyl - [Total Steps] | [Total Spindles] | [Total Posts] | [Total Handrails] | [Total Nosings]"). Pure. Built
 * from a payout card's lines or from the accepted quote's sections, which both carry a section, a description, a
 * quantity and a unit; never a price.
 */

export type WorkItem = { section: string; description: string; qty: number | null; uom: string | null };
export type StairCounts = { steps: number; spindles: number; posts: number; handrails: number; nosings: number };
export type Work = { install: string[]; remove: string[]; stairTypes: string[]; stairs: StairCounts };

const num = (n: number) => String(Math.round(n * 100) / 100);
const amount = (i: WorkItem) => (i.qty !== null && i.qty > 0 ? `${num(i.qty)}${i.uom?.trim() ? ` ${i.uom.trim()}` : ""} ` : "");
const empty = (): StairCounts => ({ steps: 0, spindles: 0, posts: 0, handrails: 0, nosings: 0 });

/** Which part of the work a section is: Install, Remove, Stairs, or none (prep, disposal, delivery, discounts...). */
function partOf(section: string): "install" | "remove" | "stairs" | null {
  const s = section.toLowerCase();
  if (/stair/.test(s)) return "stairs";
  if (/remov|tear/.test(s)) return "remove";
  if (/install|material|moulding|molding|floor/.test(s)) return "install";
  return null;
}

/** A stair line's kind of count, and its type of stair work. */
function stairKind(text: string): keyof StairCounts {
  if (/nosing/.test(text)) return "nosings";
  if (/spindle|baluster|picket/.test(text)) return "spindles";
  if (/newel|\bposts?\b/.test(text)) return "posts";
  if (/hand ?rail|\brail/.test(text)) return "handrails";
  return "steps";
}
function stairType(text: string): string | null {
  if (/vinyl|lvp/.test(text)) return "Vinyl";
  if (/refin|sand|stain|recoat/.test(text)) return "Refinish";
  if (/tread|cap|new|install|oak|hardwood|step/.test(text)) return "New Steps";
  return null;
}

export function workFromItems(items: WorkItem[]): Work | null {
  const w: Work = { install: [], remove: [], stairTypes: [], stairs: empty() };
  const stepLines: number[] = [];
  for (const i of items) {
    const desc = i.description.trim();
    if (!desc) continue;
    const part = partOf(i.section);
    if (part === "install") w.install.push(`${amount(i)}${desc}`);
    else if (part === "remove") w.remove.push(`${amount(i)}${desc}`);
    else if (part === "stairs") {
      const text = `${desc} ${i.uom ?? ""}`.toLowerCase();
      const kind = stairKind(text);
      const qty = i.qty ?? 0;
      // Treads and risers are the same steps: the step count is the largest step line, not their sum.
      if (kind === "steps") stepLines.push(qty);
      else w.stairs[kind] += qty;
      const type = stairType(text);
      if (type && !w.stairTypes.includes(type)) w.stairTypes.push(type);
    }
  }
  w.stairs.steps = stepLines.length ? Math.max(...stepLines) : 0;
  if (w.stairs.steps && !w.stairTypes.length) w.stairTypes.push("New Steps");
  const hasStairs = Object.values(w.stairs).some((n) => n > 0) || w.stairTypes.length > 0;
  return w.install.length || w.remove.length || hasStairs ? w : null;
}

/** Two works on one job (an installer with more than one card line there) added together. */
export function mergeWork(a: Work | null, b: Work | null): Work | null {
  if (!a) return b;
  if (!b) return a;
  const stairs = empty();
  for (const k of Object.keys(stairs) as (keyof StairCounts)[]) stairs[k] = k === "steps" ? Math.max(a.stairs.steps, b.stairs.steps) : a.stairs[k] + b.stairs[k];
  return { install: [...a.install, ...b.install], remove: [...a.remove, ...b.remove], stairTypes: [...new Set([...a.stairTypes, ...b.stairTypes])], stairs };
}

export const hasStairs = (w: Work) => Object.values(w.stairs).some((n) => n > 0) || w.stairTypes.length > 0;

/** "Flooring Only", "Stairs Only" or "Flooring & Stairs": from the project's type when it has one, else from the work. */
export function workKind(w: Work, projectType: string | null): string {
  const t = (projectType ?? "").toLowerCase();
  if (t === "both") return "Flooring & Stairs";
  if (t === "stairs") return "Stairs Only";
  if (t === "flooring") return "Flooring Only";
  const floor = w.install.length > 0 || w.remove.length > 0;
  return floor && hasStairs(w) ? "Flooring & Stairs" : hasStairs(w) ? "Stairs Only" : "Flooring Only";
}

/** The Stairs line's right-hand side: "14 steps | 20 spindles | 2 posts | 12 handrails | 14 nosings", zeros left out. */
export function stairCountsText(s: StairCounts): string {
  const parts: [number, string][] = [[s.steps, "steps"], [s.spindles, "spindles"], [s.posts, "posts"], [s.handrails, "handrails"], [s.nosings, "nosings"]];
  return parts.filter(([n]) => n > 0).map(([n, w]) => `${num(n)} ${w}`).join(" | ");
}

/** The sub-lines under Work, in the standard order. */
export function workLines(w: Work): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  if (w.install.length) out.push({ label: "Install", text: w.install.join(" | ") });
  if (w.remove.length) out.push({ label: "Remove", text: w.remove.join(" | ") });
  if (hasStairs(w)) {
    const counts = stairCountsText(w.stairs);
    out.push({ label: "Stairs", text: [w.stairTypes.join(", "), counts].filter(Boolean).join(" - ") || "See scope photos" });
  }
  return out;
}

/** Stored after the card mark in a Project Costs line's Notes; read back with parseWork. */
export const serializeWork = (w: Work) => JSON.stringify(w);
export function parseWork(raw: string | null | undefined): Work | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Work;
    return v && Array.isArray(v.install) && Array.isArray(v.remove) && Array.isArray(v.stairTypes) && v.stairs ? v : null;
  } catch {
    return null;
  }
}
