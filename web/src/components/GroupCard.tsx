import Link from "next/link";
import { BlurImage } from "@/components/BlurImage";
import { CHIP, PROMO_FLAG, ResultCard } from "@/components/ResultCard";
import { StockBadge } from "@/components/StockBadge";
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
  const range = priceRange(group.price_min, group.price_max, group.price_unit);
  const preview = colours.slice(0, PREVIEW).join(" · ") + (colours.length > PREVIEW ? ` · +${colours.length - PREVIEW} more` : "");

  return (
    <details className="group overflow-hidden rounded-xl bg-white ring-1 ring-denim/10 transition open:ring-denim/30 hover:ring-denim/30 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none gap-3 p-3 active:bg-cream/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-denim">
        {photo?.thumb && (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-peach">
            <BlurImage src={photo.thumb} blurhash={photo.blurhash} alt="" sizes="80px" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-base font-semibold leading-snug text-ink">{title}</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-denim sm:hidden">{range}</p>
          <p className="truncate text-xs text-ink/55">
            {group.product_count} {group.product_count === 1 ? "product" : "colours"}
            {[group.category, supplier].filter(Boolean).map((x) => <span key={x}> · {x}</span>)}
          </p>
          {chips.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1 text-[11px]">
              {chips.map((c) => <span key={c} className={CHIP}>{c}</span>)}
            </p>
          )}
          <p className="mt-1.5 truncate text-xs text-ink/65 group-open:hidden">{preview}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="hidden text-base font-semibold tabular-nums text-denim sm:inline">{range}</span>
          {group.any_promo && <span className={PROMO_FLAG}>Promo</span>}
          <span className="mt-auto flex items-center gap-1 text-xs font-medium text-denim/70">
            <span className="group-open:hidden">Colours</span>
            <span className="hidden group-open:inline">Hide</span>
            <span className="transition-transform group-open:rotate-90" aria-hidden>▸</span>
          </span>
        </div>
      </summary>
      <ul className="divide-y divide-cream-deep border-t border-cream-deep bg-cream/30">
        {group.members.map((m) => <MemberRow key={m.sku} m={m} />)}
      </ul>
    </details>
  );
}

function MemberRow({ m }: { m: GroupMember }) {
  const name = splitName(m.product_name, m.brand, m.sku);
  return (
    <li>
      <Link href={`/p/${encodeURIComponent(m.sku)}`} className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-white active:bg-cream focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-denim">
        {m.hero?.thumb && (
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-peach">
            <BlurImage src={m.hero.thumb} blurhash={m.hero.blurhash} alt="" sizes="40px" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-medium text-ink">{name.title}</span>
            {name.badge && <span className="shrink-0 rounded-md bg-cream-deep px-1.5 py-0.5 text-[11px] text-ink/70">{name.badge}</span>}
            {name.detail && <span className="truncate text-[11px] text-ink/55">{name.detail}</span>}
          </p>
          <p className="font-mono text-[11px] text-ink/50">{m.sku}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          <span className={`text-sm tabular-nums ${m.promo_active ? "font-semibold text-campfire-dark" : "text-ink"}`}>{priceLabel(m.retail_price, m.price_unit, m.price_on_request)}</span>
          <span className="flex gap-1">
            {m.promo_active && <span className={PROMO_FLAG}>Promo</span>}
            <StockBadge status={m.stock_status} comingSoon={m.coming_soon} />
          </span>
        </div>
      </Link>
    </li>
  );
}
