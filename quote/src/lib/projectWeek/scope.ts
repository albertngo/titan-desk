import type { CustomerCopy } from "@/lib/send/copy";
import { workFromItems, type Work } from "./work";

/**
 * The accepted quote's work (Albert, 2026-11-25: "Card, else quote"), in the standard shape (work.ts). Pure: the
 * contract's joined copy in, Install / Remove / Stairs out, from each section's item descriptions and quantities.
 * Never a price; add-ons the customer didn't take are left out.
 */
export function scopeFromCopy(copy: CustomerCopy): Work | null {
  const option = copy.options[0];
  if (!option) return null;
  return workFromItems(
    option.sections.flatMap((s) => s.lines.flatMap((l) => (l.kind === "item" && !l.optional ? [{ section: s.name, description: l.description, qty: l.qty, uom: l.uom }] : []))),
  );
}
