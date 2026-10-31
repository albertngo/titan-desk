"use client";

import { useEffect, useMemo, useState } from "react";
import { byDay, timeOf, whenOf, type CamPhoto } from "@/lib/companycam/photos";
import type { CompanyCamResult } from "@/lib/quotes/companycam";

/**
 * The Photos tab (Albert, 2026-10-30): the job's CompanyCam project, laid out like CompanyCam's own
 * timeline, by day, each photo with its time, who took it and its description. A photo opens full
 * size and steps to the next with the arrow keys, the on-screen arrows or a swipe. Read-only: adding,
 * tagging or describing a photo stays in CompanyCam ("Open in CompanyCam" in the header).
 */
export function CompanyCamPhotos({ result, linkUrl }: { result: CompanyCamResult; linkUrl: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const all = useMemo(() => (result.ok ? byDay(result.photos).flatMap((d) => d.photos) : []), [result]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q ? all.filter((p) => [p.description, p.by, ...p.tags].some((s) => s?.toLowerCase().includes(q))) : all),
    [all, q],
  );
  const days = useMemo(() => byDay(shown), [shown]);
  const count = shown.length;

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? null : (i + 1) % count));
      else if (e.key === "ArrowLeft") setOpen((i) => (i === null ? null : (i - 1 + count) % count));
      else if (e.key === "Escape") setOpen(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, count]);

  const projectUrl = result.ok ? result.project.url : linkUrl;
  const head = result.ok
    ? [result.project.name, result.project.address, `${all.length}${result.more ? "+" : ""} photo${all.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")
    : "CompanyCam";

  return (
    <section className="card cam" aria-labelledby="cam-h">
      <div className="card-h" id="cam-h">
        Photos
        <span className="faint cam-sum">{head}</span>
        <a className="right" href={projectUrl} target="_blank" rel="noreferrer">
          Open in CompanyCam ↗
        </a>
      </div>
      {!result.ok ? (
        <p className={`banner ${result.reason === "error" ? "bad" : "warn"}`}>{result.message}</p>
      ) : all.length === 0 ? (
        <p className="empty">No photos in this CompanyCam project yet. They show here as soon as the crew takes them.</p>
      ) : (
        <div className="card-b cam-b">
          <div className="cam-tools">
            <input
              type="search"
              className="cam-search"
              placeholder="Search descriptions, people, tags"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search the photos"
            />
            {q && <span className="faint">{count} of {all.length}</span>}
          </div>
          {result.more && (
            <p className="banner warn">This project has more photos than the app reads at once; the oldest are in CompanyCam.</p>
          )}
          {days.length === 0 && <p className="empty">No photo matches &ldquo;{query}&rdquo;.</p>}
          {days.map((d) => (
            <div key={d.day || "none"} className="cam-day">
              <h3 className="cam-day-h">
                {d.label}
                <span className="faint"> · {d.photos.length}</span>
              </h3>
              <ul className="cam-grid">
                {d.photos.map((p) => (
                  <li key={p.id}>
                    <Tile p={p} onOpen={() => setOpen(shown.indexOf(p))} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {open !== null && shown[open] && (
        <Viewer p={shown[open]} index={open} count={count} onStep={(by) => setOpen((open + by + count) % count)} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

function Tile({ p, onOpen }: { p: CamPhoto; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <figure className="cam-tile">
      {broken ? (
        <a className="cam-thumb file" href={p.pageUrl ?? p.full} target="_blank" rel="noreferrer">
          Open photo ↗
        </a>
      ) : (
        <button type="button" className="cam-thumb" onClick={onOpen} title={p.description ?? "Open the photo"}>
          <img src={p.thumb} alt={p.description ?? "CompanyCam photo"} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
          {p.annotated && <span className="cam-mark">Marked up</span>}
        </button>
      )}
      <figcaption>
        <span className="cam-meta">
          {timeOf(p.at)}
          {p.by && ` · ${p.by}`}
        </span>
        {p.description && <span className="cam-desc">{p.description}</span>}
        {p.tags.length > 0 && (
          <span className="cam-tags">
            {p.tags.map((t) => (
              <span key={t} className="chip">{t}</span>
            ))}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function Viewer({ p, index, count, onStep, onClose }: { p: CamPhoto; index: number; count: number; onStep: (by: number) => void; onClose: () => void }) {
  const [touchX, setTouchX] = useState<number | null>(null);
  const many = count > 1;
  return (
    <div
      className="conv-light cam-light"
      role="dialog"
      aria-label={`Photo ${index + 1} of ${count}`}
      onClick={onClose}
      onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const x = e.changedTouches[0]?.clientX;
        if (touchX !== null && x !== undefined && Math.abs(x - touchX) > 40) onStep(x < touchX ? 1 : -1);
        setTouchX(null);
      }}
    >
      <img src={p.web} alt={p.description ?? "CompanyCam photo"} referrerPolicy="no-referrer" />
      {many && (
        <>
          <button type="button" className="conv-nav prev" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); onStep(-1); }}>
            ‹
          </button>
          <button type="button" className="conv-nav next" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); onStep(1); }}>
            ›
          </button>
        </>
      )}
      <div className="conv-light-bar cam-light-bar" onClick={(e) => e.stopPropagation()}>
        <span>
          {many && <b>{index + 1} of {count} · </b>}
          {whenOf(p.at)}
          {p.by && ` · ${p.by}`}
          {p.description && <span className="cam-light-desc">{p.description}</span>}
        </span>
        {p.pageUrl && (
          <a className="btn small" href={p.pageUrl} target="_blank" rel="noreferrer">
            In CompanyCam ↗
          </a>
        )}
        <a className="btn small" href={p.full} target="_blank" rel="noreferrer">
          Full size ↗
        </a>
        <button type="button" className="btn small" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
