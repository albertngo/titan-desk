"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { linkToJobAction } from "@/app/q/[id]/actions";
import type { JobChoices } from "@/lib/quotes/types";

/**
 * Shown on a quote that has no GHL opportunity (Needs linking): pick the customer's opportunity
 * it belongs to and link it. GHL gets the quote number, the confirmed site and the CompanyCam link;
 * a lost or abandoned opportunity is set back to open.
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
      const r = await linkToJobAction(quoteRecordId, picked);
      if (r.ok) router.refresh();
      else setError(r.message);
    });
  }

  const choice = jobs.ok ? jobs.choices.find((c) => c.id === picked) : undefined;

  return (
    <section className="card">
      <div className="card-h">Link to Opportunity</div>
      <div className="card-b nq-body">
        <p className="lj-intro">
          This quote isn&apos;t on a GHL opportunity yet. Pick the opportunity it belongs to. If none of these is it, create the opportunity in GHL
          first, then reload this page.
        </p>
        {!jobs.ok ? (
          <p className="lj-msg warn">{jobs.message}</p>
        ) : jobs.choices.length === 0 ? (
          <p className="lj-msg warn">This customer has no open project opportunities in GHL, and none lost or abandoned in the last 90 days. Create the opportunity in GHL, then reload this page.</p>
        ) : (
          <fieldset className="lj-opps">
            <legend>Which opportunity is {quoteNumber ?? "this quote"} for?</legend>
            {jobs.choices.map((o) => {
              const meta = [o.pipeline, o.stage, o.reopen ? `${o.status}${o.statusChangedAt ? ` ${o.statusChangedAt.slice(0, 10)}` : ""}` : null].filter(Boolean).join(" · ");
              const more = [o.siteAddress, o.hasCompanyCam ? "has its own CompanyCam project" : null].filter(Boolean).join(" · ");
              return o.takenBy ? (
                <div key={o.id} className="nq-opp taken">
                  <span className="nm">{o.name ?? "Opportunity"}</span>
                  <span className="mt">{meta}</span>
                  <span className="mt">Already quoted as <b>{o.takenBy}</b></span>
                </div>
              ) : (
                <label key={o.id} className="nq-opp">
                  <input type="radio" name="link-job" checked={picked === o.id} onChange={() => { setPicked(o.id); setError(null); }} />
                  <span className="nm">{o.name ?? "Opportunity"}</span>
                  <span className="mt">{meta || "—"}</span>
                  {more && <span className="mt">{more}</span>}
                </label>
              );
            })}
          </fieldset>
        )}
        {choice?.reopen && <p className="lj-msg warn">This opportunity is {choice.status}. Linking sets it back to Open in GHL.</p>}
        {error && <p className="lj-msg bad">{error}</p>}
        {jobs.ok && jobs.choices.length > 0 && (
          <div className="lj-actions">
            <button className="btn primary" type="button" disabled={!picked || linking || !jobs.canLink} onClick={link}>
              {linking ? "Linking…" : "Link this quote"}
            </button>
            {!jobs.canLink && <span className="faint">Linking isn&apos;t switched on for this deployment.</span>}
          </div>
        )}
      </div>
    </section>
  );
}
