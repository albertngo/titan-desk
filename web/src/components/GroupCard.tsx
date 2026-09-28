import Link from "next/link";
import { BlurImage } from "@/components/BlurImage";
import { ResultCard, StockBadge } from "@/components/ResultCard";
import { groupTitle, priceRange, specChips, splitName, supplierIfDifferent } from "@/lib/card";
import type { GroupMember, SearchGroup } from "@/lib/db/types";
import { priceLabel } from "@/lib/format";

const PREVIEW = 5;

/**
 * One collection from the grouped search: the line, what its colours share, the price (or a
 * range), and the colours themselves, first few named and the rest one tap away. A "collection"
 * of one is just that product's normal card.
 */
export function GroupCard({ group }: { group: SearchGroup }) {
  if (group.product_count === 1 && group.members[0]) {
    const m = group.members[0];
    return <ResultCard hit={{ ...m, total_count: group.total_products, rank: group.rank, parsed: group.parsed }} />;
  }
  const title = groupTitle(group.line, group.brand, group.members[0]?.product_name ?? group.group_key);
  const chips = specChips(group);
  const supplier = supplierIfDifferent(group.brand, group.supplier);
  const photo = group.members.find((m) => m.hero?.thumb)?.hero ?? null;
  const colours = group.members.map((m) => splitName(m.product_name, m.brand, m.sku).title);
  const preview = colours.slice(0, PREVIEW).join(" · ") + (colours.length > PREVIEW ? ` · +${colours.length - PREVIEW} more` : "");

  return (
    <details className="group rounded-xl border border-zinc-200 bg-white [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none gap-3 p-3 active:bg-zinc-50">
        {photo?.thumb && (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
            <BlurImage src={photo.thumb} blurhash={photo.blurhash} alt="" sizes="80px" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-snug">{title}</p>
          <p className="truncate text-xs text-zinc-500">
            {group.product_count} {group.product_count === 1 ? "product" : "colours"}
            {[group.category, supplier].filter(Boolean).map((x) => <span key={x}> · {x}</span>)}
          </p>
          {chips.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1 text-[11px] text-zinc-700">
              {chips.map((c) => <span key={c} className="rounded-full border border-zinc-200 px-2 py-0.5">{c}</span>)}
            </p>
          )}
          <p className="mt-1.5 truncate text-xs text-zinc-600 group-open:hidden">{preview}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="text-base font-semibold">{priceRange(group.price_min, group.price_max, group.price_unit)}</span>
          {group.any_promo && <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-medium text-white">PROMO</span>}
          <span className="text-xs text-zinc-500 group-open:rotate-90" aria-hidden>▸</span>
        </div>
      </summary>
      <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
        {group.members.map((m) => <MemberRow key={m.sku} m={m} />)}
      </ul>
    </details>
  );
}

function MemberRow({ m }: { m: GroupMember }) {
  const name = splitName(m.product_name, m.brand, m.sku);
  return (
    <li>
      <Link href={`/p/${encodeURIComponent(m.sku)}`} className="flex items-center gap-3 px-3 py-2 active:bg-zinc-50">
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-medium">{name.title}</span>
            {name.badge && <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">{name.badge}</span>}
            {name.detail && <span className="truncate text-[11px] text-zinc-500">{name.detail}</span>}
          </p>
          <p className="font-mono text-[11px] text-zinc-500">{m.sku}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          <span className="text-sm">{priceLabel(m.retail_price, m.price_unit, m.price_on_request)}</span>
          <span className="flex gap-1">
            {m.promo_active && <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-medium text-white">PROMO</span>}
            <StockBadge status={m.stock_status} comingSoon={m.coming_soon} />
          </span>
        </div>
      </Link>
    </li>
  );
}
