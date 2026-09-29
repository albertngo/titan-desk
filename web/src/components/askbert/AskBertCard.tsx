import Link from "next/link";
import type { AskBertProduct } from "@/lib/askbert-cards";
import { priceLabel } from "@/lib/format";

/** A product askBert named, from the catalogue tool's own row. Links to the product page. */
export function AskBertCard({ p, onOpen }: { p: AskBertProduct; onOpen?: () => void }) {
  return (
    <Link
      href={p.url}
      onClick={onOpen}
      className="flex gap-2 rounded-lg border border-zinc-200 bg-white p-2 active:bg-zinc-50"
    >
      {p.thumb_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny Storage thumbnail; the CDN URL is final
        <img src={p.thumb_url} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded object-cover" />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-snug">{p.name ?? p.sku}</p>
        <p className="truncate font-mono text-[11px] text-zinc-500">{p.sku}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
          <span className="font-semibold">{priceLabel(p.price.amount, p.price.unit, p.price.on_request)}</span>
          {p.promo && <span className="rounded bg-rose-600 px-1 py-px text-[10px] font-medium text-white">PROMO</span>}
          {p.status !== "current" && (
            <span className="rounded bg-zinc-800 px-1 py-px text-[10px] text-white">{p.status === "archived" ? "Archived" : "Discontinued"}</span>
          )}
        </p>
      </div>
    </Link>
  );
}
