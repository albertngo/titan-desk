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
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {count} colours in {title}
        </h2>
        {count > members.length && (
          <Link href={`/?${q}`} className="shrink-0 text-xs text-zinc-600 underline underline-offset-2">
            See all {count}
          </Link>
        )}
      </div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
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
        className={`block h-full overflow-hidden rounded-lg border bg-white active:bg-zinc-50 ${isCurrent ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200"}`}
      >
        <div className="relative aspect-square bg-zinc-100">
          {photo?.thumb ? (
            <BlurImage src={photo.thumb} blurhash={photo.blurhash} alt={name.title} sizes="(min-width: 768px) 120px, 33vw" />
          ) : (
            <div className="flex h-full items-center justify-center p-2 text-center text-[11px] text-zinc-400">No photo</div>
          )}
          {isCurrent && <span className="absolute left-1 top-1 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-white">Viewing</span>}
          {m.promo_active && <span className="absolute right-1 top-1 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-medium text-white">PROMO</span>}
        </div>
        <div className="p-1.5">
          <p className="truncate text-xs font-medium">{name.title}</p>
          {sub && <p className="truncate text-[11px] text-zinc-500">{sub}</p>}
          <p className="truncate text-[11px] text-zinc-700">{priceLabel(m.retail_price, m.price_unit, m.price_on_request)}</p>
          {m.stock_status && m.stock_status !== "In stock" && <p className="truncate text-[10px] text-zinc-500">{m.stock_status}</p>}
        </div>
      </Link>
    </li>
  );
}
