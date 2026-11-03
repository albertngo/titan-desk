"use client";

import { useState } from "react";
import { camSheetPhotosAction } from "@/app/q/[id]/actions";
import type { CamSheetPhoto, SiteSheetResult } from "@/lib/quotes/types";

/**
 * "Draw from CompanyCam image" (Albert, 2026-11-03): a link at the top of a sheet. It opens the job's CompanyCam
 * photos right there, newest first, the ones tagged or described as a site sheet ticked; staff pick the page(s) of
 * this sheet and it is read. The server downloads the photos itself from the quote's own project, by id: no image
 * passes through the browser, and nothing is written to CompanyCam.
 *
 * The list is read again each time it opens (2026-11-03: the flooring sheet's picker once opened empty, holding an
 * earlier answer), the last list showing meanwhile, and an empty or failed read always says so.
 */

const MAX = 4;

export function CamDraw({
  quoteRecordId,
  seen,
  kind,
  onRead,
  label = "Draw from CompanyCam image",
  max = MAX,
  preselect = [],
  again = false,
}: {
  quoteRecordId: string;
  /** What the page opened with in this sheet's field, so a read never replaces someone else's. */
  seen: string;
  kind: "stairs" | "flooring";
  onRead: (r: Extract<SiteSheetResult, { ok: true }>, picked: CamSheetPhoto[]) => void;
  label?: string;
  max?: number;
  /** The photos the sheet was last drawn from, ticked again so drawing it again is one press. */
  preselect?: string[];
  /** A sheet is already drawn: the button says so. */
  again?: boolean;
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
    setLoading(true);
    try {
      const r = await camSheetPhotosAction(quoteRecordId).catch(() => null);
      if (!r || typeof r !== "object" || (r.ok && !Array.isArray(r.photos))) return setMessage("CompanyCam didn't answer. Try again.");
      if (!r.ok) return setMessage(r.message || "CompanyCam didn't answer. Try again.");
      const had = new Set((photos ?? []).map((p) => p.id));
      setPhotos(r.photos);
      setMore(r.more);
      setPicked((now) => {
        const there = new Set(r.photos.map((p) => p.id));
        const keep = now.filter((id) => there.has(id));
        if (keep.length) return keep;
        const last = preselect.filter((id) => there.has(id));
        if (last.length) return last.slice(0, max);
        // Ticked for you: ones tagged or described as a site sheet, new since the list was last read first.
        const sheets = r.photos.filter((p) => p.sheet);
        return [...sheets.filter((p) => !had.has(p.id)), ...sheets.filter((p) => had.has(p.id))].slice(0, max).map((p) => p.id);
      });
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
      const byId = new Map((photos ?? []).map((p) => [p.id, p]));
      onRead(r, picked.flatMap((id) => byId.get(id) ?? []));
    } finally {
      setReading(false);
    }
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : max === 1 ? [id] : p.length >= max ? p : [...p, id]));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Date unknown");

  if (!open) {
    return (
      <button type="button" className="btn" onClick={show}>
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
      {loading && <p className="faint">{photos?.length ? "Checking CompanyCam for new photos…" : "Loading the job's photos…"}</p>}
      {!loading && !message && photos?.length === 0 && <p className="faint">This job&apos;s CompanyCam project has no photos yet. <button type="button" className="linkbtn" onClick={show}>Look again</button></p>}
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
              {reading ? "Reading… about a minute" : `${again ? "Draw again" : "Draw"} from ${picked.length > 1 ? `these ${picked.length} photos` : picked.length === 1 ? "this photo" : "the photo"}`}
            </button>
            <span className="faint">{again ? "Drawing again replaces what is on this sheet now, your checks included." : "The photo is copied onto the quote."}</span>
          </div>
        </>
      )}
      {message && (
        <p className="ss-msg bad" role="status">
          {message} <button type="button" className="linkbtn" onClick={show} disabled={loading}>Try again</button>
        </p>
      )}
    </div>
  );
}
