"use client";

import { supplierCategories, supplierTiles, typeOf, typeTiles, type BrowseLevel, type Crumb, type Tile } from "@/lib/browse";
import type { Filters } from "@/lib/db/filters";
import type { BrowseRow } from "@/lib/db/types";
import { ShortcutIcon, type IconName } from "@/components/askbert/ShortcutIcon";
import { LIFT } from "@/lib/ui";

type Props = {
  level: BrowseLevel;
  rows: BrowseRow[] | undefined;
  filters: Filters;
  onGo: (f: Filters) => void;
};

/**
 * The home page with the search box empty: Suppliers or Product types as tiles, one level down,
 * then the collections list (SearchView's grouped results). A step with a single choice is
 * skipped, so a supplier that only sells laminate opens straight on its laminate collections.
 */
export function Browse({ level, rows, filters, onGo }: Props) {
  if (!rows) return <BrowseSkeleton />;

  const toSupplier = (supplier: string, base: Filters) => {
    const types = typeTiles(rows, supplier);
    const only = types.length === 1 ? typeOf(rows.find((r) => r.supplier === supplier)!.category) : null;
    onGo({ ...base, supplier: [supplier], category: only ? only.categories : base.category });
  };
  const toType = (label: string, base: Filters) => {
    const tile = typeTiles(rows).find((t) => t.label === label);
    const cat = rows.find((r) => typeOf(r.category).label === label)?.category ?? label;
    onGo({ ...base, category: typeOf(cat).categories, supplier: tile?.sub.length === 1 ? [tile.sub[0]] : base.supplier });
  };

  if (level.level === "home") {
    const bySupplier = filters.by !== "type";
    return (
      <section aria-labelledby="browse-title" className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="browse-title" className="font-display text-2xl font-bold tracking-[-0.01em] text-denim">
            {bySupplier ? "Shop by supplier" : "Shop by product type"}
          </h2>
          <div role="tablist" aria-label="Browse by" className="inline-flex rounded-full bg-white p-1 text-sm ring-1 ring-denim/10">
            {(["type", "supplier"] as const).map((by) => {
              const on = (filters.by ?? "supplier") === by;
              return (
                <button key={by} role="tab" aria-selected={on} type="button" onClick={() => onGo({ ...filters, by })}
                  className={`rounded-full px-4 py-1.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim ${
                    on ? "bg-denim text-cream" : "text-denim hover:bg-cream"}`}>
                  {by === "supplier" ? "Suppliers" : "Product types"}
                </button>
              );
            })}
          </div>
        </div>
        {bySupplier ? (
          <SupplierGrid tiles={supplierTiles(rows)} onPick={(t) => toSupplier(t.key, filters)} />
        ) : (
          <TypeGrid tiles={typeTiles(rows)} onPick={(t) => toType(t.label, filters)} />
        )}
      </section>
    );
  }

  if (level.level === "supplier") {
    const tiles = typeTiles(rows, level.supplier);
    const all: Tile = {
      key: "__all",
      label: "All types",
      products: tiles.reduce((n, t) => n + t.products, 0),
      collections: tiles.reduce((n, t) => n + t.collections, 0),
      sub: [],
    };
    return (
      <section className="mt-6">
        <h2 className="font-display text-[28px] font-bold leading-tight text-denim">{level.supplier}</h2>
        <p className="mt-1 text-sm text-ink/60">Pick a product type to see its collections.</p>
        <TypeGrid
          tiles={tiles.length > 1 ? [...tiles, all] : tiles}
          onPick={(t) =>
            onGo({
              ...filters,
              category: t.key === "__all" ? supplierCategories(rows, level.supplier) : typeOf(rowCategory(rows, level.supplier, t.label)).categories,
            })
          }
        />
      </section>
    );
  }

  return (
    <section className="mt-6">
      <h2 className="font-display text-[28px] font-bold leading-tight text-denim">{level.type.label}</h2>
      <p className="mt-1 text-sm text-ink/60">Pick a supplier to see its collections.</p>
      <SupplierGrid tiles={supplierTiles(rows, level.type)} onPick={(t) => onGo({ ...filters, supplier: [t.key] })} />
    </section>
  );
}

/** A category of `supplier` that belongs to the type labelled `label`. */
function rowCategory(rows: BrowseRow[], supplier: string, label: string): string {
  return rows.find((r) => r.supplier === supplier && typeOf(r.category).label === label)?.category ?? label;
}

const TYPE_LOOK: Record<string, { icon: IconName; tone: string }> = {
  Vinyl: { icon: "vinyl", tone: "bg-sky" },
  Laminate: { icon: "laminate", tone: "bg-peach" },
  "Engineered hardwood": { icon: "engineered", tone: "bg-[#e6dcc6]" },
  "Solid hardwood": { icon: "solid", tone: "bg-[#ddd0b4]" },
  "Tile & stone": { icon: "tile", tone: "bg-[#dfe3e8]" },
  Carpet: { icon: "carpet", tone: "bg-[#efe1d6]" },
  Accessories: { icon: "tools", tone: "bg-white" },
};

const counts = (t: Tile) =>
  `${t.collections} collection${t.collections === 1 ? "" : "s"} · ${t.products} product${t.products === 1 ? "" : "s"}`;

/** Product types as colour blocks with a drawn icon: the first thing a customer says is the type. */
function TypeGrid({ tiles, onPick }: { tiles: Tile[]; onPick: (t: Tile) => void }) {
  if (!tiles.length) return <p className="py-10 text-center text-sm text-ink/60">Nothing here yet.</p>;
  return (
    <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {tiles.map((t) => {
        const look = TYPE_LOOK[t.label] ?? { icon: "grid" as IconName, tone: "bg-white" };
        return (
          <li key={t.key}>
            <button type="button" onClick={() => onPick(t)}
              className={`group flex h-full min-h-[148px] w-full flex-col justify-between rounded-[20px] p-4 text-left transition duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim sm:min-h-[168px] sm:p-5 ${look.tone} ${look.tone === "bg-white" ? LIFT : ""}`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70 text-denim transition-colors group-hover:bg-denim group-hover:text-cream">
                <ShortcutIcon name={look.icon} className="h-6 w-6" />
              </span>
              <span>
                <span className="block font-display text-lg font-bold leading-tight text-ink sm:text-xl">{t.label}</span>
                <span className="mt-1 block text-[12px] text-ink/60">{counts(t)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Suppliers as white cards with a monogram and the types they carry. */
function SupplierGrid({ tiles, onPick }: { tiles: Tile[]; onPick: (t: Tile) => void }) {
  if (!tiles.length) return <p className="py-10 text-center text-sm text-ink/60">Nothing here yet.</p>;
  return (
    <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tiles.map((t) => (
        <li key={t.key}>
          <button type="button" onClick={() => onPick(t)}
            className={`group flex h-full w-full items-center gap-3.5 rounded-2xl bg-white p-4 text-left transition duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim ${LIFT}`}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-sky font-display text-base font-bold text-denim">
              {monogram(t.label)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-ink">{titleCase(t.label)}</span>
              <span className="block truncate text-[12px] text-ink/60">{t.sub.join(" · ")}</span>
              <span className="block text-[12px] text-ink/45">{counts(t)}</span>
            </span>
            <ShortcutIcon name="chevron" className="h-4 w-4 shrink-0 text-denim/40 transition-transform group-hover:translate-x-0.5 group-hover:text-denim" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** "OLYMPIA TILE" → "OT"; "VIDAR" → "VI". */
function monogram(name: string): string {
  const words = name.split(/[\s&]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Supplier names are stored in capitals in Airtable; show them in title case. */
function titleCase(name: string): string {
  return name.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/** All › Supplier › Type: each step but the last goes back up. */
export function Crumbs({ trail, onGo }: { trail: Crumb[]; onGo: (f: Filters) => void }) {
  if (!trail.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="mt-4 flex flex-wrap items-center gap-1 text-sm">
      {trail.map((c, i) => {
        const last = i === trail.length - 1;
        return (
          <span key={`${i}-${c.label}`} className="flex items-center gap-1">
            {i > 0 && <ShortcutIcon name="chevron" className="h-3.5 w-3.5 text-ink/30" />}
            {last ? (
              <span className="rounded-full bg-denim px-3 py-1 font-medium text-cream" aria-current="page">{titleCase(c.label)}</span>
            ) : (
              <button type="button" onClick={() => onGo(c.filters)}
                className="rounded-full px-3 py-1 text-denim ring-1 ring-denim/15 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim">
                {i === 0 ? "Shop" : titleCase(c.label)}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function BrowseSkeleton() {
  return (
    <div className="mt-8 grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-[168px] rounded-[20px] bg-cream-deep" />)}
    </div>
  );
}
