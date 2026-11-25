import type { CustomerCopy } from "@/lib/send/copy";

/**
 * The accepted quote's scope in one short line (Albert, 2026-11-25: "draw the details from the scope of the work from the
 * accepted quote... its most updated and more informative"; chose "Card, else quote"). Pure: the contract's joined copy
 * in, "Install: Engineered hardwood 650 sf, Baseboard 300 lf · Stairs: Treads 14" out. Descriptions and quantities only,
 * never a price; discounts left out.
 */
export function scopeFromCopy(copy: CustomerCopy, max = 500): string | null {
  const option = copy.options[0];
  if (!option) return null;
  const parts: string[] = [];
  for (const s of option.sections) {
    if (/discount/i.test(s.name)) continue;
    const items = s.lines.flatMap((l) => {
      if (l.kind !== "item" || l.optional) return [];
      const qty = l.qty !== null && l.qty !== 1 ? ` ${Math.round(l.qty * 100) / 100}${l.uom ? ` ${l.uom}` : ""}` : "";
      return [`${l.description.trim()}${qty}`];
    });
    if (items.length) parts.push(`${s.name}: ${items.join(", ")}`);
  }
  const text = parts.join(" · ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}
