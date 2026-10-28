"use client";

import { useRef, useState } from "react";
import { BUG, URGENCY, checkReport, type Urgency } from "@/lib/bug/report";
import { shrinkImage } from "@/lib/bug/shrink";

type Shot = { file: File; url: string };

/** Report a bug (2026-10-28): the header button and its sheet. Sends to /api/bug, which makes Albert a Tactical Task. */
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report a bug"
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-medium text-cream/85 transition-colors hover:bg-cream/10 hover:text-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <rect x="4.5" y="5" width="7" height="8.5" rx="3.5" />
          <path d="M6 5V4a2 2 0 0 1 4 0v1M2 8.5h2.5M11.5 8.5H14M2.5 12l2-1M13.5 12l-2-1M2.5 5l2 1.2M13.5 5l-2 1.2" />
        </svg>
        <span className="hidden md:inline">Report a bug</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report a bug"
          className="fixed inset-0 z-50 grid place-items-end bg-ink/40 sm:place-items-center sm:p-4"
          onClick={close}
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <div className="w-full max-w-lg pb-[env(safe-area-inset-bottom)] rounded-t-2xl bg-cream text-ink shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center border-b border-denim/10 px-5 py-4">
              <h2 className="font-display text-lg font-bold">Report a bug</h2>
              <button type="button" onClick={close} className="ml-auto rounded-full px-3 py-1 text-sm text-ink/70 hover:bg-denim/5 focus-visible:outline-2 focus-visible:outline-denim">
                Close
              </button>
            </div>
            {sent ? (
              <div className="grid justify-items-start gap-3 px-5 py-5 text-sm">
                <p>
                  <b>Sent to Albert.</b> It&apos;s on the Tactical Tasks list as a bug fix.
                </p>
                {sent.failed > 0 && <p className="text-ink/70">{sent.failed} screenshot{sent.failed === 1 ? "" : "s"} didn&apos;t upload, but the report went through.</p>}
                <button type="button" onClick={reset} className="rounded-full bg-white px-4 py-2 font-medium ring-1 ring-denim/20 hover:ring-denim/40">
                  Report another
                </button>
              </div>
            ) : (
              <div className="grid max-h-[75vh] gap-5 overflow-y-auto px-5 py-5">
                <label className="grid gap-1.5 text-sm font-semibold">
                  What went wrong?
                  <input
                    autoFocus
                    maxLength={BUG.summaryMax}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="e.g. Search shows no results for oak"
                    className="rounded-xl bg-white px-3.5 py-2.5 text-base font-normal ring-1 ring-denim/15 focus:outline-none focus:ring-2 focus:ring-denim sm:text-sm"
                  />
                </label>
                <fieldset>
                  <legend className="text-sm font-semibold">How urgent?</legend>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {URGENCY.map((u) => (
                      <label
                        key={u.key}
                        className={`cursor-pointer rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-denim ${
                          urgency === u.key ? "bg-denim text-cream" : "bg-white ring-1 ring-denim/15 hover:ring-denim/40"
                        }`}
                      >
                        <input type="radio" name="bug-urgency" value={u.key} checked={urgency === u.key} onChange={() => setUrgency(u.key)} className="sr-only" />
                        {u.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <p className="text-sm font-semibold">
                    Screenshots <span className="font-normal text-ink/60">(up to {BUG.maxImages})</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {shots.map((s, i) => (
                      <figure key={s.url} className="relative h-20 w-20 overflow-hidden rounded-xl ring-1 ring-denim/15">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a picked file */}
                        <img src={s.url} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          aria-label={`Remove screenshot ${i + 1}`}
                          onClick={() => drop(s)}
                          className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink/70 text-sm text-white"
                        >
                          ×
                        </button>
                      </figure>
                    ))}
                    {shots.length < BUG.maxImages && (
                      <button
                        type="button"
                        onClick={() => pick.current?.click()}
                        className="h-20 w-20 rounded-xl border border-dashed border-denim/30 text-sm text-ink/70 hover:border-denim hover:text-denim"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                  <input ref={pick} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
                </div>
                {error && (
                  <p role="alert" className="text-sm text-campfire-dark">
                    {error}
                  </p>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={send}
                    className="rounded-full bg-denim px-5 py-2.5 text-sm font-semibold text-cream hover:bg-denim-dark disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim"
                  >
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
