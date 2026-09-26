"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterSheet } from "@/components/FilterSheet";
import { ParsedChips } from "@/components/ParsedChips";
import { ResultCard } from "@/components/ResultCard";
import { activeFilterCount, filtersFromSearchParams, filtersToArgs, filtersToSearchParams, type Filters } from "@/lib/db/filters";
import { getFacets, logSearch, searchStaff, type Facets } from "@/lib/db/queries";
import type { SearchHit } from "@/lib/db/types";
import { supabaseBrowser } from "@/lib/supabase/client";

const PAGE = 30;
const DEBOUNCE_MS = 150;
const CACHE_MAX = 50;

export function SearchView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = useMemo(() => filtersFromSearchParams(new URLSearchParams(params.toString())), [params]);

  const [filters, setFilters] = useState<Filters>(initial);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const cache = useRef(new Map<string, SearchHit[]>());
  const abort = useRef<AbortController | null>(null);
  const supabase = supabaseBrowser();

  useEffect(() => {
    getFacets(supabase).then(setFacets).catch(() => setFacets(null));
  }, [supabase]);

  // keep the URL in sync so results are shareable and survive a PWA relaunch
  useEffect(() => {
    const qs = filtersToSearchParams(filters).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters, pathname, router]);

  const run = useCallback(
    async (f: Filters, p: number, append: boolean) => {
      const args = filtersToArgs(f, p, PAGE);
      const key = JSON.stringify(args);
      const cached = cache.current.get(key);
      if (cached) {
        setHits((prev) => (append ? [...prev, ...cached] : cached));
        return;
      }
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setLoading(true);
      setError(null);
      const t0 = performance.now();
      try {
        const rows = await searchStaff(supabase, args, ac.signal);
        if (ac.signal.aborted) return;
        cache.current.set(key, rows);
        if (cache.current.size > CACHE_MAX) cache.current.delete(cache.current.keys().next().value!);
        setHits((prev) => (append ? [...prev, ...rows] : rows));
        const took = Math.round(performance.now() - t0);
        if (!append && (f.q.trim() || activeFilterCount(f) > 0)) {
          void logSearch(supabase, { query: f.q, filters: args as unknown as Record<string, unknown>, result_count: rows[0]?.total_count ?? 0, took_ms: took });
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

  // debounce: run the settled query, not every keystroke
  useEffect(() => {
    setPage(0);
    const id = setTimeout(() => void run(filters, 0, false), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [filters, run]);

  const total = hits[0]?.total_count ?? 0;
  const parsed = hits[0]?.parsed;
  const nFilters = activeFilterCount(filters);

  return (
    <div>
      <div className="sticky top-[49px] z-10 -mx-4 bg-zinc-50/95 px-4 pb-2 pt-1 backdrop-blur">
        <div className="flex gap-2">
          <input
            type="search"
            inputMode="search"
            autoFocus
            enterKeyHint="search"
            placeholder="Search products, SKUs, “6in click on promo”…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base shadow-sm outline-none focus:border-zinc-500"
          />
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm"
            aria-label="Filters"
          >
            Filters{nFilters ? ` (${nFilters})` : ""}
          </button>
        </div>
        {parsed && <ParsedChips parsed={parsed} />}
      </div>

      {error && <p className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <p className="mt-2 text-xs text-zinc-500" aria-live="polite">
        {loading ? "Searching…" : `${total} result${total === 1 ? "" : "s"}`}
      </p>

      <ul className="mt-2 space-y-2">
        {hits.map((h) => (
          <li key={h.sku}>
            <ResultCard hit={h} />
          </li>
        ))}
      </ul>

      {hits.length < total && (
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            const next = page + 1;
            setPage(next);
            void run(filters, next, true);
          }}
          className="mt-4 w-full rounded-lg border border-zinc-300 bg-white py-2 text-sm"
        >
          Show more ({total - hits.length} left)
        </button>
      )}

      {sheetOpen && (
        <FilterSheet
          filters={filters}
          facets={facets}
          onChange={setFilters}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}
