import Link from "next/link";
import { BlurImage } from "@/components/BlurImage";
import { collectionLine, groupTitle, splitName, type CollectionMember } from "@/lib/card";
import { priceLabel } from "@/lib/format";

/**
 * The other colours in this product's collection, as swatch tiles, the current one outlined.
 * Same collection as the grouped search card. More than fit here → a link to that search.
 */
export function CollectionTiles({ members, total, current, supplier }: {
  members: CollectionMember[]; total: number; current: string; supplier: string | null;
}) {
  if (members.length < 2) return null;
  const first = splitName(members[0].product_name, members[0].brand, members[0].sku);
  const title = groupTitle(first.line, null, members[0].sku);
  const count = Math.max(total, members.length);
  const q = new URLSearchParams({ q: collectionLine(members[0].product_name) ?? title });
  if (supplier) q.append("supplier", supplier);

  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="min-w-0 font-display text-2xl font-bold tracking-[-0.01em] text-denim">
          More colours in {title} <span className="text-base font-normal text-ink/45">{count}</span>
        </h2>
        {count > members.length && (
          <Link href={`/?${q}`} className="shrink-0 text-sm font-medium text-denim underline underline-offset-4">
            See all {count}
          </Link>
        )}
      </div>
      <ul className="mt-5 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
        {members.map((m) => <Tile key={m.sku} m={m} isCurrent={m.sku === current} />)}
      </ul>
    </section>
  );
}

function Tile({ m, isCurrent }: { m: CollectionMember; isCurrent: boolean }) {
  const name = splitName(m.product_name, m.brand, m.sku);
  const sub = [name.badge, name.detail].filter(Boolean).join(" · ");
  const photo = m.images?.find((i) => i.kind !== "detail" && i.thumb) ?? null;
  return (
    <li>
      <Link
        href={`/p/${encodeURIComponent(m.sku)}`}
        aria-current={isCurrent ? "page" : undefined}
        className="group block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-denim"
      >
        <div className={`relative aspect-square overflow-hidden rounded-[14px] bg-peach ${isCurrent ? "ring-[3px] ring-denim ring-offset-2 ring-offset-cream" : ""}`}>
          {photo?.thumb ? (
            <BlurImage src={photo.thumb} blurhash={photo.blurhash} alt={name.title} sizes="(min-width: 1280px) 160px, (min-width: 768px) 16vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
          ) : (
            <div className="flex h-full items-center justify-center p-2 text-center text-[11px] text-ink/40">No photo</div>
          )}
          {isCurrent && <span className="absolute left-1.5 top-1.5 rounded-md bg-denim px-1.5 py-0.5 text-[10px] font-semibold text-cream">Viewing</span>}
          {m.promo_active && <span className="absolute right-1.5 top-1.5 rounded-md bg-campfire-dark px-1.5 py-0.5 text-[10px] font-semibold text-cream">Promo</span>}
        </div>
        <p className={`mt-2 truncate text-[13px] font-semibold ${isCurrent ? "text-denim" : "text-ink"}`}>{name.title}</p>
        {sub && <p className="truncate text-[11px] text-ink/55">{sub}</p>}
        <p className={`truncate text-[12px] tabular-nums ${m.promo_active ? "text-campfire-dark" : "text-ink/75"}`}>{priceLabel(m.retail_price, m.price_unit, m.price_on_request)}</p>
        {m.stock_status && m.stock_status !== "In stock" && <p className="truncate text-[11px] text-ink/50">{m.stock_status}</p>}
      </Link>
    </li>
  );
}
