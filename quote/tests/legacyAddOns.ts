import { isPriced, lineTotal, priceUsed, sectionOf } from "../src/lib/calc";
import type { CopyItem, CustomerCopy } from "../src/lib/send/copy";
import type { Quote } from "../src/lib/quotes/types";

/**
 * A copy as it was frozen before 2026-11-07, with each unticked line as an Optional add-on. Since that day the customer
 * copy drops unticked lines ("unticked means dropped from what they see"), but copies already sent keep their add-ons
 * and the acceptance and contract code still reads them, so tests that exercise add-ons build them this way.
 */
export function withLegacyAddOns(copy: CustomerCopy, quote: Quote): CustomerCopy {
  return {
    ...copy,
    options: copy.options.map((o) => {
      const src = quote.options.find((q) => q.id === o.ref);
      if (!src) return o;
      const sections = o.sections.map((s) => ({ ...s, lines: [...s.lines] }));
      for (const l of src.lines.filter((x) => !x.include && isPriced(x))) {
        const amount = lineTotal({ ...l, include: true }) ?? 0;
        if (amount === 0) continue;
        const name = sectionOf(l) === "Unsorted" ? "Other" : sectionOf(l);
        let s = sections.find((x) => x.name === name);
        if (!s) {
          s = { name, total: null, lines: [] };
          sections.push(s);
        }
        const item: CopyItem = {
          kind: "item",
          n: null,
          description: l.description ?? "Item",
          note: [l.area, l.clientNote].filter(Boolean).join(" · ") || null,
          qty: l.qty === null ? null : Math.round(l.qty * (1 + (l.waste ?? 0)) * 100) / 100,
          uom: l.uom,
          wastePct: null,
          unitPrice: priceUsed(l),
          minimum: false,
          amount: Math.round(amount * 100) / 100,
          optional: true,
        };
        s.lines.push(item);
      }
      return { ...o, sections };
    }),
  };
}
