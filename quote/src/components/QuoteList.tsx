"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { whenWords } from "@/lib/activity/track";
import { displayPhone } from "@/lib/link/identity";
import { ago, DEFAULT_SORT, followUpReasons, fromWords, inFilter, quoteValue, reasonWords, isQuoteSort, lastSentVersion, matchesSearch, nextSort, openedOn, opensWords, QUOTE_FILTERS, QUOTE_SORTS, sortGroups, type QuoteFilter, type QuoteGroup, type QuoteSort, type QuoteSortKey, type VersionRow } from "@/lib/quotes/group";
import { money, pulse, valueWords } from "@/lib/quotes/pipeline";
import { quoteAppointmentsAction } from "@/app/actions/appointments";
import { APPT_FILTERS, apptWords, inApptFilter, type ApptFilter } from "@/lib/quotes/appts";
import type { QuoteApptsResult } from "@/lib/quotes/appointments";
import { projectStatusesAction } from "@/app/actions/projects";
import { lastAsked } from "@/lib/projects/request";
import { collectGroup, COLLECT_GROUPS, isFinished, projectPlan, secondPaymentDue, type ProjectsResult, type ProjectStatus } from "@/lib/projects/status";
import { CollectStrip, DealTag, ProjectLine } from "./ProjectBits";
import { DraftHistory, useSendHistory, VersionHistory } from "./QuoteHistory";

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

/**
 * A quote's versions, newest first (one working quote, 2026-10-30: versions are the send history; only a change keeps its
 * number), each with its own history right under its line (Albert, 2026-11-20).
 */
function Versions({ id, versions, latestId, quoteRecordId, now }: { id: string; versions: VersionRow[]; latestId: string; quoteRecordId: string | null; now: Date }) {
  const { history, error, loading } = useSendHistory(quoteRecordId, versions.map((v) => `${v.id}:${v.status ?? ""}`).join(","));
  return (
    <ul className="ql-vs" id={id}>
      {versions.map((v) => {
        const from = fromWords(v.changeNo, null);
        const row = history?.rows.find((r) => r.id === v.id) ?? null;
        const draft = history?.draft?.id === v.id ? history.draft : null;
        return (
          <li key={v.id}>
            <Link href={`/q/${v.id}`} className="ql-v">
              <span className="nm">{v.label ?? `v${v.version ?? "?"}`}</span>
              {from && <span className="ql-from">{from}</span>}
              {v.id === latestId && <span className="ql-cur">Current</span>}
              <Status status={v.status} />
              {v.basis && <span className={`ql-basis ${v.basis}`}>{v.basis}</span>}
              <Opened v={v} now={now} />
              <span className="mt">
                {v.optionCount > 0 ? `${v.optionCount} option${v.optionCount === 1 ? "" : "s"}` : "old A/B/C format"} · {dateOf(v.createdTime)}
              </span>
            </Link>
            {row && <VersionHistory row={row} />}
            {draft && <DraftHistory draft={draft} />}
          </li>
        );
      })}
      {loading && <li className="qh-wait faint">Reading the history…</li>}
      {error && <li className="qh-wait bad">{error}</li>}
    </ul>
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
  /** Appointments (Albert, 2026-11-26): read from GHL once the list has drawn; the filter row waits for them. */
  const [appts, setAppts] = useState<QuoteApptsResult | null>(null);
  const [apptFilter, setApptFilter] = useState<ApptFilter>("any");
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

  useEffect(() => {
    let live = true;
    quoteAppointmentsAction()
      .then((r) => live && setAppts(r))
      .catch(() => live && setAppts({ ok: false, message: "Appointments couldn't be read. Try again in a moment." }));
    return () => {
      live = false;
    };
  }, []);
  const apptOf = (g: QuoteGroup) => (appts?.ok && g.quoteRecordId ? appts.byQuote[g.quoteRecordId] : null);

  /**
   * Won and finished projects (Albert, 2026-11-27): each linked quote's Notion project and its payments, read once the
   * list has drawn, again on Refresh, and again when the tab comes back after five minutes or more. Live every time.
   */
  const [projects, setProjects] = useState<ProjectsResult | null>(null);
  const [projBusy, setProjBusy] = useState(false);
  const [projAt, setProjAt] = useState<Date | null>(null);
  const fetchProjects = () =>
    projectStatusesAction()
      .then((r) => {
        setProjects(r);
        setProjAt(new Date());
      })
      .catch(() => setProjects({ ok: false, message: "Notion projects couldn't be read. Try again in a moment." }))
      .finally(() => setProjBusy(false));
  const readProjects = () => {
    setProjBusy(true);
    void fetchProjects();
  };
  useEffect(() => {
    void fetchProjects();
  }, []);
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === "visible" && projAt && Date.now() - projAt.getTime() > 5 * 60_000) readProjects();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projAt]);
  const today = projects?.ok ? projects.today : null;
  const projOf = (g: QuoteGroup): ProjectStatus | null => (projects?.ok && g.quoteRecordId ? (projects.byQuote[g.quoteRecordId] ?? null) : null);
  const finishedOf = (g: QuoteGroup) => (today ? isFinished(projOf(g), today) : false);
  const planOf = (g: QuoteGroup) => {
    const p = projOf(g);
    return p ? projectPlan({ total: g.contractTotal ?? null, stages: g.contractStages ?? [] }, p) : null;
  };
  const requestsOf = (g: QuoteGroup) => (projects?.ok && g.quoteRecordId ? (projects.requests[g.quoteRecordId] ?? []) : []);
  const askedFinal = (g: QuoteGroup) => Boolean(lastAsked(requestsOf(g), "final"));
  /** Request payment (2026-11-27): the second on a Won row that is due it, the final on a Complete row with a balance. */
  const requestFor = (g: QuoteGroup) => {
    if (!projects?.ok || !projView) return null;
    const plan = planOf(g);
    const kind = projView === "complete" ? (plan && plan.balance > 0 ? "final" : null) : secondDue(g) && (plan?.stages.length ?? 0) >= 3 ? "second" : null;
    return kind ? { kind, versionId: g.versions[0].id, requests: requestsOf(g), live: projects.requestsLive, onDone: readProjects } as const : null;
  };
  const secondDue = (g: QuoteGroup) => Boolean(today && g.projectNumber && secondPaymentDue(projOf(g), planOf(g), today));
  const inAppt = (g: QuoteGroup, f: ApptFilter) => f === "any" || (appts?.ok === true && inApptFilter(apptOf(g), f));

  const searched = useMemo(() => groups.filter((g) => matchesSearch(g, query)), [groups, query]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const counts = useMemo(() => Object.fromEntries(QUOTE_FILTERS.map((f) => [f.key, searched.filter((g) => inFilter(g, f.key, now, finishedOf(g)) && inAppt(g, apptFilter)).length])), [searched, now, appts, apptFilter, projects]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const apptCounts = useMemo(() => Object.fromEntries(APPT_FILTERS.map((f) => [f.key, searched.filter((g) => inFilter(g, filter, now, finishedOf(g)) && inAppt(g, f.key)).length])), [searched, now, appts, filter, projects]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shown = useMemo(() => sortGroups(searched.filter((g) => inFilter(g, filter, now, finishedOf(g)) && inAppt(g, apptFilter)), sort), [searched, filter, sort, now, appts, apptFilter, projects]);
  /** The Won and Complete views (2026-11-27): rows in sections, what to do next first. Every other view is one list. */
  const projView = filter === "won" || filter === "complete" ? filter : null;
  const sections = ((): { key: string; title: string | null; rule: string | null; rows: QuoteGroup[] }[] => {
    if (!projView || !projects?.ok) return [{ key: "all", title: null, rule: null, rows: shown }];
    if (projView === "won") {
      const due = shown.filter(secondDue);
      const asked = due.filter((g) => Boolean(lastAsked(requestsOf(g), "second")));
      return [
        { key: "second", title: "Ready for second payment", rule: "On site since the Confirmed Start Date; the contract's payment plan puts the second payment on day one, and it isn't in the Master Payments Log yet", rows: due.filter((g) => !asked.includes(g)) },
        { key: "asked", title: "Second payment requested", rule: "Asked from the app; it leaves when the payment is in the Master Payments Log", rows: asked },
        { key: "rest", title: "Not started, or paid up to date", rule: "Nothing to chase yet", rows: shown.filter((g) => !due.includes(g)) },
      ].filter((x) => x.rows.length > 0);
    }
    return COLLECT_GROUPS.map((c) => ({ key: c.key, title: c.title, rule: c.rule, rows: shown.filter((g) => {
      const p = projOf(g);
      return p ? collectGroup(p, planOf(g), askedFinal(g)) === c.key : c.key === "waiting";
    }) })).filter((x) => x.rows.length > 0);
  })();
  const collect = (() => {
    const won = searched.filter((g) => inFilter(g, "won", now, finishedOf(g)));
    const done = searched.filter((g) => inFilter(g, "complete", now, finishedOf(g)));
    const add = (gs: QuoteGroup[], pick: (g: QuoteGroup) => number | null | undefined) => ({ count: gs.length, sum: gs.reduce((a, g) => a + (pick(g) ?? 0), 0) });
    const owing = done.filter((g) => (planOf(g)?.balance ?? 0) > 0);
    const group = (k: string) => owing.filter((g) => collectGroup(projOf(g)!, planOf(g), askedFinal(g)) === k);
    const week = today ? new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10) : null;
    return {
      left: add(owing, (g) => planOf(g)?.balance),
      ready: add(group("ready"), (g) => planOf(g)?.balance),
      requested: add(group("requested"), (g) => planOf(g)?.balance),
      waiting: add(group("waiting"), (g) => planOf(g)?.balance),
      second: add(won.filter(secondDue), (g) => planOf(g)?.secondOwing),
      starting: week && today ? won.filter((g) => {
        const s = projOf(g)?.start;
        return Boolean(s && s > today && s <= week);
      }).length : 0,
    };
  })();
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
    setApptFilter("any");
    search.current?.focus();
  };

  return (
    <>
    {groups.length > 0 && <Pulse groups={groups} now={now} filter={filter} onFilter={setFilter} />}
    {projView && (
      <CollectStrip
        view={projView}
        {...collect}
        busy={projBusy}
        onRefresh={readProjects}
        read={projects === null || (projBusy && !projAt) ? "Reading the Notion projects…" : !projects.ok ? projects.message : `Read ${projAt ? projAt.toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }) : ""}${projects.paymentsRead ? "" : ". Payments couldn't be read"}`}
      />
    )}
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
        {/* Appointments (Albert, 2026-11-26): had one, and which: in-home, in-store or both. Booked ones still ahead count. */}
        <div className="ql-filters ql-appt-f" role="group" aria-label="Appointment">
          <span className="k">Appointment</span>
          {appts === null ? (
            <span className="faint">Reading GHL…</span>
          ) : !appts.ok ? (
            <span className="faint" title={appts.message}>Couldn&apos;t read GHL</span>
          ) : (
            APPT_FILTERS.map((f) => (
              <button key={f.key} type="button" className="ql-f" aria-pressed={apptFilter === f.key} onClick={() => setApptFilter(f.key)}>
                {f.label}
                <span className="n">{apptCounts[f.key]}</span>
              </button>
            ))
          )}
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
          <p className="t">Nothing matches{query.trim() ? ` “${query.trim()}”` : ""}{filter !== "all" ? ` in ${QUOTE_FILTERS.find((f) => f.key === filter)!.label}` : ""}{apptFilter !== "any" ? ` with ${APPT_FILTERS.find((f) => f.key === apptFilter)!.label.toLowerCase()}` : ""}</p>
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
          {sections.map((sec) => [
            sec.title ? (
              <li key={`h-${sec.key}`} className="pj-sec">
                <h2>{sec.title}</h2>
                <span className="n">{sec.rows.length}</span>
                {sec.rule && <span className="rule">{sec.rule}</span>}
              </li>
            ) : null,
            ...sec.rows.map((g) => {
            const k = keyOf(g);
            const latest = g.versions[0];
            const expanded = open.has(k);
            const sub = [displayPhone(g.phone), g.siteCity].filter(Boolean).join(" · ");
            const proj = g.projectNumber ? projOf(g) : null;
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
                    <span className="ql-name">
                      <Link className="cust" href={`/q/${latest.id}`}>{g.customerName ?? "No customer"}</Link>
                      {/* Invoice or Cash (2026-11-27): Notion's Type of Deal, beside the name, plain grey. */}
                      {proj && <DealTag deal={proj.deal} />}
                    </span>
                    {/* Quote Description (2026-11-03): tells apart several quotes for one customer at one address. */}
                    {g.description && <span className="ql-desc" title={g.description}>{g.description}</span>}
                    {sub && <span className="mt">{sub}</span>}
                    {appts?.ok && apptWords(apptOf(g), appts.today).length > 0 && (
                      <span className="ql-appt">
                        {apptWords(apptOf(g), appts.today).map((a) => (
                          <span key={a.where} className={`ql-appt-i ${a.where}${a.ahead ? " ahead" : ""}`}>{a.text}</span>
                        ))}
                      </span>
                    )}
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
                    {/* Ready for second payment (2026-11-27): on site, and the day-one payment isn't in yet. */}
                    {secondDue(g) && <span className="chip accent">Second payment due</span>}
                    {g.linkStatus === "Needs linking" && <span className="chip bad">Needs linking</span>}
                    {g.addressStatus === "Unconfirmed" && <span className="chip warn">Address unconfirmed</span>}
                    {g.addressStatus === "No address" && <span className="chip warn">No address yet</span>}
                  </div>
                  <span className="ql-when" title={dateOf(g.latestAt)}>{ago(g.latestAt, now)}</span>
                </div>
                {/* Won and finished projects (2026-11-27): the Notion project's line under the row. */}
                {projView && proj && today && g.projectNumber && <ProjectLine id={k} p={proj} plan={planOf(g)} today={today} name={g.customerName ?? "this project"} view={projView} request={requestFor(g)} coVersionId={g.versions[0].id} />}
                {/* Each version's history right under its line (Albert, 2026-11-20), read when the row is opened. */}
                {expanded && <Versions id={`v-${k}`} versions={g.versions} latestId={latest.id} quoteRecordId={g.quoteRecordId} now={now} />}
              </li>
            );
          }),
          ])}
        </ul>
        </>
      )}
    </section>
    </>
  );
}
