"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterSheet } from "@/components/FilterSheet";
import { GroupCard } from "@/components/GroupCard";
import { ParsedChips } from "@/components/ParsedChips";
import { ResultCard } from "@/components/ResultCard";
import { activeFilterCount, filtersFromSearchParams, filtersToArgs, filtersToSearchParams, type Filters } from "@/lib/db/filters";
import { getFacets, logSearch, searchStaff, searchStaffGrouped, type Facets } from "@/lib/db/queries";
import type { SearchGroup, SearchHit } from "@/lib/db/types";
import { supabaseBrowser } from "@/lib/supabase/client";

const PAGE = 30;        // products per page in the all-products view
const GROUP_PAGE = 20;  // collections per page in the grouped view
const DEBOUNCE_MS = 150;
const CACHE_MAX = 50;

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

  const cache = useRef(new Map<string, Results>());
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

  // debounce: run the settled query, not every keystroke
  useEffect(() => {
    const id = setTimeout(() => void run(filters, 0, false), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [filters, run]);

  const products = results.kind === "grouped" ? (results.groups[0]?.total_products ?? 0) : (results.hits[0]?.total_count ?? 0);
  const collections = results.kind === "grouped" ? (results.groups[0]?.total_groups ?? 0) : 0;
  const shown = results.kind === "grouped" ? results.groups.length : results.hits.length;
  const total = results.kind === "grouped" ? collections : products;
  const parsed = results.kind === "grouped" ? results.groups[0]?.parsed : results.hits[0]?.parsed;
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
            onChange={(e) => applyFilters({ ...filters, q: e.target.value })}
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

      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
        <p aria-live="polite">
          {loading
            ? "Searching…"
            : results.kind === "grouped"
              ? `${products} product${products === 1 ? "" : "s"} in ${collections} collection${collections === 1 ? "" : "s"}`
              : `${products} result${products === 1 ? "" : "s"}`}
        </p>
        <button
          type="button"
          onClick={() => applyFilters({ ...filters, all: !filters.all })}
          className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700"
        >
          {filters.all ? "Group by collection" : "Show every product"}
        </button>
      </div>

      <ul className="mt-2 space-y-2">
        {results.kind === "grouped"
          ? results.groups.map((g) => (
              <li key={g.group_key}>
                <GroupCard group={g} />
              </li>
            ))
          : results.hits.map((h) => (
              <li key={h.sku}>
                <ResultCard hit={h} />
              </li>
            ))}
      </ul>

      {shown < total && (
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
          Show more ({total - shown} {results.kind === "grouped" ? "collections" : "products"} left)
        </button>
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
