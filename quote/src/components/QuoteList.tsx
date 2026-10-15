"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { displayPhone } from "@/lib/link/identity";
import { matchesSearch, type QuoteGroup } from "@/lib/quotes/group";

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", year: "numeric" });

/** The All quotes list: one row per quote, versions folded under it, and a search over the customer. */
export function QuoteList({ groups }: { groups: QuoteGroup[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const shown = useMemo(() => groups.filter((g) => matchesSearch(g, query)), [groups, query]);
  const keyOf = (g: QuoteGroup) => g.quoteRecordId ?? g.versions[0].id;
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <section className="card">
      <div className="card-h">
        All quotes <span className="right">{query.trim() ? `${shown.length} of ${groups.length}` : groups.length}</span>
      </div>
      <div className="ql-search">
        <input
          className="in"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, Q-number, city, phone"
          aria-label="Search quotes"
          autoComplete="off"
        />
      </div>
      {groups.length === 0 ? (
        <p className="empty">No quotes in Airtable yet.</p>
      ) : shown.length === 0 ? (
        <p className="empty">No quote matches “{query.trim()}”.</p>
      ) : (
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
                    aria-label={`${expanded ? "Hide" : "Show"} versions of ${g.quoteNumber ?? "this quote"}`}
                    onClick={() => toggle(k)}
                  >
                    <svg className="chev" width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div className="ql-who">
                    <Link className="cust" href={`/q/${latest.id}`}>{g.customerName ?? "No customer"}</Link>
                    {sub && <span className="mt">{sub}</span>}
                  </div>
                  <div className="ql-num num">
                    {g.quoteNumber ?? <span className="faint">No number</span>}
                    {g.projectNumber && <span className="mt">{g.projectNumber}</span>}
                  </div>
                  <div className="ql-latest">
                    <span className="faint">v{latest.version ?? "?"}</span>
                    {latest.basis && <span className={`chip ${latest.basis === "Measured" ? "good" : "warn"}`}>{latest.basis}</span>}
                    {latest.status && <span className={`status ${latest.status}`}>{latest.status}</span>}
                  </div>
                  <div className="ql-flags">
                    {g.linkStatus === "Needs linking" && <span className="chip bad">Needs linking</span>}
                    {g.addressStatus === "Unconfirmed" && <span className="chip warn">Address unconfirmed</span>}
                    {g.addressStatus === "No address" && <span className="chip warn">No address yet</span>}
                  </div>
                  <span className="ql-count faint">
                    {g.versions.length} version{g.versions.length === 1 ? "" : "s"}
                  </span>
                </div>
                {expanded && (
                  <ul className="ql-vs" id={`v-${k}`}>
                    {g.versions.map((v) => (
                      <li key={v.id}>
                        <Link href={`/q/${v.id}`} className="ql-v">
                          <span className="nm">{v.label ?? `v${v.version ?? "?"}`}</span>
                          {v.basis && <span className={`chip ${v.basis === "Measured" ? "good" : "warn"}`}>{v.basis}</span>}
                          {v.status && <span className={`status ${v.status}`}>{v.status}</span>}
                          <span className="mt">
                            {v.optionCount > 0 ? `${v.optionCount} option${v.optionCount === 1 ? "" : "s"}` : "old A/B/C format"} · {dateOf(v.createdTime)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
