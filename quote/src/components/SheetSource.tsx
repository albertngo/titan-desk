"use client";

import { useEffect, useMemo, useState } from "react";
import { clearSheetAction } from "@/app/q/[id]/actions";
import type { CamSheetPhoto, SiteSheetResult } from "@/lib/quotes/types";
import { looksHeic, preparePhoto } from "@/lib/sitesheet/photo";
import { CamDraw } from "./CamDraw";

/**
 * Where a site sheet's photos come from, the same for both sheets (Albert, 2026-11-03: "an option to still take a
 * photo, choose photos, or draw from [a CompanyCam] image, as the stair sheet option has at the moment. Those should be
 * the same"): Take a photo and Choose photos upload from this device (each made a small JPEG as it is picked, iPhone
 * HEIC included), Draw from CompanyCam image picks it from the job's CompanyCam project. Either way it is read as
 * this sheet. The sheet's own screen shows what was read; this only gets the photos in.
 *
 * Once a sheet is read, each way in says "again", and Start over (Albert, 2026-11-03: "options to start over… if it's
 * already been drawn, then there should be an option to do it again") clears what was read, after asking, so the
 * sheet starts fresh. The photos stay on the quote.
 */

const MAX_PHOTOS = 4;
type Ok = Extract<SiteSheetResult, { ok: true }>;

export function SheetSource({
  quoteRecordId,
  seen,
  kind,
  camLinked,
  hasSheet,
  onRead,
  onCleared,
  preselect = [],
  hint,
}: {
  quoteRecordId: string;
  /** What the page opened with in this sheet's field, so a read never replaces someone else's. */
  seen: string;
  kind: "stairs" | "flooring";
  camLinked: boolean;
  /** A sheet is already read: the buttons say "again" and reading replaces it. */
  hasSheet: boolean;
  onRead: (r: Ok, how: "upload" | "companycam", picked: CamSheetPhoto[]) => void;
  /** Start over went through: the sheet's field is blank again. */
  onCleared: () => void;
  /** The CompanyCam photos the sheet was last drawn from. */
  preselect?: string[];
  hint: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  async function startOver() {
    if (!window.confirm(`Start over on the ${kind === "flooring" ? "flooring" : "stair"} sheet? What was read is cleared, your checks included, so it can be drawn or read again. The photos stay on the quote.`)) return;
    setClearing(true);
    setMessage(null);
    try {
      const r = await clearSheetAction(quoteRecordId, seen, kind).catch(() => null);
      if (!r || !r.ok) return setMessage(r?.message ?? "The server didn't answer. Try again.");
      setFiles([]);
      onCleared();
    } finally {
      setClearing(false);
    }
  }

  // Picks add up (2026-10-28: only one photo could be attached): take page 1, then page 2, or choose several.
  // The input's FileList is live: clearing the input (so the same photo can be picked again) empties it, so it
  // is copied here, before the clear, never read later inside the state update (2026-10-28: a second photo was lost).
  const addFiles = async (input: HTMLInputElement) => {
    const picked = Array.from(input.files ?? []).filter((x) => !x.type || x.type.startsWith("image/") || looksHeic(x));
    input.value = "";
    if (picked.length === 0) return;
    setMessage(null);
    setPreparing((n) => n + picked.length);
    try {
      const ready = await Promise.all(picked.map((f) => preparePhoto(f, 2000, 0.85)));
      const unreadable = ready.filter((f) => looksHeic(f)).length;
      if (unreadable) setMessage(`${unreadable === 1 ? "A photo" : `${unreadable} photos`} couldn't be converted from the iPhone's HEIC format. On the iPhone, set Settings → Camera → Formats to Most Compatible, or take it again here with Take a photo.`);
      setFiles((f) => [...f, ...ready.filter((x) => !looksHeic(x))].slice(0, MAX_PHOTOS));
    } finally {
      setPreparing((n) => n - picked.length);
    }
  };
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function read() {
    if (files.length === 0) return;
    setReading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("quoteRecordId", quoteRecordId);
      form.set("seen", seen);
      form.set("kind", kind);
      for (const f of files) form.append("photos", f);
      const res = await fetch("/api/sitesheet", { method: "POST", body: form });
      const fallback = res.status === 413 ? "The photos are too large to send together. Read one page at a time." : "The server didn't answer. Try again.";
      const r = (await res.json().catch(() => ({ ok: false, message: fallback }))) as SiteSheetResult;
      if (!r.ok) return setMessage(r.message);
      setFiles([]);
      onRead(r, "upload", []);
    } finally {
      setReading(false);
    }
  }

  const full = files.length >= MAX_PHOTOS;
  const page = kind === "flooring" ? "photo" : "page";
  return (
    <div className="ss-up">
      <p className="faint">{hint}</p>
      <div className="ss-up-row">
        {/* The camera takes one shot at a time; the library allows several. Both add to the list. */}
        <label className={`btn${full ? " disabled" : ""}`}>
          {hasSheet ? "Take a new photo" : "Take a photo"}
          <input type="file" accept="image/*" capture="environment" hidden disabled={full} aria-label={`Take a photo of the ${kind === "flooring" ? "flooring" : "stair"} sheet`} onChange={(e) => addFiles(e.currentTarget)} />
        </label>
        <label className={`btn${full ? " disabled" : ""}`}>
          Choose photos
          <input type="file" accept="image/*,.heic,.heif" multiple hidden disabled={full} aria-label={`Choose photos of the ${kind === "flooring" ? "flooring" : "stair"} sheet`} onChange={(e) => addFiles(e.currentTarget)} />
        </label>
        {camLinked && (
          <CamDraw
            quoteRecordId={quoteRecordId}
            seen={seen}
            kind={kind}
            max={kind === "flooring" ? 2 : 4}
            again={hasSheet}
            preselect={preselect}
            label={hasSheet ? "Draw again from CompanyCam image" : "Draw from CompanyCam image"}
            onRead={(r, picked) => {
              setFiles([]);
              onRead(r, "companycam", picked);
            }}
          />
        )}
        <button type="button" className="btn primary" disabled={files.length === 0 || reading || preparing > 0} onClick={read}>
          {reading ? "Reading… about a minute" : preparing > 0 ? "Getting photos ready…" : files.length ? `Read ${files.length} photo${files.length === 1 ? "" : "s"}` : hasSheet ? "Read new photos" : "Read the sheet"}
        </button>
        {hasSheet && (
          <button type="button" className="btn ss-start-over" disabled={clearing || reading} onClick={startOver}>
            {clearing ? "Clearing…" : "Start over"}
          </button>
        )}
      </div>
      {files.length > 0 && (
        <ul className="ss-picked" aria-label="Photos to read">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, not a served image */}
              <img src={previews[i]} alt={`${page === "page" ? "Page" : "Photo"} ${i + 1}`} />
              <span>{page === "page" ? "Page" : "Photo"} {i + 1}</span>
              <button type="button" className="linkbtn" aria-label={`Remove ${page} ${i + 1}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasSheet && files.length > 0 && <p className="faint">Reading new photos replaces the fields below (the old photos stay on the quote).</p>}
      {message && <p className="ss-msg bad" role="status">{message}</p>}
    </div>
  );
}
