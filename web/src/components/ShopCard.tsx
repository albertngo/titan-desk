import Link from "next/link";
import type { ShopItem } from "@/lib/shop";

/**
 * One product tile in askBert's shop: photo first (square, soft 14px corners), a Campfire promo
 * flag over the photo, then name, price and the facts that sell it. The whole tile opens the
 * product page; "Ask Bert" asks about this product without leaving the shop.
 */
export function ShopCard({ item, onOpen, onAsk, size = "md" }: {
  item: ShopItem;
  onOpen?: () => void;
  onAsk?: (prompt: string) => void;
  size?: "sm" | "md";
}) {
  return (
    <article className="group relative flex h-full flex-col">
      <div className="relative aspect-square overflow-hidden rounded-[14px] bg-peach">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- Storage CDN variant; the URL is final
          <img src={item.image} alt={`${item.title} swatch`} loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img src="/brand/titan-mascot-blue.png" alt="" className="h-1/2 w-1/2 object-contain opacity-25" />
          </div>
        )}
        {(item.promoNote || item.flag) && (
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {item.promoNote && (
              <span className="rounded-md bg-campfire-dark px-2 py-1 text-[11px] font-semibold tracking-wide text-cream shadow-sm">
                {item.promoNote}
              </span>
            )}
            {item.flag && (
              <span className="rounded-md bg-ink/85 px-2 py-1 text-[11px] font-semibold text-cream">{item.flag}</span>
            )}
          </div>
        )}
      </div>

      <div className={`flex flex-1 flex-col pt-2.5 ${size === "sm" ? "gap-0.5" : "gap-1"}`}>
        {item.line && <p className="truncate text-[12px] text-ink/60">{item.line}</p>}
        <h3 className={`font-display font-bold leading-snug text-ink ${size === "sm" ? "text-[15px] line-clamp-1" : "text-base line-clamp-2"}`}>
          <Link href={item.href} onClick={onOpen}
            className="outline-none after:absolute after:inset-0 after:rounded-[14px] focus-visible:after:ring-2 focus-visible:after:ring-denim focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-cream">
            {item.title}
          </Link>
        </h3>
        <p className={`font-semibold tabular-nums ${item.promo ? "text-campfire-dark" : "text-denim"} ${size === "sm" ? "text-sm" : "text-[15px]"}`}>
          {item.price}
        </p>
        {item.facts.length > 0 && (
          <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-[12px] text-ink/65">
            {item.facts.map((f) => <span key={f}>{f}</span>)}
          </p>
        )}
        {item.sku && <p className="font-mono text-[11px] text-ink/45">{item.sku}</p>}
        {onAsk && (
          <button type="button" onClick={() => onAsk(item.ask)}
            className="relative z-10 mt-auto self-start rounded-full px-0 pt-1.5 text-[13px] font-medium text-denim underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim">
            Ask Bert about this
          </button>
        )}
      </div>
    </article>
  );
}

/** Same footprint as a ShopCard while the shelf loads. */
export function ShopCardSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="aspect-square rounded-[14px] bg-cream-deep" />
      <div className="mt-3 h-3 w-3/4 rounded bg-cream-deep" />
      <div className="mt-2 h-3 w-1/3 rounded bg-cream-deep" />
    </div>
  );
}
