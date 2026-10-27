"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createOpportunityAction, linkToJobAction } from "@/app/q/[id]/actions";
import type { JobChoice, JobChoices } from "@/lib/quotes/types";

/** The picker's value for "create a new opportunity" (never a GHL id: those have no underscores). */
const NEW = "__new__";

const STATUS_WORD: Record<string, string> = { open: "Open", abandoned: "Abandoned", lost: "Lost" };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", year: "numeric" }) : null);

function Option({ o, picked, onPick }: { o: JobChoice; picked: boolean; onPick: () => void }) {
  const status = (
    <span className={`lj-st ${o.status ?? ""}`}>
      <i aria-hidden />
      {STATUS_WORD[o.status ?? ""] ?? o.status}
      {o.reopen && o.statusChangedAt && <span className="faint"> · {day(o.statusChangedAt)}</span>}
    </span>
  );
  const where = [o.pipeline, o.stage].filter(Boolean).join(" · ");
  const more = [o.siteAddress, o.hasCompanyCam ? "Has its own CompanyCam project" : null].filter(Boolean).join(" · ");
  if (o.takenBy) {
    return (
      <div className="lj-opt taken" aria-disabled="true">
        <span className="lj-dot" aria-hidden />
        <span className="nm">{o.name ?? "Opportunity"}</span>
        {status}
        <span className="mt">{where}</span>
        <span className="mt">Already on <b>{o.takenBy}</b></span>
      </div>
    );
  }
  return (
    <label className={`lj-opt${picked ? " on" : ""}`}>
      <input type="radio" name="link-opportunity" checked={picked} onChange={onPick} />
      <span className="nm">{o.name ?? "Opportunity"}</span>
      {status}
      {where && <span className="mt">{where}</span>}
      {more && <span className="mt">{more}</span>}
    </label>
  );
}

/**
 * Shown on a quote that has no GHL opportunity (Needs linking): pick the customer's opportunity
 * it belongs to and link it. GHL gets the quote number, the confirmed site and the CompanyCam link;
 * a lost or abandoned opportunity is set back to open. Or create a new one (2026-10-27), for when
 * the one the quote should have been made with never reached GHL.
 */
export function LinkJob({ quoteRecordId, quoteNumber, jobs }: { quoteRecordId: string; quoteNumber: string | null; jobs: JobChoices }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linking, startLink] = useTransition();

  function link() {
    if (!picked) return;
    setError(null);
    startLink(async () => {
      const r = picked === NEW ? await createOpportunityAction(quoteRecordId) : await linkToJobAction(quoteRecordId, picked);
      if (r.ok) router.refresh();
      else setError(r.message);
    });
  }

  const choice = jobs.ok ? jobs.choices.find((c) => c.id === picked) : undefined;
  const pickable = jobs.canCreate || (jobs.ok && jobs.choices.some((c) => !c.takenBy));
  const canAct = picked === NEW ? jobs.canCreate : jobs.ok && jobs.canLink;

  return (
    <section className="card lj" aria-labelledby="lj-h">
      <div className="lj-head">
        <div>
          <h2 id="lj-h">Link to Opportunity</h2>
          <p>
            {quoteNumber ?? "This quote"} isn&apos;t on a GHL opportunity yet. Pick the one it belongs to{jobs.canCreate ? ", or create a new one" : ". If it isn't listed, create it in GHL, then reload this page"}.
          </p>
        </div>
        <span className="chip bad">Needs linking</span>
      </div>

      <div className="lj-body">
        {!jobs.ok ? (
          <p className="lj-msg warn">{jobs.message}</p>
        ) : jobs.choices.length === 0 ? (
          <p className="lj-msg warn">This customer has no open project opportunities in GHL, and none lost or abandoned in the last 90 days.</p>
        ) : null}
        {((jobs.ok && jobs.choices.length > 0) || jobs.canCreate) && (
          <fieldset className="lj-opps">
            <legend className="sr-only">Which opportunity is {quoteNumber ?? "this quote"} for?</legend>
            {jobs.canCreate && (
              <label className={`lj-opt${picked === NEW ? " on" : ""}`}>
                <input type="radio" name="link-opportunity" checked={picked === NEW} onChange={() => { setPicked(NEW); setError(null); }} />
                <span className="nm">Create a new opportunity</span>
                <span className="mt">In the lead pipeline, named for this quote, with its quote number and timing{jobs.ok ? "" : ", and the GHL contact too if the quote has none"}.</span>
              </label>
            )}
            {jobs.ok && jobs.choices.map((o) => (
              <Option key={o.id} o={o} picked={picked === o.id} onPick={() => { setPicked(o.id); setError(null); }} />
            ))}
          </fieldset>
        )}
        {choice?.reopen && <p className="lj-msg warn">This opportunity is {choice.status}. Linking sets it back to Open in GHL.</p>}
        {error && <p className="lj-msg bad" role="alert">{error}</p>}
      </div>

      {pickable && (
        <div className="lj-foot">
          <span className="faint">
            {picked === NEW
              ? "GHL gets a new opportunity with the quote number, the timing and the confirmed site."
              : jobs.ok && !jobs.canLink
                ? "Linking isn't switched on for this deployment."
                : "GHL gets the quote number, the confirmed site and the CompanyCam link."}
          </span>
          <button className="btn primary" type="button" disabled={!picked || linking || !canAct} onClick={link}>
            {picked === NEW ? (linking ? "Creating…" : "Create and link") : linking ? "Linking…" : "Link this quote"}
          </button>
        </div>
      )}
    </section>
  );
}
