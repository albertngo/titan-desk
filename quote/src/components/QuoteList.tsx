"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { whenWords } from "@/lib/activity/track";
import { displayPhone } from "@/lib/link/identity";
import { ago, DEFAULT_SORT, followUpReasons, fromWords, inFilter, quoteValue, reasonWords, isQuoteSort, lastSentVersion, matchesSearch, nextSort, openedOn, opensWords, QUOTE_FILTERS, QUOTE_SORTS, sortGroups, type QuoteFilter, type QuoteGroup, type QuoteSort, type QuoteSortKey, type VersionRow } from "@/lib/quotes/group";
import { money, pulse, valueWords } from "@/lib/quotes/pipeline";

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", year: "numeric" });
const initials = (name: string | null) =>
  (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

type OpenInfo = Pick<VersionRow, "status" | "openedCount" | "lastOpenedAt" | "tracked">;
const openTitle = (n: number, lastOpenedAt: string | null | undefined) =>
  `Customer opened the link ${n === 1 ? "once" : `${n} times`}${lastOpenedAt ? `, last ${whenWords(new Date(lastOpenedAt))}` : ""}`;

/**
 * Open tracking (2026-10-27): how often the customer opened this version's link and when last;
 * "Not opened" once it is tracked. The count always shows, one open included (Albert, 2026-10-31),
 * and each version keeps its own: a new version starts again at none.
 */
function Opened({ v, now }: { v: OpenInfo; now: Date }) {
  const n = v.openedCount ?? 0;
  if (n > 0) {
    const when = v.lastOpenedAt ? openedOn(v.lastOpenedAt, now) : null;
    return (
      <span className="ql-open" title={openTitle(n, v.lastOpenedAt)}>
        Opened · {opensWords(n)}
        {when && <span className="ql-open-at">, last {when}</span>}
      </span>
    );
  }
  if (v.tracked && v.status === "Sent") return <span className="ql-open none">Not opened</span>;
  return null;
}

/**
 * The Last opened column (2026-10-27): the newest version that went out, its last open and how many
 * opens it has. A newer draft doesn't blank it (Albert, 2026-10-31): the customer still has the sent
 * one's link, so that is what shows, labelled with its version when it isn't the current one.
 */
function LastOpened({ versions, now }: { versions: (OpenInfo & Pick<VersionRow, "id" | "version">)[]; now: Date }) {
  const v = lastSentVersion(versions);
  if (!v) return <div className="ql-seen" />;
  const which = v.id !== versions[0]?.id ? <span className="ql-seen-v">v{v.version ?? "?"}</span> : null;
  const n = v.openedCount ?? 0;
  if (n > 0) {
    const when = v.lastOpenedAt ? openedOn(v.lastOpenedAt, now) : null;
    return (
      <div className="ql-seen" title={`${v.version != null ? `v${v.version}: ` : ""}${openTitle(n, v.lastOpenedAt)}`}>
        <span className="at">
          <span className="k">Last opened: </span>
          {when ? when[0].toUpperCase() + when.slice(1) : "Opened"}
        </span>
        <span className="mt">
          {which}
          {opensWords(n)}
        </span>
      </div>
    );
  }
  if (!(v.tracked && v.status === "Sent")) return <div className="ql-seen" />;
  return (
    <div className="ql-seen">
      <span className="none">Not opened</span>
      {which && <span className="mt">{which}</span>}
    </div>
  );
}

/** A version's status as a quiet dot badge; the colour carries the state, the word stays readable. */
function Status({ status }: { status: string | null }) {
  if (!status) return null;
  return (
    <span className={`ql-sb ${status}`}>
      <i aria-hidden />
      {status}
    </span>
  );
}

/**
 * The sort chosen on this device (2026-11-05), so coming back from a quote keeps it. Read as the raw
 * stored text (a stable snapshot); storage that is off or unreadable gives the default.
 */
const SORT_KEY = "ql_sort";
const sortListeners = new Set<() => void>();
const sortStore = {
  read: (): string => {
    try {
      return localStorage.getItem(SORT_KEY) ?? "";
    } catch {
      return "";
    }
  },
  server: (): string => "",
  write: (s: QuoteSort) => {
    try {
      if (s.key === DEFAULT_SORT.key && s.dir === DEFAULT_SORT.dir) localStorage.removeItem(SORT_KEY);
      else localStorage.setItem(SORT_KEY, JSON.stringify(s));
    } catch {
      // Private window or storage blocked: nothing is remembered, and the list keeps the default.
    }
    sortListeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => {
    sortListeners.add(l);
    return () => void sortListeners.delete(l);
  },
};
function parseSort(raw: string): QuoteSort {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    return isQuoteSort(v) ? v : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

const dirWords = (key: QuoteSortKey, dir: "asc" | "desc") => {
  if (key === "customer" || key === "quote") return dir === "asc" ? "A to Z" : "Z to A";
  if (key === "version") return dir === "asc" ? "drafts first" : "outcomes first";
  if (key === "value") return dir === "desc" ? "highest first" : "lowest first";
  if (key === "attention") return dir === "desc" ? "most first" : "least first";
  return dir === "desc" ? "newest first" : "oldest first";
};

/** A column heading that sorts the list (2026-11-05): click to sort by it, click again to turn it round. */
function SortHead({ k, label, sort, onSort, className, title }: { k: QuoteSortKey; label: string; sort: QuoteSort; onSort: (k: QuoteSortKey) => void; className?: string; title?: string }) {
  const on = sort.key === k;
  return (
    <span className={className}>
      <button
        type="button"
        className={`ql-sort${on ? " on" : ""}`}
        onClick={() => onSort(k)}
        title={title ?? `Sort by ${label.toLowerCase()}`}
        aria-label={`${label}${on ? `, sorted ${dirWords(k, sort.dir)}` : ""}. Sort by ${label.toLowerCase()}${on ? `, ${dirWords(k, sort.dir === "asc" ? "desc" : "asc")}` : ""}`}
      >
        <span className="lb">{label}</span>
        <svg className="ar" width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          {on ? (
            <path d={sort.dir === "asc" ? "M5 2 8.5 7h-7z" : "M5 8 1.5 3h7z"} fill="currentColor" />
          ) : (
            <path d="M5 1 7.5 4h-5zM5 9 2.5 6h5z" fill="currentColor" />
          )}
        </svg>
      </button>
    </span>
  );
}

/**
 * The Value column (2026-11-07): the contract once accepted, else what the current version offers, with HST.
 * Several options read as a range, with the recommended price under it.
 */
function Value({ g }: { g: QuoteGroup }) {
  const w = valueWords(quoteValue(g));
  if (!w) return <div className="ql-val none" title="No priced option on the current version">No price</div>;
  return (
    <div className={`ql-val${w.sub === "Contract" ? " won" : ""}`} title={`${w.title}, with HST`}>
      <span className="amt">{w.main}</span>
      {w.sub && <span className="mt">{w.sub}</span>}
    </div>
  );
}

/** One number in the strip; a button when a filter is behind it (pressed again, it shows everything). */
function Tile({ f, k, big, sub, tone, filter, onFilter }: { f?: QuoteFilter; k: string; big: string; sub: string; tone?: string; filter: QuoteFilter; onFilter: (f: QuoteFilter) => void }) {
  const body = (
    <>
      <span className="k">{k}</span>
      <span className="big">{big}</span>
      <span className="sub">{sub}</span>
    </>
  );
  if (!f) return <div className={`qp-t${tone ? ` ${tone}` : ""}`}>{body}</div>;
  const on = filter === f;
  return (
    <button type="button" className={`qp-t${tone ? ` ${tone}` : ""}`} aria-pressed={on} onClick={() => onFilter(on ? "all" : f)} title={on ? "Show all quotes" : `Show ${k.toLowerCase()}`}>
      {body}
    </button>
  );
}

/**
 * The strip above the list (2026-11-07): what is out with customers, what to chase, what came in this month,
 * and what is blocked. Over every quote, whatever the search; a tile with a filter behind it opens it.
 */
function Pulse({ groups, now, filter, onFilter }: { groups: QuoteGroup[]; now: Date; filter: QuoteFilter; onFilter: (f: QuoteFilter) => void }) {
  const p = useMemo(() => pulse(groups, now), [groups, now]);
  const month = now.toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "long" });
  const quotes = (n: number) => `${n} quote${n === 1 ? "" : "s"}`;
  return (
    <div className="qp" role="group" aria-label="At a glance">
      <Tile filter={filter} onFilter={onFilter} f="sent" k="Out with customers" big={money(p.out.value, true)} sub={`${quotes(p.out.count)}${p.out.unpriced ? `, ${p.out.unpriced} unpriced` : ""}`} />
      <Tile filter={filter} onFilter={onFilter} f="followup" k="Follow up" big={String(p.followUp)} sub={p.followUp ? "sent quotes to nudge" : "nothing to chase"} tone={p.followUp ? "warn" : undefined} />
      <Tile filter={filter} onFilter={onFilter} k={`Accepted in ${month}`} big={money(p.acceptedThisMonth.value, true)} sub={quotes(p.acceptedThisMonth.count)} tone="good" />
      <Tile filter={filter} onFilter={onFilter} f="linking" k="Needs linking" big={String(p.linking)} sub={p.linking ? "not on an opportunity yet" : "all linked"} tone={p.linking ? "bad" : undefined} />
    </div>
  );
}

function Chevron() {
  return (
    <svg className="chev" width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The All quotes list: quick filters, a search, one row per quote, and its versions folded under it. */
export function QuoteList({ groups }: { groups: QuoteGroup[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QuoteFilter>("all");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const sortRaw = useSyncExternalStore(sortStore.subscribe, sortStore.read, sortStore.server);
  const sort = useMemo(() => parseSort(sortRaw), [sortRaw]);
  const sortBy = (k: QuoteSortKey) => sortStore.write(nextSort(sort, k));
  const pickSort = (v: string) => {
    const [key, dir] = v.split(":");
    const n = { key, dir };
    if (isQuoteSort(n)) sortStore.write(n);
  };
  const search = useRef<HTMLInputElement>(null);
  const now = useMemo(() => new Date(), []);

  // "/" jumps to the search, as in most list screens; never while typing somewhere else.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searched = useMemo(() => groups.filter((g) => matchesSearch(g, query)), [groups, query]);
  const counts = useMemo(() => Object.fromEntries(QUOTE_FILTERS.map((f) => [f.key, searched.filter((g) => inFilter(g, f.key, now)).length])), [searched, now]);
  const shown = useMemo(() => sortGroups(searched.filter((g) => inFilter(g, filter, now)), sort), [searched, filter, sort, now]);
  const keyOf = (g: QuoteGroup) => g.quoteRecordId ?? g.versions[0].id;
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const reset = () => {
    setQuery("");
    setFilter("all");
    search.current?.focus();
  };

  return (
    <>
    {groups.length > 0 && <Pulse groups={groups} now={now} filter={filter} onFilter={setFilter} />}
    <section className="card ql-card">
      <div className="ql-tools">
        <label className="ql-search">
          <svg className="ql-mag" width="15" height="15" viewBox="0 0 16 16" aria-hidden>
            <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, Q-number, description, city or phone"
            aria-label="Search quotes"
            autoComplete="off"
            enterKeyHint="search"
          />
          {query ? (
            <button type="button" className="ql-clear" onClick={() => setQuery("")} aria-label="Clear search">
              ×
            </button>
          ) : (
            <kbd className="ql-kbd" aria-hidden>/</kbd>
          )}
        </label>
        <div className="ql-filters" role="group" aria-label="Show">
          {QUOTE_FILTERS.map((f) => (
            <button key={f.key} type="button" className="ql-f" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
              <span className="n">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        {/* On a phone the column headings are hidden, so the sort is a menu there (2026-11-05). */}
        <label className="ql-sortpick">
          <span className="k">Sort</span>
          <select value={`${sort.key}:${sort.dir}`} onChange={(e) => pickSort(e.target.value)} aria-label="Sort quotes">
            {QUOTE_SORTS.flatMap((c) =>
              (c.first === "asc" ? (["asc", "desc"] as const) : (["desc", "asc"] as const)).map((d) => (
                <option key={`${c.key}:${d}`} value={`${c.key}:${d}`}>
                  {c.label}, {dirWords(c.key, d)}
                </option>
              )),
            )}
          </select>
        </label>
      </div>

      {groups.length === 0 ? (
        <div className="ql-empty">
          <p className="t">No quotes yet</p>
          <p className="s">Quotes start from a booking in GHL, or from New quote.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="ql-empty">
          <p className="t">Nothing matches{query.trim() ? ` “${query.trim()}”` : ""}{filter !== "all" ? ` in ${QUOTE_FILTERS.find((f) => f.key === filter)!.label}` : ""}</p>
          <button type="button" className="btn small" onClick={reset}>Show all quotes</button>
        </div>
      ) : (
        <>
        {/* Column headings (2026-10-27), sortable since 2026-11-05: each one is a button. */}
        <div className="ql-head">
          {QUOTE_SORTS.map((c) => (
            <SortHead
              key={c.key}
              k={c.key}
              label={c.label}
              sort={sort}
              onSort={sortBy}
              className={c.key === "customer" ? "c-who" : c.key === "created" ? "c-when" : c.key === "value" ? "c-val" : undefined}
              title={c.key === "created" ? "When the current version was created. Sort by it" : undefined}
            />
          ))}
        </div>
        <ul className="ql">
          {shown.map((g) => {
            const k = keyOf(g);
            const latest = g.versions[0];
            const expanded = open.has(k);
            const sub = [displayPhone(g.phone), g.siteCity].filter(Boolean).join(" · ");
            return (
              <li key={k} className={`ql-q${expanded ? " open" : ""}`}>
                <div className="ql-row">
                  <button
                    type="button"
                    className="ql-tog"
                    aria-expanded={expanded}
                    aria-controls={`v-${k}`}
                    aria-label={`${expanded ? "Hide" : "Show"} the versions of ${g.quoteNumber ?? "this quote"}`}
                    onClick={() => toggle(k)}
                  >
                    <Chevron />
                  </button>
                  <span className="ql-av" aria-hidden>{initials(g.customerName)}</span>
                  <div className="ql-who">
                    <Link className="cust" href={`/q/${latest.id}`}>{g.customerName ?? "No customer"}</Link>
                    {/* Quote Description (2026-11-03): tells apart several quotes for one customer at one address. */}
                    {g.description && <span className="ql-desc" title={g.description}>{g.description}</span>}
                    {sub && <span className="mt">{sub}</span>}
                  </div>
                  <div className="ql-num">
                    <span>{g.quoteNumber ?? <span className="faint">No number</span>}</span>
                    {g.projectNumber && <span className="mt">{g.projectNumber}</span>}
                  </div>
                  <div className="ql-latest">
                    <span className="ql-v-n">v{latest.version ?? "?"}</span>
                    <Status status={latest.status} />
                    {latest.basis && <span className={`ql-basis ${latest.basis}`}>{latest.basis}</span>}
                  </div>
                  <Value g={g} />
                  <LastOpened versions={g.versions} now={now} />
                  <div className="ql-flags">
                    {/* Follow up (2026-11-07): why this sent quote wants a nudge. */}
                    {followUpReasons(g, now).map((r) => {
                      const w = reasonWords(r);
                      return (
                        <span key={r.kind} className={`chip ${w.tone}`}>
                          {w.text}
                        </span>
                      );
                    })}
                    {g.outside && <span className="chip warn">{g.outside}</span>}
                    {g.linkStatus === "Needs linking" && <span className="chip bad">Needs linking</span>}
                    {g.addressStatus === "Unconfirmed" && <span className="chip warn">Address unconfirmed</span>}
                    {g.addressStatus === "No address" && <span className="chip warn">No address yet</span>}
                  </div>
                  <span className="ql-when" title={dateOf(g.latestAt)}>{ago(g.latestAt, now)}</span>
                </div>
                {expanded && (
                  <ul className="ql-vs" id={`v-${k}`}>
                    {g.versions.map((v) => {
                      // One working quote (2026-10-30): versions are the send history, newest first; only a change keeps its number.
                      const from = fromWords(v.changeNo, null);
                      return (
                      <li key={v.id}>
                        <Link href={`/q/${v.id}`} className="ql-v">
                          <span className="nm">{v.label ?? `v${v.version ?? "?"}`}</span>
                          {from && <span className="ql-from">{from}</span>}
                          {v.id === latest.id && <span className="ql-cur">Current</span>}
                          <Status status={v.status} />
                          {v.basis && <span className={`ql-basis ${v.basis}`}>{v.basis}</span>}
                          <Opened v={v} now={now} />
                          <span className="mt">
                            {v.optionCount > 0 ? `${v.optionCount} option${v.optionCount === 1 ? "" : "s"}` : "old A/B/C format"} · {dateOf(v.createdTime)}
                          </span>
                        </Link>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        </>
      )}
    </section>
    </>
  );
}
