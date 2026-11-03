"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createJobAction, linkToJobAction } from "@/app/q/[id]/actions";
import type { JobChoice, JobChoices } from "@/lib/quotes/types";

/** The card's own choice for "none of these: make a new opportunity" (2026-11-03). */
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
 * a lost or abandoned opportunity is set back to open. Or, when none of them is this job (another
 * unit at the same building), make a new one here, as a preliminary does (2026-11-03).
 */
export function LinkJob({ quoteRecordId, quoteNumber, jobs }: { quoteRecordId: string; quoteNumber: string | null; jobs: JobChoices }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const offered = jobs.ok ? jobs.placements : [];
  const [pipelineId, setPipelineId] = useState<string>(jobs.ok ? (jobs.startAt?.pipelineId ?? "") : "");
  const [stageId, setStageId] = useState<string>(jobs.ok ? (jobs.startAt?.stageId ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [linking, startLink] = useTransition();

  const making = picked === NEW;
  const pipeline = offered.find((p) => p.id === pipelineId);
  const placed = Boolean(pipeline?.stages.some((st) => st.id === stageId));

  function link() {
    if (!picked || (making && !placed)) return;
    setError(null);
    startLink(async () => {
      const r = making ? await createJobAction(quoteRecordId, { pipelineId, stageId }) : await linkToJobAction(quoteRecordId, picked);
      if (r.ok) router.refresh();
      else setError(r.message);
    });
  }

  const pick = (id: string) => {
    setPicked(id);
    setError(null);
  };
  const choice = jobs.ok ? jobs.choices.find((c) => c.id === picked) : undefined;
  const pickable = jobs.ok;

  return (
    <section className="card lj" aria-labelledby="lj-h">
      <div className="lj-head">
        <div>
          <h2 id="lj-h">Link to Opportunity</h2>
          <p>
            {quoteNumber ?? "This quote"} isn&apos;t on a GHL opportunity yet. Pick the one it belongs to, or make a new one if this is a
            different job from all of them.
          </p>
        </div>
        <span className="chip bad">Needs linking</span>
      </div>

      <div className="lj-body">
        {!jobs.ok ? (
          <p className="lj-msg warn">{jobs.message}</p>
        ) : (
          <fieldset className="lj-opps">
            <legend className="sr-only">Which opportunity is {quoteNumber ?? "this quote"} for?</legend>
            {jobs.choices.length === 0 && (
              <p className="lj-msg warn">This customer has no open project opportunities in GHL, and none lost or abandoned in the last 90 days.</p>
            )}
            {jobs.choices.map((o) => (
              <Option key={o.id} o={o} picked={picked === o.id} onPick={() => pick(o.id)} />
            ))}
            {offered.length > 0 && jobs.choices.length > 0 && (
              <div className="opp-or" aria-hidden="true">
                <span>or</span>
              </div>
            )}
            {offered.length > 0 && (
              <label className={`lj-opt new${making ? " on" : ""}`}>
                <input type="radio" name="link-opportunity" checked={making} onChange={() => pick(NEW)} />
                <span className="nm">+ New opportunity</span>
                <span className="mt">When this is a different job from all of these: another unit, another address</span>
              </label>
            )}
          </fieldset>
        )}
        {jobs.ok && offered.length === 0 && (
          <p className="lj-msg warn">GHL&apos;s pipelines couldn&apos;t be read, so a new opportunity can&apos;t be made from here. Reload the page to try again.</p>
        )}
        {making && (
          <div className="lj-new">
            <label>
              <span>Pipeline</span>
              <select
                className="in"
                value={pipelineId}
                onChange={(e) => {
                  setPipelineId(e.target.value);
                  setStageId("");
                }}
              >
                <option value="">Pick a pipeline</option>
                {offered.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Stage</span>
              <select className="in" value={stageId} disabled={!pipeline} onChange={(e) => setStageId(e.target.value)}>
                <option value="">Pick a stage</option>
                {pipeline?.stages.map((st) => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            </label>
            <p className="faint">Won isn&apos;t offered: a quote gets there when the customer accepts it.</p>
          </div>
        )}
        {choice?.reopen && <p className="lj-msg warn">This opportunity is {choice.status}. Linking sets it back to Open in GHL.</p>}
        {error && <p className="lj-msg bad" role="alert">{error}</p>}
      </div>

      {pickable && (
        <div className="lj-foot">
          <span className="faint">
            {jobs.ok && !jobs.canLink ? "Linking isn't switched on for this deployment." : "GHL gets the quote number, the confirmed site and the CompanyCam link."}
          </span>
          <button className="btn primary" type="button" disabled={!picked || (making && !placed) || linking || !(jobs.ok && jobs.canLink)} onClick={link}>
            {linking ? (making ? "Creating…" : "Linking…") : making ? "Create and link" : "Link this quote"}
          </button>
        </div>
      )}
    </section>
  );
}
