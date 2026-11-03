"use client";

import { useState } from "react";
import { camSheetPhotosAction } from "@/app/q/[id]/actions";
import type { CamSheetPhoto, SiteSheetResult } from "@/lib/quotes/types";

/**
 * Site sheets from CompanyCam (Albert, 2026-11-03: "Just the upload of the sheets from companycam. We can choose
 * which one it is"). Loads the job's CompanyCam photos, newest first, with those tagged or described as a site
 * sheet ticked; staff tick the pages and say which sheet they are. The server downloads the photos itself from the
 * quote's own project, by id: no image passes through the browser, and nothing is written to CompanyCam.
 */

const MAX = 4;
type Kind = "stairs" | "flooring";

export function CamSheetPicker({
  quoteRecordId,
  stairSeen,
  floorSeen,
  onRead,
}: {
  quoteRecordId: string;
  stairSeen: string;
  floorSeen: string;
  onRead: (kind: Kind, r: Extract<SiteSheetResult, { ok: true }>) => void;
}) {
  const [photos, setPhotos] = useState<CamSheetPhoto[] | null>(null);
  const [more, setMore] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState<Kind | null>(null);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const r = await camSheetPhotosAction(quoteRecordId).catch(() => null);
      if (!r || !r.ok) return setMessage({ text: r?.message ?? "CompanyCam didn't answer. Try again.", bad: true });
      setPhotos(r.photos);
      setMore(r.more);
      setPicked(r.photos.filter((p) => p.sheet).slice(0, MAX).map((p) => p.id));
      if (r.photos.length === 0) setMessage({ text: "This job's CompanyCam project has no photos yet.", bad: false });
    } finally {
      setLoading(false);
    }
  }

  async function read(kind: Kind) {
    setReading(kind);
    setMessage(null);
    try {
      const res = await fetch("/api/sitesheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quoteRecordId, seen: kind === "flooring" ? floorSeen : stairSeen, photoIds: picked, kind }),
      });
      const r = (await res.json().catch(() => ({ ok: false, message: "The server didn't answer. Try again." }))) as SiteSheetResult;
      if (!r.ok) return setMessage({ text: r.message, bad: true });
      setMessage({ text: `Read as the ${kind === "flooring" ? "flooring" : "stair"} sheet. Check every field against the photo below.${r.note ? ` ${r.note}` : ""}`, bad: false });
      onRead(kind, r);
    } finally {
      setReading(null);
    }
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX ? p : [...p, id]));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Date unknown");

  return (
    <section className="card cam-pick" aria-label="Site sheets from CompanyCam">
      <div className="card-h">From CompanyCam</div>
      <div className="card-b">
        {!photos ? (
          <div className="ss-up-row">
            <p className="faint">Pick the site sheet photos the PM took in CompanyCam, and say which sheet they are.</p>
            <button type="button" className="btn" disabled={loading} onClick={load}>{loading ? "Loading photos…" : "Load the job's photos"}</button>
          </div>
        ) : (
          <>
            <p className="faint">
              Tick the pages of one sheet (up to {MAX}), newest first. Photos tagged or described as a site sheet are ticked for you.
              {more && " Only the newest 600 are shown."}
            </p>
            <ul className="cam-pick-grid">
              {photos.map((p) => {
                const on = picked.includes(p.id);
                const n = picked.indexOf(p.id) + 1;
                return (
                  <li key={p.id}>
                    <button type="button" className={`cam-pick-p${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(p.id)} title={p.description ?? undefined}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a CompanyCam thumbnail */}
                      <img src={p.thumb} alt={p.description ?? `Photo taken ${when(p.at)}`} loading="lazy" />
                      {on && <span className="cam-pick-n">Page {n}</span>}
                      {p.sheet && <span className="cam-pick-tag">Site sheet</span>}
                      <span className="cam-pick-when">{when(p.at)}{p.by ? ` · ${p.by}` : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="ss-up-row">
              <button type="button" className="btn primary" disabled={picked.length === 0 || reading !== null} onClick={() => read("flooring")}>
                {reading === "flooring" ? "Reading… about a minute" : "Read as flooring sheet"}
              </button>
              <button type="button" className="btn primary" disabled={picked.length === 0 || reading !== null} onClick={() => read("stairs")}>
                {reading === "stairs" ? "Reading… about a minute" : "Read as stair sheet"}
              </button>
              <button type="button" className="linkbtn" disabled={loading || reading !== null} onClick={load}>Load again</button>
            </div>
            <p className="faint">Reading replaces that sheet&apos;s fields below. The photos are copied onto the quote so the sheet can be checked against them.</p>
          </>
        )}
        {message && <p className={message.bad ? "ss-msg bad" : "ss-msg ok"} role="status">{message.text}</p>}
      </div>
    </section>
  );
}
