"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { whenWords } from "@/lib/activity/track";
import { displayPhone } from "@/lib/link/identity";
import { ago, fromLabel, fromWords, inFilter, matchesSearch, openedOn, QUOTE_FILTERS, versionTree, type QuoteFilter, type QuoteGroup, type VersionRow } from "@/lib/quotes/group";

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

/** Open tracking (2026-10-27): how often the customer opened a sent version's link and when last; "Not opened" once it is tracked. */
function Opened({ v, now }: { v: OpenInfo; now: Date }) {
  const n = v.openedCount ?? 0;
  if (n > 0) {
    const when = v.lastOpenedAt ? openedOn(v.lastOpenedAt, now) : null;
    return (
      <span className="ql-open" title={openTitle(n, v.lastOpenedAt)}>
        Opened{n > 1 ? ` ×${n}` : ""}
        {when && <span className="ql-open-at">{n > 1 ? `, last ${when}` : ` ${when}`}</span>}
      </span>
    );
  }
  if (v.tracked && v.status === "Sent") return <span className="ql-open none">Not opened</span>;
  return null;
}

/** The Last opened column (2026-10-27): the current version's last open, how many in all under it. */
function LastOpened({ v, now }: { v: OpenInfo; now: Date }) {
  const n = v.openedCount ?? 0;
  if (n > 0) {
    const when = v.lastOpenedAt ? openedOn(v.lastOpenedAt, now) : null;
    return (
      <div className="ql-seen" title={openTitle(n, v.lastOpenedAt)}>
        <span className="at">
          <span className="k">Last opened: </span>
          {when ? when[0].toUpperCase() + when.slice(1) : "Opened"}
        </span>
        <span className="mt">{n === 1 ? "1 open" : `${n} opens`}</span>
      </div>
    );
  }
  return <div className="ql-seen">{v.tracked && v.status === "Sent" && <span className="none">Not opened</span>}</div>;
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

function Chevron() {
  return (
    <svg className="chev" width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** How the versions under a quote are laid out (2026-10-28): newest first, or each under the one it was made from. */
type VersionView = "newest" | "origin";
const VIEW_KEY = "ql-version-view";
// Remembered on this device. Storage can be missing or blocked, and then it is just Newest first.
const readView = (): VersionView => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "origin" ? "origin" : "newest";
  } catch {
    return "newest";
  }
};
const viewListeners = new Set<() => void>();
const subscribeView = (fn: () => void) => {
  viewListeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    viewListeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
};
const saveView = (v: VersionView) => {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {}
  viewListeners.forEach((fn) => fn());
};

/** The All quotes list: quick filters, a search, one row per quote, and its versions folded under it. */
export function QuoteList({ groups }: { groups: QuoteGroup[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QuoteFilter>("all");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const view = useSyncExternalStore(subscribeView, readView, () => "newest" as VersionView);
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
  const counts = useMemo(() => Object.fromEntries(QUOTE_FILTERS.map((f) => [f.key, searched.filter((g) => inFilter(g, f.key)).length])), [searched]);
  const shown = useMemo(() => searched.filter((g) => inFilter(g, filter)), [searched, filter]);
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
            placeholder="Name, Q-number, city or phone"
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
        <div className="ql-view" role="group" aria-label="Versions">
          <span className="k">Versions</span>
          <button type="button" className="ql-f" aria-pressed={view === "newest"} onClick={() => saveView("newest")}>Newest first</button>
          <button type="button" className="ql-f" aria-pressed={view === "origin"} onClick={() => saveView("origin")}>By origin</button>
        </div>
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
        {/* Column headings (2026-10-27); the row content stays self-describing, so screen readers skip them. */}
        <div className="ql-head" aria-hidden>
          <span className="c-who">Customer</span>
          <span>Quote</span>
          <span>Current version</span>
          <span>Last opened</span>
          <span>Attention</span>
          <span className="c-when" title="When the current version was created">Created</span>
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
                  <LastOpened v={latest} now={now} />
                  <div className="ql-flags">
                    {g.linkStatus === "Needs linking" && <span className="chip bad">Needs linking</span>}
                    {g.addressStatus === "Unconfirmed" && <span className="chip warn">Address unconfirmed</span>}
                    {g.addressStatus === "No address" && <span className="chip warn">No address yet</span>}
                  </div>
                  <span className="ql-when" title={dateOf(g.latestAt)}>{ago(g.latestAt, now)}</span>
                </div>
                {expanded && (
                  <ul className="ql-vs" id={`v-${k}`}>
                    {(view === "origin" ? versionTree(g.versions) : g.versions.map((v) => ({ v, depth: 0 }))).map(({ v, depth }) => {
                      // Nested, the indent already shows the source, so only a change keeps its number.
                      const from = view === "origin" ? fromWords(v.changeNo, null) : fromLabel(v, g.versions);
                      return (
                      <li key={v.id} style={depth ? ({ "--d": depth } as CSSProperties) : undefined} className={depth ? "sub" : undefined}>
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
  );
}
