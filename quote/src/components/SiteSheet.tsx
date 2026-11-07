"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveSiteSheetAction } from "@/app/q/[id]/actions";
import { optionTotals } from "@/lib/calc";
import { buildCatalogue, draftKey, type EditorQuote } from "@/lib/editor/model";
import { newOptionIds, withFees } from "@/lib/quotes/fees";
import { money } from "@/lib/format";
import type { RateCard } from "@/lib/quotes/types";
import { derive } from "@/lib/sitesheet/derive";
import { buildOptions } from "@/lib/sitesheet/options";
import { cleanSheet, emptySheet, MAX_NOSINGS, MAX_RUNS, type NosingPiece, type RailRun, parseStored, type SiteSheet } from "@/lib/sitesheet/sheet";
import { SheetSource } from "./SheetSource";
import { FloorSheetPanel } from "./FloorSheetPanel";
import { SiteSheetPaper } from "./SiteSheetPaper";
import { useSheetPreviews } from "./useSheetPreviews";

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

export function SiteSheetTab({
  quoteRecordId,
  versionId,
  raw,
  photos: photos0,
  initial,
  base,
  card,
  measured = true,
  enabled,
  camLinked = false,
  floorRaw = "",
  floorPhotos: floorPhotos0 = [],
  roomsRaw = "",
}: {
  quoteRecordId: string;
  versionId: string;
  raw: string;
  photos: Photo[];
  initial: EditorQuote;
  base: string;
  card: RateCard;
  /** The version is measured (2026-11-06): its new flooring options start with the delivery fee. */
  measured?: boolean;
  enabled: boolean;
  /** The quote links a CompanyCam project (2026-11-03): sheets can be picked from its photos. */
  camLinked?: boolean;
  /** Quotes → Flooring Sheet as stored, its photos, and Quotes → Rooms as stored (for Copy rooms). */
  floorRaw?: string;
  floorPhotos?: Photo[];
  roomsRaw?: string;
}) {
  const [seen, setSeen] = useState(raw);
  const stored = useMemo(() => parseStored(seen), [seen]);
  const [sheet, setSheet] = useState<SiteSheet>(() => stored?.sheet ?? emptySheet());
  const [photos, setPhotos] = useState<Photo[]>(photos0);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [saving, startSave] = useTransition();
  // The photo each page is checked against (2026-11-03): this read's copy on the quote, else its CompanyCam photo.
  const { previews, remember } = useSheetPreviews(quoteRecordId, stored, photos, camLinked);
  const router = useRouter();

  const catalogue = useMemo(() => buildCatalogue(card.rates, card.stairs, card.materials), [card]);
  // Boxes hold what was typed ("6." on the way to "6.5"); everything else works on the cleaned sheet.
  const clean = useMemo(() => cleanSheet(sheet), [sheet]);
  const d = useMemo(() => derive(clean), [clean]);
  const built = useMemo(() => buildOptions(clean, catalogue), [clean, catalogue]);
  const dirty = JSON.stringify(clean) !== JSON.stringify(stored?.sheet ?? emptySheet());
  const unclear = new Set(sheet.unclear);
  const edit = (path: Path, v: unknown) => setSheet((s) => set(s, path, v));

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

  // The checks never stop a build (Albert, 2026-10-31: "just FYI … never a restrictor"): no Save check needed. Edits
  // made here are kept first, without marking the sheet checked; if that save fails, the options are built anyway.
  function build() {
    if (!dirty) return buildIntoEditor();
    startSave(async () => {
      await saveSiteSheetAction(quoteRecordId, seen, clean, stored?.checked === true).catch(() => null);
      buildIntoEditor();
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
      q = { ...q, options: [...q.options, { id, name: o.name, description: o.description, recommended: false /* never picked for you (Albert, 2026-11-06) */, serviceLevel: "Standard", crew: null, scope: "Stairs", lines: o.lines }] };
    }
    // Each new option starts with its fee (2026-11-06): the stair base fee, in Private.
    q = withFees(q, catalogue, measured, newOptionIds(start.quote, q));
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
      {/* The flooring sheet (2026-11-03) at the top of the page: drawn from its CompanyCam photo, checked on the paper copy. */}
      <FloorSheetPanel
        quoteRecordId={quoteRecordId}
        raw={floorRaw}
        photos={floorPhotos0}
        roomsRaw={roomsRaw}
        initial={initial}
        base={base}
        versionId={versionId}
        camLinked={camLinked}
        catalogue={catalogue}
        measured={measured}
      />

      <section className="card">
        <div className="card-h">
          Stair sheet
          {stored && <span className="right faint">{stored.checked ? "checked" : "read, not checked yet"} · {stored.by} · {new Date(stored.at).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
        </div>
        <div className="card-b">
          <SheetSource
            quoteRecordId={quoteRecordId}
            seen={seen}
            kind="stairs"
            camLinked={camLinked}
            hasSheet={Boolean(stored)}
            preselect={stored?.cam.map((c) => c.id) ?? []}
            hint="Photograph both pages of the stair site sheet, flat and in good light, with the four black corner squares in the picture."
            onCleared={() => {
              setSeen("");
              setSheet(emptySheet());
              setMessage({ text: "Cleared. Draw or read the stair sheet again.", bad: false });
            }}
            onRead={(r, how, picked) => {
              remember(picked);
              setSeen(r.saved);
              setSheet(parseStored(r.saved)?.sheet ?? emptySheet());
              if (r.photos) setPhotos(r.photos);
              setMessage({ text: `${how === "companycam" ? "Drawn" : "Read"}. Check every field against the photo, then Save check.${r.note ? ` ${r.note}` : ""}`, bad: false });
            }}
          />
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
            {([1, 2] as const).map((page) => {
              const shot = previews[page - 1] ?? null;
              return (
                <div className={`ss-pair${shot ? "" : " solo"}`} key={page}>
                  {shot ? (
                    <figure className="ss-shot">
                      <a href={shot.href} target="_blank" rel="noreferrer" title={shot.from === "companycam" ? "Open in CompanyCam" : "Open full size"}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- the sheet's own photo, on the quote or in CompanyCam */}
                        <img src={shot.url} alt={`Page ${page} of the stair sheet, as photographed`} />
                      </a>
                      <figcaption className="faint">
                        Page {page} · {shot.from === "companycam" ? "CompanyCam's copy" : "on the quote"} ·{" "}
                        <a href={shot.href} target="_blank" rel="noreferrer">
                          {shot.from === "companycam" ? "Open in CompanyCam" : "Open full size"} ↗
                        </a>
                      </figcaption>
                    </figure>
                  ) : (
                    <p className="faint ss-noshot">No photo of page {page} to compare against{page === 2 && previews.length === 1 ? ": only one photo was read" : ""}.</p>
                  )}
                  <SiteSheetPaper page={page} sheet={sheet} get={(path) => get(sheet, path)} edit={edit} pieces={pieces} runs={runs} setPiece={setPiece} setRun={setRun} unclear={unclear} treadsAddUp={d.treads} pizzaCustom={d.custom.pizzaSets} />
                </div>
              );
            })}
            {previews.length > 2 && (
              <div className="ss-more">
                {previews.slice(2).flatMap((ph) =>
                  ph
                    ? [
                        <a key={ph.url} href={ph.href} target="_blank" rel="noreferrer" title={`Photo ${ph.page}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={ph.url} alt={`Photo ${ph.page} of the stair sheet`} />
                        </a>,
                      ]
                    : [],
                )}
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
              {built.options.map((o) => (
                <div key={o.kind} className="ss-opt">
                  <div className="ss-opt-h">
                    <b>{o.name}</b>
                    <span>{money(optionTotals(o.lines, 0, false).subtotal)} <span className="faint">before HST · {o.lines.length} lines</span></span>
                  </div>
                  {o.notes.some((n) => !d.notes.includes(n)) && <ul>{o.notes.filter((n) => !d.notes.includes(n)).map((n) => <li key={n}>{n}</li>)}</ul>}
                </div>
              ))}
              <div className="ss-acts">
                <button type="button" className="btn" disabled={saving || (!dirty && !!stored?.checked)} onClick={save}>{saving ? "Saving…" : "Save check"}</button>
                <button type="button" className="btn primary" disabled={built.options.length === 0 || saving} onClick={build}>
                  Build stair options →
                </button>
              </div>
              <p className="faint">Build adds these as new options to this quote in the editor, priced at Standard. Review them there and save. The checks above are for your information; they never stop a build.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
