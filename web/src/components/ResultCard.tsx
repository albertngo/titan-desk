import Link from "next/link";
import { BlurImage } from "@/components/BlurImage";
import { StockBadge } from "@/components/StockBadge";
import type { SearchHit } from "@/lib/db/types";
import { boxPrice, specChips, splitName, supplierIfDifferent } from "@/lib/card";
import { money, priceLabel } from "@/lib/format";

export const PROMO_FLAG = "rounded-md bg-campfire-dark px-1.5 py-0.5 text-[11px] font-semibold text-cream";
export const CHIP = "rounded-full bg-cream px-2 py-0.5 text-ink/80 ring-1 ring-denim/10";

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
    <Link
      href={`/p/${encodeURIComponent(hit.sku)}`}
      className="group flex gap-3 rounded-xl bg-white p-3 ring-1 ring-denim/10 transition hover:ring-denim/30 active:bg-cream/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim"
    >
      {hit.hero?.thumb && (
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-peach">
          <BlurImage src={hit.hero.thumb} blurhash={hit.hero.blurhash} alt="" sizes="80px" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {name.line && <p className="truncate text-xs text-ink/55">{name.line}</p>}
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-base font-semibold leading-snug text-ink group-hover:text-denim">{name.title}</span>
          {name.badge && <span className="shrink-0 rounded-md bg-cream-deep px-1.5 py-0.5 text-[11px] text-ink/70">{name.badge}</span>}
        </p>
        {(chips.length > 0 || extra) && (
          <p className="mt-1 flex flex-wrap gap-1 text-[11px]">
            {chips.map((c) => <span key={c} className={CHIP}>{c}</span>)}
            {extra && <span className="px-0.5 py-0.5 text-ink/55">{extra}</span>}
          </p>
        )}
        <p className="mt-1.5 truncate text-[11px] text-ink/55">
          <span className="font-mono">{hit.sku}</span>
          {[hit.category, supplier].filter(Boolean).map((x) => <span key={x}> · {x}</span>)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        <span className={`text-base font-semibold tabular-nums ${hit.promo_active ? "text-campfire-dark" : "text-denim"}`}>
          {priceLabel(hit.retail_price, hit.price_unit, hit.price_on_request)}
        </span>
        {box !== null && <span className="text-xs tabular-nums text-ink/55">{money(box)} /box</span>}
        {hit.promo_active && <span className={PROMO_FLAG}>Promo</span>}
        <StockBadge status={hit.stock_status} comingSoon={hit.coming_soon} />
      </div>
    </Link>
  );
}

/** A row-shaped placeholder while the first page of results loads. */
export function ResultCardSkeleton() {
  return (
    <div className="flex animate-pulse gap-3 rounded-xl bg-white p-3 ring-1 ring-denim/10" aria-hidden>
      <div className="h-20 w-20 shrink-0 rounded-lg bg-cream-deep" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-3 w-1/3 rounded bg-cream-deep" />
        <div className="h-4 w-1/2 rounded bg-cream-deep" />
        <div className="h-3 w-2/3 rounded bg-cream-deep" />
      </div>
      <div className="h-4 w-16 rounded bg-cream-deep" />
    </div>
  );
}
