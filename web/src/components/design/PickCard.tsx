import Link from "next/link";
import { BlurImage } from "@/components/BlurImage";
import { StockBadge } from "@/components/ResultCard";
import type { PickRole, Scored } from "@/lib/design/types";
import { priceLabel } from "@/lib/format";

const ROLE_TONE: Record<PickRole, string> = {
  "Best match": "bg-emerald-600",
  "Step up": "bg-indigo-600",
  "Smart value": "bg-amber-600",
};

export function PickCard({ pick, role }: { pick: Scored; role?: PickRole }) {
  const f = pick.floor;
  const tags = [f.undertone, f.tone_depth !== null ? `tone ${f.tone_depth}` : null, f.texture, f.busyness, ...f.style].filter(Boolean);
  return (
    <Link href={`/p/${encodeURIComponent(f.sku)}`} className="block overflow-hidden rounded-xl border border-zinc-200 bg-white active:bg-zinc-50">
      <div className="relative aspect-[16/9] bg-zinc-100">
        {f.hero?.card ? (
          <BlurImage src={f.hero.card} blurhash={f.hero.blurhash} alt={f.product_name ?? f.sku} sizes="(max-width: 768px) 100vw, 720px" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">no photo yet</div>
        )}
        {role && <span className={`absolute left-2 top-2 rounded px-2 py-0.5 text-xs font-semibold text-white ${ROLE_TONE[role]}`}>{role}</span>}
      </div>
      <div className="p-3">
        <p className="font-medium leading-tight">{f.product_name ?? f.sku}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{[f.category, f.brand, f.collection].filter(Boolean).join(" · ")}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{priceLabel(f.retail_price, f.price_unit, f.price_on_request)}</span>
          {f.promo_active && <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-medium text-white">PROMO</span>}
          <StockBadge status={f.stock_status} comingSoon={f.coming_soon} />
          <span className="font-mono text-[11px] text-zinc-500">{f.sku}</span>
        </p>
        {tags.length > 0 && <p className="mt-1 text-xs text-zinc-500">{tags.join(" · ")}</p>}
        {pick.reasons.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-zinc-800">
            {pick.reasons.slice(0, 3).map((r) => <li key={r}>• {r}</li>)}
          </ul>
        )}
        {pick.warnings.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-amber-800">
            {pick.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
          </ul>
        )}
      </div>
    </Link>
  );
}
