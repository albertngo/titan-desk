"use client";

import { useRef, useState } from "react";
import { BUG, URGENCY, checkReport, type Urgency } from "@/lib/bug/report";
import { shrinkImage } from "@/lib/bug/shrink";

type Shot = { file: File; url: string };

/** Report a bug (2026-10-28): the header button and its form. Sends to /api/bug, which makes Albert a Tactical Task. */
export function ReportBug() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("annoying");
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ failed: number } | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  // Thumbnails are object URLs; each is freed when its screenshot goes.
  const drop = (s: Shot) => {
    URL.revokeObjectURL(s.url);
    setShots((all) => all.filter((x) => x !== s));
  };
  const reset = () => {
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setSummary("");
    setUrgency("annoying");
    setShots([]);
    setError(null);
    setSent(null);
  };
  const close = () => {
    setOpen(false);
    if (sent) reset();
  };

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const room = BUG.maxImages - shots.length;
    if (files.length > room) setError(`Up to ${BUG.maxImages} screenshots.`);
    const small = await Promise.all([...files].slice(0, Math.max(0, room)).map((f) => shrinkImage(f)));
    setShots((s) => [...s, ...small.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    if (pick.current) pick.current.value = "";
  };

  const send = async () => {
    const problem = checkReport({ summary, urgency, images: shots.map((s) => s.file) });
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("summary", summary);
    body.append("urgency", urgency);
    body.append("page", window.location.href);
    body.append("screen", `${window.innerWidth}×${window.innerHeight}`);
    shots.forEach((s) => body.append("images", s.file, s.file.name));
    try {
      const res = await fetch("/api/bug", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { error?: string; failed?: number };
      if (!res.ok) setError(json.error ?? "That didn't send. Try again.");
      else setSent({ failed: json.failed ?? 0 });
    } catch {
      setError("That didn't send. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="tb-btn" aria-label="Report a bug" onClick={() => setOpen(true)}>
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <rect x="4.5" y="5" width="7" height="8.5" rx="3.5" />
          <path d="M6 5V4a2 2 0 0 1 4 0v1M2 8.5h2.5M11.5 8.5H14M2.5 12l2-1M13.5 12l-2-1M2.5 5l2 1.2M13.5 5l-2 1.2" />
        </svg>
        <span className="lbl">Report a bug</span>
      </button>
      {open && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Report a bug" onClick={close} onKeyDown={(e) => e.key === "Escape" && close()}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="card-h">
              Report a bug
              <button type="button" className="linkbtn right" onClick={close}>
                Close
              </button>
            </div>
            {sent ? (
              <div className="card-b bug-done">
                <p>
                  <b>Sent to Albert.</b> It&apos;s on the Tactical Tasks list as a bug fix.
                </p>
                {sent.failed > 0 && <p className="sub">{sent.failed} screenshot{sent.failed === 1 ? "" : "s"} didn&apos;t upload, but the report went through.</p>}
                <button type="button" className="btn" onClick={reset}>
                  Report another
                </button>
              </div>
            ) : (
              <div className="card-b bug-form">
                <label className="fld">
                  <span>What went wrong?</span>
                  <input
                    className="in"
                    autoFocus
                    maxLength={BUG.summaryMax}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="e.g. Save does nothing on the Rooms tab"
                  />
                </label>
                <fieldset className="bug-urg">
                  <legend>How urgent?</legend>
                  {URGENCY.map((u) => (
                    <label key={u.key} className={urgency === u.key ? "on" : undefined}>
                      <input type="radio" name="bug-urgency" value={u.key} checked={urgency === u.key} onChange={() => setUrgency(u.key)} />
                      {u.label}
                    </label>
                  ))}
                </fieldset>
                <div className="bug-shots">
                  <span className="k">Screenshots <span className="sub">(up to {BUG.maxImages})</span></span>
                  <div className="row">
                    {shots.map((s, i) => (
                      <figure key={s.url}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a picked file */}
                        <img src={s.url} alt={`Screenshot ${i + 1}`} />
                        <button type="button" aria-label={`Remove screenshot ${i + 1}`} onClick={() => drop(s)}>
                          ×
                        </button>
                      </figure>
                    ))}
                    {shots.length < BUG.maxImages && (
                      <button type="button" className="bug-add" onClick={() => pick.current?.click()}>
                        + Add
                      </button>
                    )}
                  </div>
                  <input ref={pick} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
                </div>
                {error && <p className="bug-err" role="alert">{error}</p>}
                <div className="bug-foot">
                  <button type="button" className="btn primary" disabled={busy} onClick={send}>
                    {busy ? "Sending…" : "Send to Albert"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
