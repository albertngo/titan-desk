"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Browse, Crumbs } from "@/components/Browse";
import { FilterSheet } from "@/components/FilterSheet";
import { ShortcutIcon } from "@/components/askbert/ShortcutIcon";
import { ParsedChips } from "@/components/ParsedChips";
import { ShopCard, ShopCardSkeleton } from "@/components/ShopCard";
import { askBert } from "@/lib/askbert-bridge";
import { browseLevel, crumbs } from "@/lib/browse";
import { activeFilterCount, EMPTY_FILTERS, filtersFromSearchParams, filtersToArgs, filtersToSearchParams, type Filters } from "@/lib/db/filters";
import { getBrowse, getFacets, logSearch, searchStaff, searchStaffGrouped, type Facets } from "@/lib/db/queries";
import type { BrowseRow, SearchGroup, SearchHit } from "@/lib/db/types";
import { fromGroup, fromHit, type ShopItem } from "@/lib/shop";
import { supabaseBrowser } from "@/lib/supabase/client";
import { LIFT } from "@/lib/ui";

const PAGE = 30;        // products per page in the all-products view
const GROUP_PAGE = 20;  // collections per page in the grouped view
const DEBOUNCE_MS = 150;
const CACHE_MAX = 50;
const PROMO_SHELF = 10; // collections on the home page's "On promo now" shelf

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
  // the home page's promo shelf: undefined loading · null failed · [] nothing on promo
  const [promos, setPromos] = useState<ShopItem[] | null | undefined>(undefined);

  const cache = useRef(new Map<string, Results>());
  const abort = useRef<AbortController | null>(null);
  const supabase = supabaseBrowser();

  useEffect(() => {
    getFacets(supabase).then(setFacets).catch(() => setFacets(null));
    getBrowse(supabase).then(setBrowse).catch(() => setBrowse(null));
    searchStaffGrouped(supabase, filtersToArgs({ ...EMPTY_FILTERS, q: "on promo" }, 0, PROMO_SHELF))
      .then((groups) => setPromos(groups.filter((g) => g.any_promo).map(fromGroup)))
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
  const tiles: ShopItem[] = results.kind === "grouped" ? results.groups.map(fromGroup) : results.hits.map(fromHit);
  const query = filters.q.trim();

  return (
    <div>
      {home && (
        <div className="pb-2 pt-4 sm:pt-8">
          <h1 className="max-w-[18ch] font-display text-[32px] font-bold leading-[1.05] tracking-[-0.015em] text-denim [text-wrap:balance] sm:text-[44px]">
            Find the right floor, fast.
          </h1>
          <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-ink/70">
            Search the whole Titan catalogue by name, SKU or what you need, like &ldquo;6in click on promo&rdquo;. Or browse by type and supplier below.
          </p>
        </div>
      )}

      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 -mx-4 bg-cream/95 px-4 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className={`flex items-center gap-2 rounded-full bg-white py-1.5 pl-5 pr-1.5 ring-1 ring-denim/15 transition focus-within:ring-2 focus-within:ring-denim ${LIFT}`}>
          <ShortcutIcon name="search" className="h-5 w-5 shrink-0 text-denim/60" />
          <input
            type="search"
            inputMode="search"
            autoFocus={!home}
            enterKeyHint="search"
            aria-label="Search the catalogue"
            placeholder="Search products, SKUs, “6in click on promo”"
            value={filters.q}
            onChange={(e) => applyFilters({ ...filters, q: e.target.value })}
            className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink/40"
          />
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim ${
              nFilters ? "bg-denim text-cream hover:bg-denim-dark" : "bg-cream text-denim hover:bg-cream-deep"}`}
          >
            <ShortcutIcon name="filter" className="h-4 w-4" />
            Filters{nFilters ? ` · ${nFilters}` : ""}
          </button>
        </div>
        {parsed && <ParsedChips parsed={parsed} />}
      </div>

      <Crumbs trail={trail} onGo={applyFilters} />

      {browsing ? (
        <>
          <Browse level={level} rows={browse ?? undefined} filters={filters} onGo={applyFilters} />
          {home && <PromoShelf promos={promos} />}
        </>
      ) : (
        <section aria-label="Results" className="mt-5">
          {error && <p className="mb-4 rounded-xl bg-peach px-4 py-3 text-sm text-campfire-dark">Search failed: {error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm text-ink/70">
              {loading
                ? "Searching…"
                : results.kind === "grouped"
                  ? <><strong className="font-semibold text-ink">{collections}</strong> collection{collections === 1 ? "" : "s"} · {products} product{products === 1 ? "" : "s"}</>
                  : <><strong className="font-semibold text-ink">{products}</strong> product{products === 1 ? "" : "s"}</>}
            </p>
            <div role="group" aria-label="Show results as" className="inline-flex rounded-full bg-white p-1 text-[13px] ring-1 ring-denim/10">
              {([false, true] as const).map((all) => {
                const on = filters.all === all;
                return (
                  <button key={String(all)} type="button" aria-pressed={on} onClick={() => applyFilters({ ...filters, all })}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim ${
                      on ? "bg-denim text-cream" : "text-denim hover:bg-cream"}`}>
                    <ShortcutIcon name={all ? "list" : "grid"} className="h-4 w-4" />
                    {all ? "Every colour" : "Collections"}
                  </button>
                );
              })}
            </div>
          </div>

          {loading && tiles.length === 0 ? (
            <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-hidden>
              {Array.from({ length: 10 }, (_, i) => <li key={i}><ShopCardSkeleton /></li>)}
            </ul>
          ) : tiles.length === 0 && !loading && !error ? (
            <div className="mx-auto mt-10 flex max-w-md flex-col items-center text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
              <img src="/brand/titan-mascot-blue.png" alt="" className="h-24 w-24 object-contain opacity-80" />
              <p className="mt-4 font-display text-xl font-bold text-denim">Nothing in the catalogue matches.</p>
              <p className="mt-1 text-sm text-ink/65">Try fewer words or clear a filter. Or ask Bert, who can loosen the search for you.</p>
              {query && (
                <button type="button" onClick={() => askBert(`Find me: ${query}`)}
                  className="mt-5 rounded-full bg-denim px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-denim-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim">
                  Ask Bert about &ldquo;{query}&rdquo;
                </button>
              )}
            </div>
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {tiles.map((t) => (
                <li key={t.key}>
                  <ShopCard item={t} onAsk={askBert} />
                </li>
              ))}
            </ul>
          )}

          {shown < total && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  void run(filters, next, true);
                }}
                className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-denim ring-1 ring-denim/20 transition hover:ring-denim/50 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim"
              >
                {loading ? "Loading…" : `Show more · ${total - shown} ${results.kind === "grouped" ? "collections" : "products"} left`}
              </button>
            </div>
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

/** Home page shelf: collections with a live promo, straight from the catalogue. */
function PromoShelf({ promos }: { promos: ShopItem[] | null | undefined }) {
  if (promos === null || (promos && promos.length === 0)) return null;
  return (
    <section aria-labelledby="promo-title" className="mt-14">
      <div className="flex items-baseline gap-3">
        <h2 id="promo-title" className="font-display text-2xl font-bold tracking-[-0.01em] text-denim">On promo now</h2>
        <span className="rounded-md bg-campfire-dark px-2 py-0.5 text-[11px] font-semibold text-cream">Live</span>
      </div>
      <p className="mt-1 text-sm text-ink/60">Collections with a promo running today. Tap one for its colours and prices.</p>
      <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {promos === undefined
          ? Array.from({ length: 5 }, (_, i) => <li key={i}><ShopCardSkeleton /></li>)
          : promos.map((t) => <li key={t.key}><ShopCard item={t} onAsk={askBert} /></li>)}
      </ul>
    </section>
  );
}
