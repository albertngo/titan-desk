import type { CatalogueStaffRow } from "@/lib/db/types";
import { dateShort, money, priceLabel } from "@/lib/format";

/** Staff pricing: retail up front, cost/MAP/pallet/promo/rep rate beneath. MAP is informational only. */
export function PriceBlock({ product: p }: { product: CatalogueStaffRow }) {
  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-2xl font-semibold">{priceLabel(p.retail_price, p.price_unit, p.price_on_request)}</p>
        <div className="flex gap-1.5">
          {p.promo_active && <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-medium text-white">PROMO</span>}
          {p.promo_open_ended && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">Promo needs end date</span>}
          {p.price_stale && <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-700">Price &gt; 90 days old</span>}
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-zinc-500">Cost</dt><dd>{money(p.cost)}</dd>
        <dt className="text-zinc-500">MAP</dt><dd>{money(p.map_price)}</dd>
        <dt className="text-zinc-500">Pallet</dt><dd>{money(p.pallet_price)}</dd>
        <dt className="text-zinc-500">Promo cost</dt>
        <dd>{p.promo_cost !== null ? `${money(p.promo_cost)}${p.promo_end_date ? ` until ${dateShort(p.promo_end_date)}` : " (no end date)"}` : "—"}</dd>
        <dt className="text-zinc-500">Rep cost</dt>
        <dd title={p.rep_cost_note ?? undefined}>
          {p.rep_cost !== null
            ? `${money(p.rep_cost)}${p.rep_cost_end_date ? ` until ${dateShort(p.rep_cost_end_date)}` : " (ongoing)"}${p.rep_cost_active ? "" : " · ended"}`
            : "—"}
        </dd>
        <dt className="text-zinc-500">Last price update</dt>
        <dd>{dateShort(p.last_price_update)}{p.price_last_changed_by ? ` · ${p.price_last_changed_by}` : ""}</dd>
      </dl>
      {p.volume_pricing_notes && <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-600">{p.volume_pricing_notes}</p>}
      {p.rep_cost_note && <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-600">Rep rate: {p.rep_cost_note}</p>}
    </div>
  );
}
