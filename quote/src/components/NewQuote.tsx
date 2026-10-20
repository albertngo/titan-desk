"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { searchCustomersAction, startQuoteAction } from "@/app/new/actions";
import { displayPhone } from "@/lib/link/identity";
import { stageFor, TIMINGS, type Timing } from "@/lib/link/lead";
import type { NewQuoteKind } from "@/lib/link/newQuote";
import type { QuickChoice } from "@/lib/quick/plan";
import type { CustomerSearch, FoundCustomer } from "@/lib/quotes/types";
import { money } from "@/lib/format";
import { estimateWork, initialWork, QuickWork, workInput, type WorkState } from "./QuickWork";

type Choice = { contactId: string; opportunityId: string | null } | { newCustomer: true } | null;

const blankCustomer = { firstName: "", lastName: "", phone: "", email: "", address: "", city: "" };

/**
 * Start a quote: find the customer in GHL, pick the opportunity (or a new one), answer the
 * timing question. Customer details are never typed here unless the customer is brand new.
 * Two kinds (Albert, 2026-10-18): a preliminary adds the quick form and becomes v1 Preliminary; a
 * full quote stops at the timing question and opens v1 Measured, empty, in the editor.
 */
export function NewQuote({ ghlWrites, choices, kind }: { ghlWrites: boolean; choices: QuickChoice[]; kind: NewQuoteKind }) {
  const prelim = kind === "preliminary";
  const [work, setWork] = useState<WorkState>(() => initialWork(choices));
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<CustomerSearch | null>(null);
  const [searching, startSearch] = useTransition();
  const [choice, setChoice] = useState<Choice>(null);
  const [nc, setNc] = useState(blankCustomer);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when a "new" customer turned out to be in GHL already; the matches are in `result`. */
  const [dupeNote, setDupeNote] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();

  function choose(next: Choice) {
    setChoice(next);
    setError(null);
    setDupeNote(null);
  }

  const customers = result?.ok ? result.customers : [];
  const picked: FoundCustomer | null = choice && "contactId" in choice ? (customers.find((c) => c.contact.id === choice.contactId) ?? null) : null;
  const isNew = choice !== null && "newCustomer" in choice;

  function search(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setError(null);
    setDupeNote(null);
    startSearch(async () => {
      setResult(await searchCustomersAction(q));
      setChoice(null);
    });
  }

  function create(forceNew = false) {
    setError(null);
    const shared = { timing, kind: prelim ? "preliminary" : "measured", work: prelim ? workInput(work) : undefined };
    const input = picked
      ? { ...shared, contactId: picked.contact.id, opportunityId: (choice as { opportunityId: string | null }).opportunityId, addressConfirmed: confirmed }
      : { ...shared, newCustomer: nc, forceNew };
    startCreate(async () => {
      const r = await startQuoteAction(input);
      if (!r || r.ok) return;
      if (r.duplicates?.length) {
        // Show who GHL already has; picking one turns this into an existing-customer quote.
        setResult({ ok: true, customers: r.duplicates });
        setChoice(null);
        setDupeNote(r.message);
      } else setError(r.message);
    });
  }

  const linked = picked !== null && (choice as { opportunityId: string | null }).opportunityId !== null;
  const ready = timing !== null && (picked !== null || (isNew && (nc.firstName.trim() || nc.lastName.trim()) && (nc.phone.trim() || nc.email.trim())));
  const estimate = prelim ? estimateWork(choices, work) : null;

  // Sections in order (Albert, 2026-10-18): Job → Customer → Timeline. The job card is only on a
  // preliminary, so the numbers are counted, not typed.
  const hasJob = prelim;
  const step = (n: number) => (hasJob ? n : n - 1);

  return (
    <div className="page newq">
      <div className="pagehead">
        <div className="titles">
          <Link className="crumb" href="/">← Quotes</Link>
          <h1>{prelim ? "Preliminary quote" : "New quote"}</h1>
          <p>
            {prelim
              ? "Pick the work, find the customer in GHL and their opportunity, then say when they plan to do the project. It becomes the preliminary quote."
              : "Find the customer in GHL, pick their opportunity and say when they plan to do the project. The quote opens empty in the editor, as a measured version."}
          </p>
        </div>
      </div>

      {hasJob && (
        <section className="card">
          <div className="card-h">1 · Job <span className="right">Preliminary, not measured</span></div>
          <div className="card-b">
            <QuickWork choices={choices} value={work} onChange={setWork} />
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-h">{step(2)} · Customer</div>
        <div className="card-b nq-body">
          <form className="nq-search" onSubmit={search} role="search">
            <input
              id="nq-query"
              className="in"
              placeholder="Name, phone or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search GHL contacts"
            />
            <button className="btn primary" type="submit" disabled={searching || query.trim().length < 2}>
              {searching ? "Searching…" : "Search GHL"}
            </button>
          </form>

          {dupeNote && (
            <div className="banner warn nq-dupe" role="alert">
              <p>{dupeNote}</p>
              <button type="button" className="btn small" disabled={creating || timing === null} onClick={() => create(true)}>
                It&apos;s a different person, create new
              </button>
            </div>
          )}
          {result && !result.ok && (
            <div className={`banner ${result.reason === "not-configured" ? "warn" : "bad"}`}>
              {result.message} You can still add them as a new customer below.
            </div>
          )}
          {result?.ok && customers.length === 0 && <p className="empty">Nobody in GHL matches “{query.trim()}”.</p>}

          {customers.length > 0 && (
            <ul className="nq-list" aria-label="Matching contacts">
              {customers.map(({ contact, opportunities }) => {
                const on = picked?.contact.id === contact.id;
                const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.name || "No name";
                return (
                  <li key={contact.id} className={`nq-contact${on ? " on" : ""}`}>
                    <button type="button" className="nq-who" aria-pressed={on} onClick={() => { choose({ contactId: contact.id, opportunityId: null }); setConfirmed(false); }}>
                      <span className="nm">{name}</span>
                      <span className="mt">{[displayPhone(contact.phone), contact.email, [contact.address, contact.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "No details on the contact"}</span>
                    </button>
                    {on && (
                      <fieldset className="nq-opps">
                        <legend>Which work is this quote for?</legend>
                        {opportunities.map((o) =>
                          o.existing ? (
                            <div key={o.id} className="nq-opp taken">
                              <span className="nm">{o.name ?? "Opportunity"}</span>
                              <span className="mt">{[o.pipeline, o.stage, o.status].filter(Boolean).join(" · ")}</span>
                              <span className="mt">
                                Already quoted as <b>{o.existing.quoteNumber ?? "a quote"}</b>
                                {o.existing.versionId && <> · <Link href={`/q/${o.existing.versionId}`}>Open it</Link></>}
                              </span>
                            </div>
                          ) : (
                            <label key={o.id} className="nq-opp">
                              <input type="radio" name="nq-opp" checked={(choice as { opportunityId: string | null }).opportunityId === o.id} onChange={() => choose({ contactId: contact.id, opportunityId: o.id })} />
                              <span className="nm">{o.name ?? "Opportunity"}</span>
                              <span className="mt">{[o.pipeline, o.stage, o.status].filter(Boolean).join(" · ")}</span>
                            </label>
                          ),
                        )}
                        <label className="nq-opp">
                          <input type="radio" name="nq-opp" checked={(choice as { opportunityId: string | null }).opportunityId === null} onChange={() => choose({ contactId: contact.id, opportunityId: null })} />
                          <span className="nm">New opportunity for this customer</span>
                          <span className="mt">Different work from anything listed above</span>
                        </label>
                      </fieldset>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <button type="button" className={`linkbtn nq-newtoggle${isNew ? " on" : ""}`} onClick={() => choose(isNew ? null : { newCustomer: true })} aria-expanded={isNew}>
            {isNew ? "Cancel new customer" : "Not in GHL? Add a new customer"}
          </button>
          {isNew && (
            <div className="form nq-form">
              {(
                [
                  ["firstName", "First name", "given-name"],
                  ["lastName", "Last name", "family-name"],
                  ["phone", "Phone", "tel"],
                  ["email", "Email", "email"],
                  ["address", "Site address (if they gave it)", "street-address"],
                  ["city", "City", "address-level2"],
                ] as const
              ).map(([k, label, ac]) => (
                <label key={k}>
                  {label}
                  <input id={`nq-${k}`} className="in" autoComplete={ac} value={nc[k]} onChange={(e) => setNc({ ...nc, [k]: e.target.value })} />
                </label>
              ))}
            </div>
          )}

          {picked && (
            <div className="nq-site">
              <span className="nq-site-h">Site address</span>
              {picked.contact.address ? (
                <>
                  <p>
                    The contact&apos;s address is <b>{[picked.contact.address, picked.contact.city].filter(Boolean).join(", ")}</b>.
                  </p>
                  <label className="check-in">
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                    This is the site for this quote
                  </label>
                  {!confirmed && <p className="note">Left unticked, the quote shows it as unconfirmed until it&apos;s confirmed at booking.</p>}
                </>
              ) : (
                <p className="muted">No address on the contact. That&apos;s fine for a preliminary: type it on the GHL contact when you get it, or the booking automation will ask them.</p>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-h">{step(3)} · Timeline <span className="right">When are they planning to do the project?</span></div>
        <div className="card-b">
          <div className="nq-seg" role="radiogroup" aria-label="Project timing">
            {TIMINGS.map((t) => (
              <label key={t} className={`nq-seg-b${timing === t ? " on" : ""}`}>
                <input type="radio" name="nq-timing" checked={timing === t} onChange={() => setTiming(t)} />
                <span className="nm">{t}</span>
                <span className={`chip ${stageFor(t) === "Hot" ? "bad" : stageFor(t) === "Warm" ? "warn" : ""}`}>{stageFor(t)}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <div className="nq-foot">
        {(picked || isNew) && (
          <p className="note">
            {linked
              ? ghlWrites
                ? "This quote is tied to the opportunity you picked. Its quote number and timing go to GHL."
                : "This quote is tied to the opportunity you picked."
              : ghlWrites
                ? `GHL gets ${isNew ? "a new contact and " : ""}a new opportunity in Lead Qualification${timing ? `, at ${stageFor(timing)}` : ""}.`
                : "GHL will need a new opportunity for this. Until that's automatic, the quote is saved as Needs linking; create the opportunity in GHL and link it."}
          </p>
        )}
        {error && <div className="banner bad" role="alert">{error}</div>}
      </div>
      <div className="qw-foot" aria-live="polite">
        {estimate ? (
          <div className="est">
            <span className="k">Preliminary estimate</span>
            <b>{money(estimate.total)}</b>
            <span className="faint">{estimate.lines} line{estimate.lines === 1 ? "" : "s"}, before discount and HST</span>
          </div>
        ) : (
          <div className="est">
            <span className="k">Measured quote</span>
            <span className="faint">Opens empty in the editor</span>
          </div>
        )}
        <button className="btn primary" type="button" disabled={!ready || creating} onClick={() => create()}>
          {creating ? "Creating…" : prelim ? "Create preliminary" : "Create quote"}
        </button>
      </div>
    </div>
  );
}
