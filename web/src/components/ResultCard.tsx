import Link from "next/link";
import { BlurImage } from "@/components/BlurImage";
import type { SearchHit } from "@/lib/db/types";
import { boxPrice, specChips, splitName, supplierIfDifferent } from "@/lib/card";
import { money, priceLabel } from "@/lib/format";

export function StockBadge({ status, comingSoon }: { status: string | null; comingSoon: boolean }) {
  if (comingSoon) return <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-800">Coming soon</span>;
  if (!status) return null;
  const tone: Record<string, string> = {
    "In stock": "bg-emerald-100 text-emerald-800",
    "Low stock": "bg-amber-100 text-amber-800",
    "Special order": "bg-zinc-200 text-zinc-700",
    Discontinued: "bg-red-100 text-red-800",
    Clearance: "bg-purple-100 text-purple-800",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${tone[status] ?? "bg-zinc-200 text-zinc-700"}`}>{status}</span>;
}

/**
 * One search result, colour first: the product line small on top, the colour large, then the
 * specs as chips; price and stock on the right. No photo → no empty box, the text takes the room.
 */
export function ResultCard({ hit }: { hit: SearchHit }) {
  const name = splitName(hit.product_name, hit.brand, hit.sku);
  const chips = specChips(hit);
  const box = boxPrice(hit.retail_price, hit.price_unit, hit.price_on_request, hit.box_size_sf);
  const supplier = supplierIfDifferent(hit.brand, hit.supplier);
  const extra = [name.detail, chips.length ? null : name.size].filter(Boolean).join(" · ");
  return (
    <Link href={`/p/${encodeURIComponent(hit.sku)}`} className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-3 active:bg-zinc-100">
      {hit.hero?.thumb && (
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
          <BlurImage src={hit.hero.thumb} blurhash={hit.hero.blurhash} alt="" sizes="80px" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {name.line && <p className="truncate text-xs text-zinc-500">{name.line}</p>}
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-base font-semibold leading-snug">{name.title}</span>
          {name.badge && <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">{name.badge}</span>}
        </p>
        {(chips.length > 0 || extra) && (
          <p className="mt-1 flex flex-wrap gap-1 text-[11px] text-zinc-700">
            {chips.map((c) => <span key={c} className="rounded-full border border-zinc-200 px-2 py-0.5">{c}</span>)}
            {extra && <span className="px-0.5 py-0.5 text-zinc-500">{extra}</span>}
          </p>
        )}
        <p className="mt-1.5 truncate text-[11px] text-zinc-500">
          <span className="font-mono">{hit.sku}</span>
          {[hit.category, supplier].filter(Boolean).map((x) => <span key={x}> · {x}</span>)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        <span className="text-base font-semibold">{priceLabel(hit.retail_price, hit.price_unit, hit.price_on_request)}</span>
        {box !== null && <span className="text-xs text-zinc-500">{money(box)} /box</span>}
        {hit.promo_active && <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-medium text-white">PROMO</span>}
        <StockBadge status={hit.stock_status} comingSoon={hit.coming_soon} />
      </div>
    </Link>
  );
}
