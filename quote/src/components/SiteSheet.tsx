"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveSiteSheetAction } from "@/app/q/[id]/actions";
import { shrinkImage } from "@/lib/bug/shrink";
import { optionTotals } from "@/lib/calc";
import { buildCatalogue, draftKey, type EditorQuote } from "@/lib/editor/model";
import { money } from "@/lib/format";
import type { RateCard, SiteSheetResult } from "@/lib/quotes/types";
import { derive } from "@/lib/sitesheet/derive";
import { buildOptions } from "@/lib/sitesheet/options";
import { cleanSheet, emptySheet, MAX_NOSINGS, MAX_RUNS, type NosingPiece, type RailRun, parseStored, type SiteSheet } from "@/lib/sitesheet/sheet";
import { SiteSheetPaper } from "./SiteSheetPaper";

/**
 * The Site sheet tab (Albert, 2026-10-28). Upload photos of the stair site sheet; Claude reads them into
 * the sheet's fields; a person checks them beside the photos and saves; then Build stair options puts one
 * priced option per viable choice into the editor's draft for this quote, where it is reviewed and saved
 * as a new version as usual. Nothing here writes a quote line: the editor does, as it always has.
 */

type Photo = { url: string; name: string };
type Path = string;

function get(s: SiteSheet, path: Path): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), s);
}
function set(s: SiteSheet, path: Path, value: unknown): SiteSheet {
  const keys = path.split(".");
  const out = structuredClone(s) as unknown as Record<string, unknown>;
  let o = out;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys[keys.length - 1]] = value;
  return out as unknown as SiteSheet;
}

/** Both pages, with room for a retake or a close-up. */
const MAX_PHOTOS = 4;

export function SiteSheetTab({
  quoteRecordId,
  versionId,
  raw,
  photos: photos0,
  initial,
  base,
  card,
  enabled,
}: {
  quoteRecordId: string;
  versionId: string;
  raw: string;
  photos: Photo[];
  initial: EditorQuote;
  base: string;
  card: RateCard;
  enabled: boolean;
}) {
  const [seen, setSeen] = useState(raw);
  const stored = useMemo(() => parseStored(seen), [seen]);
  const [sheet, setSheet] = useState<SiteSheet>(() => stored?.sheet ?? emptySheet());
  const [photos, setPhotos] = useState<Photo[]>(photos0);
  const [files, setFiles] = useState<File[]>([]);
  // Picks add up (2026-10-28: only one photo could be attached): take page 1, then page 2, or choose several.
  // The input's FileList is live: clearing the input (so the same photo can be picked again) empties it, so it
  // is copied here, before the clear, never read later inside the state update (2026-10-28: a second photo was lost).
  const addFiles = (input: HTMLInputElement) => {
    const picked = Array.from(input.files ?? []).filter((x) => !x.type || x.type.startsWith("image/"));
    input.value = "";
    setFiles((f) => [...f, ...picked].slice(0, MAX_PHOTOS));
  };
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, startSave] = useTransition();
  const router = useRouter();

  const catalogue = useMemo(() => buildCatalogue(card.rates, card.stairs, card.materials), [card]);
  // Boxes hold what was typed ("6." on the way to "6.5"); everything else works on the cleaned sheet.
  const clean = useMemo(() => cleanSheet(sheet), [sheet]);
  const d = useMemo(() => derive(clean), [clean]);
  const built = useMemo(() => buildOptions(clean, catalogue), [clean, catalogue]);
  const dirty = JSON.stringify(clean) !== JSON.stringify(stored?.sheet ?? emptySheet());
  const unclear = new Set(sheet.unclear);
  const edit = (path: Path, v: unknown) => setSheet((s) => set(s, path, v));

  async function read() {
    if (files.length === 0) return;
    setReading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("quoteRecordId", quoteRecordId);
      form.set("seen", seen);
      for (const f of files) form.append("photos", await shrinkImage(f, 2000, 0.85));
      const res = await fetch("/api/sitesheet", { method: "POST", body: form });
      const r = (await res.json().catch(() => ({ ok: false, message: "The server didn't answer. Try again." }))) as SiteSheetResult;
      if (!r.ok) return setMessage({ text: r.message, bad: true });
      setSeen(r.saved);
      setSheet(parseStored(r.saved)?.sheet ?? emptySheet());
      if (r.photos) setPhotos(r.photos);
      setFiles([]);
      setMessage({ text: `Read. Check every field against the photo, then Save check.${r.note ? ` ${r.note}` : ""}`, bad: false });
    } finally {
      setReading(false);
    }
  }

  function save() {
    setMessage(null);
    startSave(async () => {
      // A person has now checked every field against the photo, so nothing stays marked unsure.
      const r = await saveSiteSheetAction(quoteRecordId, seen, { ...clean, unclear: [] });
      if (!r.ok) return setMessage({ text: r.message, bad: true });
      setSeen(r.saved);
      setSheet(parseStored(r.saved)?.sheet ?? clean);
      setMessage({ text: "Checked and saved.", bad: false });
    });
  }

  function buildIntoEditor() {
    // The editor's own key for this version's draft, so it opens with these options in it.
    const key = draftKey(initial);
    let start: { quote: EditorQuote; base?: string } = { quote: initial, base };
    try {
      const prev = window.localStorage.getItem(key);
      if (prev) start = JSON.parse(prev) as { quote: EditorQuote; base?: string };
    } catch {
      // No storage: start from the version as saved.
    }
    let q = start.quote;
    for (const o of built.options) {
      const id = `opt-ss-${o.kind}-${Date.now().toString(36)}`;
      // Stairs options (2026-10-28): quoted beside the flooring, one of each taken. Recommended only if no stairs option already is.
      const stairsRec = q.options.some((x) => x.recommended && x.scope === "Stairs");
      q = { ...q, options: [...q.options, { id, name: o.name, description: o.description, recommended: o.recommended && !stairsRec, serviceLevel: "Standard", crew: null, scope: "Stairs", lines: o.lines }] };
    }
    try {
      window.localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), quote: q, base: start.base ?? base }));
    } catch {
      setMessage({ text: "This device won't keep a draft (private browsing?), so the options can't be handed to the editor.", bad: true });
      return;
    }
    router.push(`/q/${versionId}/edit`);
  }

  if (!enabled) {
    return (
      <section className="card">
        <div className="card-h">Site sheet</div>
        <p className="empty">Reading site sheets isn&apos;t switched on yet: the staff app needs its Claude key (see the README). Until then, price the stairs in the editor.</p>
      </section>
    );
  }

  const pieces: NosingPiece[] = Array.from({ length: MAX_NOSINGS }, (_, i) => sheet.nosings[i] ?? { ft: null, depth: null, thickness: null, sand: false });
  const runs: RailRun[] = Array.from({ length: MAX_RUNS }, (_, i) => sheet.runs[i] ?? { ft: null, where: null, curved: false, pickets: false, picketFt: null });
  const setRun = (i: number, patch: Partial<RailRun>) => edit("runs", runs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setPiece = (i: number, patch: Partial<(typeof pieces)[number]>) => {
    const next = pieces.map((p, j) => (j === i ? { ...p, ...patch } : p));
    edit("nosings", next);
  };

  return (
    <div className="ss">
      <section className="card">
        <div className="card-h">
          Site sheet
          {stored && <span className="right faint">{stored.checked ? "checked" : "read, not checked yet"} · {stored.by} · {new Date(stored.at).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
        </div>
        <div className="card-b ss-up">
          <p className="faint">Photograph both pages of the stair site sheet, flat and in good light, with the four black corner squares in the picture.</p>
          <div className="ss-up-row">
            {/* The camera takes one shot at a time; the library allows several. Both add to the list. */}
            <label className={`btn${files.length >= MAX_PHOTOS ? " disabled" : ""}`}>
              Take a photo
              <input type="file" accept="image/*" capture="environment" hidden disabled={files.length >= MAX_PHOTOS} aria-label="Take a photo of a page" onChange={(e) => addFiles(e.currentTarget)} />
            </label>
            <label className={`btn${files.length >= MAX_PHOTOS ? " disabled" : ""}`}>
              Choose photos
              <input type="file" accept="image/*" multiple hidden disabled={files.length >= MAX_PHOTOS} aria-label="Choose photos of the site sheet" onChange={(e) => addFiles(e.currentTarget)} />
            </label>
            <button type="button" className="btn primary" disabled={files.length === 0 || reading} onClick={read}>
              {reading ? "Reading… about a minute" : files.length ? `Read ${files.length} photo${files.length === 1 ? "" : "s"}` : stored ? "Read new photos" : "Read the sheet"}
            </button>
          </div>
          {files.length > 0 && (
            <ul className="ss-picked" aria-label="Photos to read">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, not a served image */}
                  <img src={previews[i]} alt={`Page ${i + 1}`} />
                  <span>Page {i + 1}</span>
                  <button type="button" className="linkbtn" aria-label={`Remove page ${i + 1}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {stored && files.length > 0 && <p className="faint">Reading new photos replaces the fields below (the old photos stay on the quote).</p>}
          {message && <p className={message.bad ? "ss-msg bad" : "ss-msg ok"} role="status">{message.text}</p>}
        </div>
      </section>

      {stored && (
        <div className="ss-cols">
          <div className="ss-check" aria-label="What was read, on the sheet">
            <div className="ss-check-h">
              <b>What was read</b>, drawn on the sheet: check each page against its photo. Tap a bubble or tick to change it; tap a filled one again to clear it.
              {sheet.unclear.length > 0 && <span className="ss-unclear-note"> {sheet.unclear.length} marked in yellow to check.</span>}
            </div>
            {([1, 2] as const).map((page) => (
              <div className="ss-pair" key={page}>
                <div className="ss-shot">
                  {photos[page - 1] ? (
                    <a href={photos[page - 1].url} target="_blank" rel="noreferrer" title="Open full size">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photos[page - 1].url} alt={`Photo ${page}: ${photos[page - 1].name}`} />
                    </a>
                  ) : (
                    <p className="faint">No photo {page} on the quote.</p>
                  )}
                </div>
                <SiteSheetPaper page={page} sheet={sheet} get={(path) => get(sheet, path)} edit={edit} pieces={pieces} runs={runs} setPiece={setPiece} setRun={setRun} unclear={unclear} treadsAddUp={d.treads} />
              </div>
            ))}
            {photos.length > 2 && (
              <div className="ss-more">
                {photos.slice(2).map((ph) => (
                  <a key={ph.url} href={ph.url} target="_blank" rel="noreferrer" title="Open full size">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ph.url} alt={ph.name} />
                  </a>
                ))}
              </div>
            )}
          </div>

          <section className="card ss-result" aria-label="What it comes to">
            <div className="card-h">What it comes to</div>
            <div className="card-b">
              <dl className="ss-dl">
                <div><dt>Treads</dt><dd>{d.treads}{d.sideTreads ? ` + ${d.sideTreads} side` : ""}</dd></div>
                <div><dt>Risers</dt><dd>{d.risers}</dd></div>
                <div><dt>Open sides</dt><dd>{d.openSides === 0 ? "boxed" : [d.open.left && "left", d.open.right && "right"].filter(Boolean).join(" and ")}</dd></div>
                <div><dt>Spindles</dt><dd>{d.spindles.value} <span className="faint">({d.spindles.how}{d.spindles.how === "written" ? `, estimate ${d.spindles.estimate}` : ""})</span></dd></div>
                <div><dt>Picket heights</dt><dd>{d.heights.h36} × 36&quot;, {d.heights.h39} × 39&quot;{d.heights.h42 ? `, ${d.heights.h42} × 42"` : ""}</dd></div>
                <div><dt>Nosing pieces</dt><dd>{d.nosing.pieces} ({d.nosing.feet} ft{d.nosing.sandPieces ? `, ${d.nosing.sandPieces} sanded` : ""}{d.nosing.holedPieces ? `, ${d.nosing.holedPieces} with picket holes` : ""})</dd></div>
                <div><dt>Handrail</dt><dd>{d.rail.straightFt} ft straight{d.rail.curvedFt ? `, ${d.rail.curvedFt} ft curved` : ""}</dd></div>
                <div><dt>Oak for landings</dt><dd>{d.oakBoxes} box{d.oakBoxes === 1 ? "" : "es"}</dd></div>
              </dl>
              {d.notes.length > 0 && <ul>{d.notes.map((x) => <li key={x}>{x}</li>)}</ul>}
              {d.flags.length > 0 && (
                <ul className="ss-flags">
                  {d.flags.map((f) => <li key={f}>{f}</li>)}
                </ul>
              )}
              <h4>Options it will build</h4>
              {built.options.length === 0 && <p className="faint">None yet: tick what the customer wants (G1).</p>}
              {built.options.map((o) => (
                <div key={o.kind} className="ss-opt">
                  <div className="ss-opt-h">
                    <b>{o.name}</b>
                    <span>{money(optionTotals(o.lines, 0, false).subtotal)} <span className="faint">before HST · {o.lines.length} lines</span></span>
                  </div>
                  {o.notes.some((n) => !d.notes.includes(n)) && <ul>{o.notes.filter((n) => !d.notes.includes(n)).map((n) => <li key={n}>{n}</li>)}</ul>}
                </div>
              ))}
              {built.dropped.map((x) => (
                <p key={x.kind} className="ss-drop"><b>{x.name}</b> not offered: {x.why}</p>
              ))}
              <div className="ss-acts">
                <button type="button" className="btn" disabled={saving || (!dirty && !!stored?.checked)} onClick={save}>{saving ? "Saving…" : "Save check"}</button>
                <button type="button" className="btn primary" disabled={built.options.length === 0 || dirty || !stored?.checked} onClick={buildIntoEditor} title={dirty || !stored?.checked ? "Save check first" : undefined}>
                  Build stair options →
                </button>
              </div>
              <p className="faint">Build adds these as new options to this quote in the editor, priced at Standard. Review them there and save.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
