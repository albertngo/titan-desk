import Link from "next/link";
import { BlurImage } from "@/components/BlurImage";
import type { SearchHit } from "@/lib/db/types";
import { priceLabel } from "@/lib/format";

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

export function ResultCard({ hit }: { hit: SearchHit }) {
  return (
    <Link href={`/p/${encodeURIComponent(hit.sku)}`} className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-2 active:bg-zinc-100">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
        {hit.hero?.thumb ? (
          <BlurImage src={hit.hero.thumb} blurhash={hit.hero.blurhash} alt="" sizes="80px" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">no photo</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{hit.product_name ?? hit.sku}</p>
        <p className="truncate text-xs text-zinc-500">
          {[hit.category, hit.brand, hit.supplier].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 text-sm">
          <span className="font-semibold">{priceLabel(hit.retail_price, hit.price_unit, hit.price_on_request)}</span>
          {hit.promo_active && <span className="ml-2 rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-medium text-white">PROMO</span>}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="font-mono">{hit.sku}</span>
          <StockBadge status={hit.stock_status} comingSoon={hit.coming_soon} />
        </p>
      </div>
    </Link>
  );
}
