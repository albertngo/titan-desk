import type { CatalogueStaffRow } from "@/lib/db/types";
import { dateShort, money } from "@/lib/format";

/** Staff pricing under the retail price: cost, MAP, pallet, promo and rep rates. MAP is informational only. */
export function PriceBlock({ product: p }: { product: CatalogueStaffRow }) {
  const rows: [string, string][] = [
    ["Cost", money(p.cost)],
    ["MAP", money(p.map_price)],
    ["Pallet", money(p.pallet_price)],
    ["Promo cost", p.promo_cost !== null ? `${money(p.promo_cost)}${p.promo_end_date ? ` to ${dateShort(p.promo_end_date)}` : " (no end date)"}` : "—"],
    ["Rep cost", p.rep_cost !== null
      ? `${money(p.rep_cost)}${p.rep_cost_end_date ? ` to ${dateShort(p.rep_cost_end_date)}` : " (ongoing)"}${p.rep_cost_active ? "" : " · ended"}`
      : "—"],
    ["Price updated", `${dateShort(p.last_price_update)}${p.price_last_changed_by ? ` · ${p.price_last_changed_by}` : ""}`],
  ];
  return (
    <section aria-label="Staff pricing" className="mt-6 rounded-[20px] bg-white/70 p-5 ring-1 ring-denim/10">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink/50">Staff pricing</h2>
        {p.promo_open_ended && <span className="rounded-md bg-peach px-2 py-0.5 text-[11px] font-semibold text-campfire-dark">Promo needs an end date</span>}
        {p.price_stale && <span className="rounded-md bg-cream-deep px-2 py-0.5 text-[11px] font-semibold text-ink">Price over 90 days old</span>}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink/55">{k}</dt>
            <dd className={`text-right tabular-nums ${k === "Cost" ? "font-semibold text-ink" : "text-ink"}`} title={k === "Rep cost" ? p.rep_cost_note ?? undefined : undefined}>{v}</dd>
          </div>
        ))}
      </dl>
      {p.volume_pricing_notes && <p className="mt-3 whitespace-pre-wrap border-t border-cream-deep pt-3 text-xs leading-relaxed text-ink/70">{p.volume_pricing_notes}</p>}
      {p.rep_cost_note && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink/70">Rep rate: {p.rep_cost_note}</p>}
    </section>
  );
}
