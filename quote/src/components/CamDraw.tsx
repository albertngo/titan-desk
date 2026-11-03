"use client";

import { useState } from "react";
import { camSheetPhotosAction } from "@/app/q/[id]/actions";
import type { CamSheetPhoto, SiteSheetResult } from "@/lib/quotes/types";

/**
 * "Draw from CompanyCam image" (Albert, 2026-11-03): a link at the top of a sheet. It opens the job's CompanyCam
 * photos right there, newest first, the ones tagged or described as a site sheet ticked; staff pick the page(s) of
 * this sheet and it is read. The server downloads the photos itself from the quote's own project, by id: no image
 * passes through the browser, and nothing is written to CompanyCam.
 */

const MAX = 4;

export function CamDraw({
  quoteRecordId,
  seen,
  kind,
  onRead,
  label = "Draw from CompanyCam image",
  max = MAX,
}: {
  quoteRecordId: string;
  /** What the page opened with in this sheet's field, so a read never replaces someone else's. */
  seen: string;
  kind: "stairs" | "flooring";
  onRead: (r: Extract<SiteSheetResult, { ok: true }>) => void;
  label?: string;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<CamSheetPhoto[] | null>(null);
  const [more, setMore] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    setMessage(null);
    if (photos) return;
    setLoading(true);
    try {
      const r = await camSheetPhotosAction(quoteRecordId).catch(() => null);
      if (!r || !r.ok) return setMessage(r?.message ?? "CompanyCam didn't answer. Try again.");
      setPhotos(r.photos);
      setMore(r.more);
      setPicked(r.photos.filter((p) => p.sheet).slice(0, max).map((p) => p.id));
      if (r.photos.length === 0) setMessage("This job's CompanyCam project has no photos yet.");
    } finally {
      setLoading(false);
    }
  }

  async function draw() {
    setReading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sitesheet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteRecordId, seen, photoIds: picked, kind }) });
      const r = (await res.json().catch(() => ({ ok: false, message: "The server didn't answer. Try again." }))) as SiteSheetResult;
      if (!r.ok) return setMessage(r.message);
      setOpen(false);
      onRead(r);
    } finally {
      setReading(false);
    }
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : max === 1 ? [id] : p.length >= max ? p : [...p, id]));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Date unknown");

  if (!open) {
    return (
      <button type="button" className="linkbtn cam-draw-link" onClick={show}>
        {label}
      </button>
    );
  }
  return (
    <div className="cam-draw" role="group" aria-label={label}>
      <div className="cam-draw-h">
        <b>{kind === "flooring" ? "Pick the flooring sheet photo" : "Pick the stair sheet's pages, page 1 first"}</b>
        <button type="button" className="linkbtn" onClick={() => setOpen(false)} disabled={reading}>Cancel</button>
      </div>
      {loading && <p className="faint">Loading the job&apos;s photos…</p>}
      {photos && photos.length > 0 && (
        <>
          <ul className="cam-pick-grid">
            {photos.map((p) => {
              const on = picked.includes(p.id);
              return (
                <li key={p.id}>
                  <button type="button" className={`cam-pick-p${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(p.id)} title={p.description ?? undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a CompanyCam thumbnail */}
                    <img src={p.thumb} alt={p.description ?? `Photo taken ${when(p.at)}`} loading="lazy" />
                    {on && <span className="cam-pick-n">{max === 1 ? "This one" : `Page ${picked.indexOf(p.id) + 1}`}</span>}
                    {p.sheet && <span className="cam-pick-tag">Site sheet</span>}
                    <span className="cam-pick-when">{when(p.at)}{p.by ? ` · ${p.by}` : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {more && <p className="faint">Only the newest 600 photos are shown.</p>}
          <div className="ss-up-row">
            <button type="button" className="btn primary" disabled={picked.length === 0 || reading} onClick={draw}>
              {reading ? "Reading… about a minute" : `Draw from ${picked.length > 1 ? `these ${picked.length} photos` : "this photo"}`}
            </button>
            <span className="faint">Drawing replaces what is on this sheet now. The photo is copied onto the quote.</span>
          </div>
        </>
      )}
      {message && <p className="ss-msg bad" role="status">{message}</p>}
    </div>
  );
}
