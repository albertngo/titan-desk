"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Browse, Crumbs } from "@/components/Browse";
import { FilterSheet } from "@/components/FilterSheet";
import { ShortcutIcon } from "@/components/askbert/ShortcutIcon";
import { ParsedChips } from "@/components/ParsedChips";
import { GroupCard } from "@/components/GroupCard";
import { ResultCard, ResultCardSkeleton } from "@/components/ResultCard";
import { askBert } from "@/lib/askbert-bridge";
import { browseLevel, crumbs } from "@/lib/browse";
import { activeFilterCount, EMPTY_FILTERS, filtersFromSearchParams, filtersToArgs, filtersToSearchParams, type Filters } from "@/lib/db/filters";
import { getBrowse, getFacets, logSearch, searchStaff, searchStaffGrouped, type Facets } from "@/lib/db/queries";
import type { BrowseRow, SearchGroup, SearchHit } from "@/lib/db/types";
import { supabaseBrowser } from "@/lib/supabase/client";

const PAGE = 30;        // products per page in the all-products view
const GROUP_PAGE = 20;  // collections per page in the grouped view
const DEBOUNCE_MS = 150;
const CACHE_MAX = 50;
const PROMO_SHELF = 6;  // collections in the home page's "On promo now" list

type Results = { kind: "flat"; hits: SearchHit[] } | { kind: "grouped"; groups: SearchGroup[] };

function emptyResults(all: boolean): Results {
  return all ? { kind: "flat", hits: [] } : { kind: "grouped", groups: [] };
}

/** "Show more" appends a page of the same kind; anything else replaces what is shown. */
function merge(prev: Results, next: Results, append: boolean): Results {
  if (!append) return next;
  if (prev.kind === "flat" && next.kind === "flat") return { kind: "flat", hits: [...prev.hits, ...next.hits] };
  if (prev.kind === "grouped" && next.kind === "grouped") return { kind: "grouped", groups: [...prev.groups, ...next.groups] };
  return next;
}

export function SearchView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = useMemo(() => filtersFromSearchParams(new URLSearchParams(params.toString())), [params]);

  const [filters, setFilters] = useState<Filters>(initial);
  const [results, setResults] = useState<Results>(() => emptyResults(initial.all));
  const [page, setPage] = useState(0);
  // any filter change starts again from the first page (the debounced effect below runs the query)
  const applyFilters = useCallback((f: Filters) => {
    setPage(0);
    setFilters(f);
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // browse counts: undefined while loading, null if unavailable (then the page lists collections as before)
  const [browse, setBrowse] = useState<BrowseRow[] | null | undefined>(undefined);
  // the home page's promo list: undefined loading · null failed · [] nothing on promo
  const [promos, setPromos] = useState<SearchGroup[] | null | undefined>(undefined);

  const cache = useRef(new Map<string, Results>());
  const abort = useRef<AbortController | null>(null);
  const supabase = supabaseBrowser();

  useEffect(() => {
    getFacets(supabase).then(setFacets).catch(() => setFacets(null));
    getBrowse(supabase).then(setBrowse).catch(() => setBrowse(null));
    searchStaffGrouped(supabase, filtersToArgs({ ...EMPTY_FILTERS, q: "on promo" }, 0, PROMO_SHELF))
      .then((groups) => setPromos(groups.filter((g) => g.any_promo)))
      .catch(() => setPromos(null));
  }, [supabase]);

  // keep the URL in sync so results are shareable and survive a PWA relaunch
  useEffect(() => {
    const qs = filtersToSearchParams(filters).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters, pathname, router]);

  const run = useCallback(
    async (f: Filters, p: number, append: boolean) => {
      const grouped = !f.all;
      const args = filtersToArgs(f, p, grouped ? GROUP_PAGE : PAGE);
      const key = JSON.stringify([grouped, args]);
      const cached = cache.current.get(key);
      if (cached) {
        setResults((prev) => merge(prev, cached, append));
        return;
      }
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setLoading(true);
      setError(null);
      const t0 = performance.now();
      try {
        let next: Results;
        try {
          next = grouped
            ? { kind: "grouped", groups: await searchStaffGrouped(supabase, args, ac.signal) }
            : { kind: "flat", hits: await searchStaff(supabase, args, ac.signal) };
        } catch (e) {
          // The page can deploy a moment before migration 005 reaches the database (and a
          // preview always runs against production's): PostgREST answers PGRST202 for an
          // unknown function. Show the flat list rather than an error.
          if (!grouped || (e as { code?: string }).code !== "PGRST202") throw e;
          next = { kind: "flat", hits: await searchStaff(supabase, filtersToArgs(f, p, PAGE), ac.signal) };
        }
        if (ac.signal.aborted) return;
        cache.current.set(key, next);
        if (cache.current.size > CACHE_MAX) cache.current.delete(cache.current.keys().next().value!);
        setResults((prev) => merge(prev, next, append));
        const took = Math.round(performance.now() - t0);
        if (!append && (f.q.trim() || activeFilterCount(f) > 0)) {
          const count = next.kind === "grouped" ? (next.groups[0]?.total_products ?? 0) : (next.hits[0]?.total_count ?? 0);
          void logSearch(supabase, { query: f.q, filters: args as unknown as Record<string, unknown>, result_count: count, took_ms: took });
        }
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    },
    [supabase],
  );

  // search box empty and at most a supplier / product type chosen: show the browse tiles instead
  const level = browse === null ? null : browseLevel(filters);
  const trail = crumbs(filters, browse ?? []);
  const browsing = level !== null;

  // debounce: run the settled query, not every keystroke (nothing to run while browsing)
  useEffect(() => {
    if (browsing) return;
    const id = setTimeout(() => void run(filters, 0, false), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [filters, run, browsing]);

  const products = results.kind === "grouped" ? (results.groups[0]?.total_products ?? 0) : (results.hits[0]?.total_count ?? 0);
  const collections = results.kind === "grouped" ? (results.groups[0]?.total_groups ?? 0) : 0;
  const shown = results.kind === "grouped" ? results.groups.length : results.hits.length;
  const total = results.kind === "grouped" ? collections : products;
  const parsed = results.kind === "grouped" ? results.groups[0]?.parsed : results.hits[0]?.parsed;
  const nFilters = activeFilterCount(filters);

  const home = level?.level === "home";
  const shownCount = results.kind === "grouped" ? results.groups.length : results.hits.length;
  const query = filters.q.trim();

  return (
    <div>
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 bg-cream/95 px-4 pb-2 pt-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-white px-3 ring-1 ring-denim/15 transition focus-within:ring-2 focus-within:ring-denim">
            <ShortcutIcon name="search" className="h-[18px] w-[18px] shrink-0 text-denim/60" />
            <input
              type="search"
              inputMode="search"
              autoFocus={!home}
              enterKeyHint="search"
              aria-label="Search the catalogue"
              placeholder="Search products, SKUs, “6in click on promo”…"
              value={filters.q}
              onChange={(e) => applyFilters({ ...filters, q: e.target.value })}
              className="h-10 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink/40"
            />
          </label>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim ${
              nFilters ? "bg-denim text-cream ring-denim hover:bg-denim-dark" : "bg-white text-denim ring-denim/15 hover:bg-cream"}`}
          >
            <ShortcutIcon name="filter" className="h-4 w-4" />
            Filters{nFilters ? ` (${nFilters})` : ""}
          </button>
        </div>
        <QuickFilters filters={filters} onChange={applyFilters} />
        {parsed && <ParsedChips parsed={parsed} />}
      </div>

      <Crumbs trail={trail} onGo={applyFilters} />

      {browsing ? (
        <>
          <Browse level={level} rows={browse ?? undefined} filters={filters} onGo={applyFilters} />
          {home && <PromoList promos={promos} onSeeAll={() => applyFilters({ ...EMPTY_FILTERS, q: "on promo" })} />}
        </>
      ) : (
        <section aria-label="Results">
          {error && <p className="mt-3 rounded-xl bg-peach px-3 py-2 text-sm text-campfire-dark">Search failed: {error}</p>}

          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink/60">
            <p aria-live="polite">
              {loading
                ? "Searching…"
                : results.kind === "grouped"
                  ? <><strong className="font-semibold text-ink">{products}</strong> product{products === 1 ? "" : "s"} in {collections} collection{collections === 1 ? "" : "s"}</>
                  : <><strong className="font-semibold text-ink">{products}</strong> result{products === 1 ? "" : "s"}</>}
            </p>
            <div role="group" aria-label="Show results as" className="inline-flex shrink-0 rounded-lg bg-white p-0.5 ring-1 ring-denim/10">
              {([false, true] as const).map((all) => {
                const on = filters.all === all;
                return (
                  <button key={String(all)} type="button" aria-pressed={on} onClick={() => applyFilters({ ...filters, all })}
                    className={`whitespace-nowrap rounded-md px-2.5 py-1 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim ${
                      on ? "bg-denim text-cream" : "text-denim hover:bg-cream"}`}>
                    {all ? "All products" : "Collections"}
                  </button>
                );
              })}
            </div>
          </div>

          {loading && shownCount === 0 ? (
            <ul className="mt-2 space-y-2">
              {Array.from({ length: 6 }, (_, i) => <li key={i}><ResultCardSkeleton /></li>)}
            </ul>
          ) : shownCount === 0 && !loading && !error ? (
            <div className="mt-6 flex flex-col items-center rounded-xl bg-white px-4 py-8 text-center ring-1 ring-denim/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
              <img src="/brand/titan-mascot-blue.png" alt="" className="h-14 w-14 object-contain opacity-80" />
              <p className="mt-2 font-semibold text-denim">Nothing in the catalogue matches.</p>
              <p className="mt-1 text-sm text-ink/60">Try fewer words or clear a filter, or ask Bert to loosen the search.</p>
              {query && (
                <button type="button" onClick={() => askBert(`Find me: ${query}`)}
                  className="mt-4 rounded-lg bg-denim px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-denim-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim">
                  Ask Bert about &ldquo;{query}&rdquo;
                </button>
              )}
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {results.kind === "grouped"
                ? results.groups.map((g) => <li key={g.group_key}><GroupCard group={g} /></li>)
                : results.hits.map((h) => <li key={h.sku}><ResultCard hit={h} /></li>)}
            </ul>
          )}

          {shown < total && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                void run(filters, next, true);
              }}
              className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-denim ring-1 ring-denim/15 transition hover:ring-denim/40 active:bg-cream disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim"
            >
              {loading ? "Loading…" : `Show more (${total - shown} ${results.kind === "grouped" ? "collections" : "products"} left)`}
            </button>
          )}
        </section>
      )}

      {sheetOpen && (
        <FilterSheet
          filters={filters}
          facets={facets}
          onChange={applyFilters}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

const QUICK = [
  { key: "waterproof", label: "Waterproof" },
  { key: "radiant", label: "Radiant heat" },
  { key: "pet", label: "Pet friendly" },
  { key: "hide", label: "Available only" },
] as const;

/** The yes/no filters as one-tap chips under the search box; the rest stay in Filters. */
function QuickFilters({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  return (
    <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
      {QUICK.map(({ key, label }) => {
        const on = filters[key];
        return (
          <button key={key} type="button" aria-pressed={on} onClick={() => onChange({ ...filters, [key]: !on })}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim ${
              on ? "bg-denim text-cream" : "bg-white text-ink ring-1 ring-denim/15 hover:ring-denim/40"}`}>
            {on && <span aria-hidden>✓ </span>}{label}
          </button>
        );
      })}
    </div>
  );
}

/** Home page: collections with a live promo, straight from the catalogue, as the same list rows. */
function PromoList({ promos, onSeeAll }: { promos: SearchGroup[] | null | undefined; onSeeAll: () => void }) {
  if (promos === null || (promos && promos.length === 0)) return null;
  return (
    <section aria-labelledby="promo-title" className="mt-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="promo-title" className="flex items-center gap-2 font-display text-lg font-bold text-denim">
          On promo now
          <span className="rounded-md bg-campfire-dark px-1.5 py-0.5 font-brand text-[11px] font-semibold text-cream">Live</span>
        </h2>
        <button type="button" onClick={onSeeAll} className="text-sm font-medium text-denim underline-offset-4 hover:underline">
          See all promos
        </button>
      </div>
      <ul className="mt-2 space-y-2">
        {promos === undefined
          ? Array.from({ length: 3 }, (_, i) => <li key={i}><ResultCardSkeleton /></li>)
          : promos.map((g) => <li key={g.group_key}><GroupCard group={g} /></li>)}
      </ul>
    </section>
  );
}
