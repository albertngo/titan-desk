"use client";

import { supplierCategories, supplierTiles, typeOf, typeTiles, type BrowseLevel, type Crumb, type Tile } from "@/lib/browse";
import type { Filters } from "@/lib/db/filters";
import type { BrowseRow } from "@/lib/db/types";
import { ShortcutIcon, type IconName } from "@/components/askbert/ShortcutIcon";

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
      <section aria-label="Browse" className="mt-3">
        <div role="tablist" aria-label="Browse by" className="grid grid-cols-2 rounded-xl bg-white p-1 text-sm ring-1 ring-denim/10">
          {(["supplier", "type"] as const).map((by) => {
            const on = (filters.by ?? "supplier") === by;
            return (
              <button key={by} role="tab" aria-selected={on} type="button" onClick={() => onGo({ ...filters, by })}
                className={`rounded-lg py-1.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim ${
                  on ? "bg-denim text-cream" : "text-denim hover:bg-cream"}`}>
                {by === "supplier" ? "Suppliers" : "Product types"}
              </button>
            );
          })}
        </div>
        {bySupplier ? (
          <TileGrid tiles={supplierTiles(rows)} sub={(t) => t.sub.join(" · ")} onPick={(t) => toSupplier(t.key, filters)} />
        ) : (
          <TileGrid tiles={typeTiles(rows)} icons sub={(t) => `${t.sub.length} supplier${t.sub.length === 1 ? "" : "s"}`} onPick={(t) => toType(t.label, filters)} />
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
      <TileGrid
        tiles={tiles.length > 1 ? [...tiles, all] : tiles}
        icons
        onPick={(t) =>
          onGo({
            ...filters,
            category: t.key === "__all" ? supplierCategories(rows, level.supplier) : typeOf(rowCategory(rows, level.supplier, t.label)).categories,
          })
        }
      />
    );
  }

  return (
    <TileGrid tiles={supplierTiles(rows, level.type)} sub={(t) => t.sub.join(" · ")} onPick={(t) => onGo({ ...filters, supplier: [t.key] })} />
  );
}

/** A category of `supplier` that belongs to the type labelled `label`. */
function rowCategory(rows: BrowseRow[], supplier: string, label: string): string {
  return rows.find((r) => r.supplier === supplier && typeOf(r.category).label === label)?.category ?? label;
}

const TYPE_ICON: Record<string, IconName> = {
  Vinyl: "vinyl",
  Laminate: "laminate",
  "Engineered hardwood": "engineered",
  "Solid hardwood": "solid",
  "Tile & stone": "tile",
  Carpet: "carpet",
  Accessories: "tools",
  "All types": "grid",
};

const counts = (t: Tile) =>
  `${t.collections} collection${t.collections === 1 ? "" : "s"} · ${t.products} product${t.products === 1 ? "" : "s"}`;

/** Suppliers or product types as compact tiles: name, counts, and what is inside, many to a row. */
function TileGrid({ tiles, onPick, sub, icons = false }: {
  tiles: Tile[]; onPick: (t: Tile) => void; sub?: (t: Tile) => string; icons?: boolean;
}) {
  if (!tiles.length) return <p className="py-8 text-center text-sm text-ink/60">Nothing here yet.</p>;
  return (
    <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((t) => {
        const detail = sub?.(t);
        return (
          <li key={t.key}>
            <button type="button" onClick={() => onPick(t)}
              className="group flex h-full w-full items-start gap-2.5 rounded-xl bg-white p-3 text-left ring-1 ring-denim/10 transition hover:ring-denim/30 active:scale-[0.99] active:bg-cream/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim">
              {icons && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky text-denim transition-colors group-hover:bg-denim group-hover:text-cream">
                  <ShortcutIcon name={TYPE_ICON[t.label] ?? "grid"} className="h-[18px] w-[18px]" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug text-ink group-hover:text-denim">{titleCase(t.label)}</span>
                <span className="block text-xs text-ink/55">{counts(t)}</span>
                {detail && <span className="mt-0.5 line-clamp-2 block text-[11px] text-ink/65">{detail}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Supplier names are stored in capitals in Airtable; show them in title case. */
function titleCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/** All › Supplier › Type: each step but the last goes back up. */
export function Crumbs({ trail, onGo }: { trail: Crumb[]; onGo: (f: Filters) => void }) {
  if (!trail.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="mt-3 flex flex-wrap items-center gap-1 text-sm">
      {trail.map((c, i) => {
        const last = i === trail.length - 1;
        return (
          <span key={`${i}-${c.label}`} className="flex items-center gap-1">
            {i > 0 && <ShortcutIcon name="chevron" className="h-3.5 w-3.5 text-ink/30" />}
            {last ? (
              <span className="px-1 font-semibold text-denim" aria-current="page">{titleCase(c.label)}</span>
            ) : (
              <button type="button" onClick={() => onGo(c.filters)}
                className="rounded px-1 text-ink/60 underline-offset-4 transition-colors hover:text-denim hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim">
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
    <div className="mt-3 grid animate-pulse grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
      <div className="col-span-full h-10 rounded-xl bg-cream-deep" />
      {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-[76px] rounded-xl bg-cream-deep" />)}
    </div>
  );
}
