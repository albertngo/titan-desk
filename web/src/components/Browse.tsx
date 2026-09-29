"use client";

import { supplierCategories, supplierTiles, typeOf, typeTiles, type BrowseLevel, type Crumb, type Tile } from "@/lib/browse";
import type { Filters } from "@/lib/db/filters";
import type { BrowseRow } from "@/lib/db/types";

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
  if (!rows) return <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>;

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
      <div className="mt-3">
        <div role="tablist" className="grid grid-cols-2 rounded-lg border border-zinc-300 bg-white p-0.5 text-sm">
          {(["supplier", "type"] as const).map((by) => (
            <button
              key={by}
              role="tab"
              aria-selected={filters.by === by}
              type="button"
              onClick={() => onGo({ ...filters, by })}
              className={`rounded-md py-1.5 ${filters.by === by ? "bg-zinc-900 text-white" : "text-zinc-700"}`}
            >
              {by === "supplier" ? "Suppliers" : "Product types"}
            </button>
          ))}
        </div>
        <TileGrid
          tiles={bySupplier ? supplierTiles(rows) : typeTiles(rows)}
          subLabel={bySupplier ? (t) => t.sub.join(" · ") : (t) => `${t.sub.length} supplier${t.sub.length === 1 ? "" : "s"}`}
          onPick={(t) => (bySupplier ? toSupplier(t.key, filters) : toType(t.label, filters))}
        />
      </div>
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
    <TileGrid
      tiles={supplierTiles(rows, level.type)}
      subLabel={(t) => t.sub.join(" · ")}
      onPick={(t) => onGo({ ...filters, supplier: [t.key] })}
    />
  );
}

/** A category of `supplier` that belongs to the type labelled `label`. */
function rowCategory(rows: BrowseRow[], supplier: string, label: string): string {
  return rows.find((r) => r.supplier === supplier && typeOf(r.category).label === label)?.category ?? label;
}

function TileGrid({ tiles, onPick, subLabel }: { tiles: Tile[]; onPick: (t: Tile) => void; subLabel?: (t: Tile) => string }) {
  if (!tiles.length) return <p className="py-8 text-center text-sm text-zinc-500">Nothing here yet.</p>;
  return (
    <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {tiles.map((t) => (
        <li key={t.key}>
          <button
            type="button"
            onClick={() => onPick(t)}
            className="flex h-full w-full flex-col items-start gap-0.5 rounded-xl border border-zinc-200 bg-white p-3 text-left active:bg-zinc-50"
          >
            <span className="text-sm font-semibold leading-snug">{t.label}</span>
            <span className="text-xs text-zinc-500">
              {t.collections} collection{t.collections === 1 ? "" : "s"} · {t.products} product{t.products === 1 ? "" : "s"}
            </span>
            {subLabel && subLabel(t) && <span className="line-clamp-2 text-[11px] text-zinc-600">{subLabel(t)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** All › Supplier › Type: each step but the last goes back up. */
export function Crumbs({ trail, onGo }: { trail: Crumb[]; onGo: (f: Filters) => void }) {
  if (!trail.length) return null;
  return (
    <nav aria-label="Browse" className="mt-2 flex flex-wrap items-center gap-1 text-sm">
      {trail.map((c, i) => {
        const last = i === trail.length - 1;
        return (
          <span key={`${i}-${c.label}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-zinc-400" aria-hidden>›</span>}
            {last ? (
              <span className="font-semibold" aria-current="page">{c.label}</span>
            ) : (
              <button type="button" onClick={() => onGo(c.filters)} className="text-zinc-600 underline-offset-2 hover:underline">
                {c.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
