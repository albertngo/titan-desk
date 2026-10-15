"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { linkToJobAction } from "@/app/q/[id]/actions";
import type { JobChoice, JobChoices } from "@/lib/quotes/types";

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
  const pickable = jobs.ok && jobs.choices.some((c) => !c.takenBy);

  return (
    <section className="card lj" aria-labelledby="lj-h">
      <div className="lj-head">
        <div>
          <h2 id="lj-h">Link to Opportunity</h2>
          <p>
            {quoteNumber ?? "This quote"} isn&apos;t on a GHL opportunity yet. Pick the one it belongs to. If it isn&apos;t listed, create it in GHL,
            then reload this page.
          </p>
        </div>
        <span className="chip bad">Needs linking</span>
      </div>

      <div className="lj-body">
        {!jobs.ok ? (
          <p className="lj-msg warn">{jobs.message}</p>
        ) : jobs.choices.length === 0 ? (
          <p className="lj-msg warn">This customer has no open project opportunities in GHL, and none lost or abandoned in the last 90 days.</p>
        ) : (
          <fieldset className="lj-opps">
            <legend className="sr-only">Which opportunity is {quoteNumber ?? "this quote"} for?</legend>
            {jobs.choices.map((o) => (
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
            {jobs.ok && !jobs.canLink ? "Linking isn't switched on for this deployment." : "GHL gets the quote number, the confirmed site and the CompanyCam link."}
          </span>
          <button className="btn primary" type="button" disabled={!picked || linking || !(jobs.ok && jobs.canLink)} onClick={link}>
            {linking ? "Linking…" : "Link this quote"}
          </button>
        </div>
      )}
    </section>
  );
}
