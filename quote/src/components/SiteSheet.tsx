"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveSiteSheetAction } from "@/app/q/[id]/actions";
import { shrinkImage } from "@/lib/bug/shrink";
import { optionTotals } from "@/lib/calc";
import { buildCatalogue, type EditorQuote } from "@/lib/editor/model";
import { money } from "@/lib/format";
import type { RateCard, SiteSheetResult } from "@/lib/quotes/types";
import { derive } from "@/lib/sitesheet/derive";
import { buildOptions } from "@/lib/sitesheet/options";
import { cleanSheet, emptySheet, MAX_NOSINGS, MAX_RUNS, THICKNESSES, type NosingPiece, type RailRun, ON_STEPS, parseStored, SHAPES, TREAD_NAME, TREAD_TYPES, WANT_TREADS, WHERE, type SiteSheet } from "@/lib/sitesheet/sheet";

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
const WANT_LABEL: Record<string, string> = { sand: "Sand & refinish caps", caps: "New wood caps", vinylTreads: "Vinyl treads", vinylSteps: "Vinyl steps", unsure: "Not sure" };
const THICK_LABEL: Record<string, string> = { "1/2": "½\"", "3/4": "¾\"", unsure: "not sure" };
const WHERE_LABEL: Record<string, string> = { Main: "Main", Basement: "Basement", Townhome: "Townhome", Side: "Side / half" };

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
    const key = `titan-quote-draft:${quoteRecordId}`;
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

  const num = (path: Path, label?: string, w = 64) => (
    <input
      className="in ss-num"
      style={{ width: w }}
      inputMode="decimal"
      aria-label={label ?? path}
      value={get(sheet, path) === null || get(sheet, path) === undefined ? "" : String(get(sheet, path))}
      onChange={(e) => edit(path, e.target.value.trim() === "" ? null : e.target.value)}
    />
  );
  const choice = (path: Path, opts: readonly (string | number)[], labels?: Record<string, string>) => (
    <select className="in ss-sel" aria-label={path} value={get(sheet, path) === null ? "" : String(get(sheet, path))} onChange={(e) => edit(path, e.target.value === "" ? null : typeof opts[0] === "number" ? Number(e.target.value) : e.target.value)}>
      <option value="">—</option>
      {opts.map((o) => (
        <option key={String(o)} value={String(o)}>
          {labels?.[String(o)] ?? String(o)}
        </option>
      ))}
    </select>
  );
  const multi = (path: Path, opts: readonly string[], labels: Record<string, string>) => {
    const cur = (get(sheet, path) as string[]) ?? [];
    return (
      <span className="ss-multi">
        {opts.map((o) => (
          <label key={o}>
            <input type="checkbox" checked={cur.includes(o)} onChange={(e) => edit(path, e.target.checked ? [...cur, o] : cur.filter((x) => x !== o))} /> {labels[o] ?? o}
          </label>
        ))}
      </span>
    );
  };
  const tick = (path: Path, label: string) => (
    <label className="ss-tick">
      <input type="checkbox" checked={get(sheet, path) === true} onChange={(e) => edit(path, e.target.checked)} /> {label}
    </label>
  );
  const code = (c: string) => <span className={`ss-code${unclear.has(c) ? " unclear" : ""}`} title={unclear.has(c) ? "Not read with confidence: check the photo" : undefined}>{c}</span>;
  const row = (c: string, label: string, body: React.ReactNode) => (
    <div className={`ss-row${unclear.has(c) ? " unclear" : ""}`}>
      <span className="ss-k">
        {code(c)} {label}
      </span>
      <span className="ss-v">{body}</span>
    </div>
  );

  if (!enabled) {
    return (
      <section className="card">
        <div className="card-h">Site sheet</div>
        <p className="empty">Reading site sheets isn&apos;t switched on yet: the staff app needs its Claude key (see the README). Until then, price the stairs in the editor.</p>
      </section>
    );
  }

  const pieces: NosingPiece[] = Array.from({ length: MAX_NOSINGS }, (_, i) => sheet.nosings[i] ?? { ft: null, type: null, thickness: null, sand: false });
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
          <section className="card ss-photos" aria-label="Photos">
            <div className="card-h">Photos ({photos.length})</div>
            <div className="card-b">
              {photos.length === 0 ? (
                <p className="faint">No photos on the quote.</p>
              ) : (
                photos.map((p) => (
                  <a key={p.url} href={p.url} target="_blank" rel="noreferrer" title="Open full size">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.name} />
                  </a>
                ))
              )}
            </div>
          </section>

          <section className="card ss-fields" aria-label="What was read">
            <div className="card-h">
              What was read
              {sheet.unclear.length > 0 && <span className="right ss-unclear-note">{sheet.unclear.length} to check against the photo</span>}
            </div>
            <div className="card-b">
              <h4>The staircase</h4>
              {row("Q", "Quote on the sheet", <input className="in" style={{ width: 120 }} value={sheet.quoteNumber ?? ""} onChange={(e) => edit("quoteNumber", e.target.value || null)} />)}
              {row("A1", "Where", multi("where", WHERE, WHERE_LABEL))}
              {row("A2", "Main shape", choice("shape", SHAPES))}
              {row("A3", "On the steps now", choice("onSteps", ON_STEPS))}

              <h4>Treads {code("B1")}–{code("B4")}</h4>
              <div className="ss-tbl">
                <table>
                  <thead>
                    <tr><th></th><th>36&quot;</th><th>42&quot;</th><th>48&quot;</th><th>Other</th><th>width</th></tr>
                  </thead>
                  <tbody>
                    {TREAD_TYPES.map((t) => (
                      <tr key={t}>
                        <th>{TREAD_NAME[t]}</th>
                        {(["w36", "w42", "w48", "other", "otherWidth"] as const).map((k) => <td key={k}>{num(`treads.${t}.${k}`, `${TREAD_NAME[t]} ${k}`, 52)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {row("B5", "Tread depth (0 = standard 10-5/8\")", num("treadDepth"))}
              <div className="ss-tbl">
                <table>
                  <thead>
                    <tr><th></th><th>LSO</th><th>RSO</th><th>2 side</th></tr>
                  </thead>
                  <tbody>
                    <tr className={unclear.has("B6") ? "unclear" : ""}>
                      <th>{code("B6")} Pie</th>
                      {(["lso", "rso", "two"] as const).map((k) => <td key={k}>{num(`pie.${k}`, `pie ${k}`, 52)}</td>)}
                    </tr>
                    <tr className={unclear.has("B8") ? "unclear" : ""}>
                      <th>{code("B8")} Bullnose</th>
                      {(["lso", "rso", "two"] as const).map((k) => <td key={k}>{num(`bullnose.${k}`, `bullnose ${k}`, 52)}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
              {row("B7", "Pizza sets: how many, 2 side open, pieces", <>{num("pizza.sets", "pizza sets")} {tick("pizza.twoSide", "2 side open")} {choice("pizza.pieces", [2, 3], { "2": "2-pc", "3": "3-pc" })}{d.custom.pizzaSets > 0 && <span className="faint"> custom</span>}</>)}
              {row("B9", "Total treads", <>{num("totalTreads")} <span className="faint">boxes add up to {d.treads}</span></>)}
              {row("B10", "Side / half staircase", <>{num("side.steps", "side steps")} steps {choice("side.type", TREAD_TYPES, TREAD_NAME)} {num("side.width", "side width")}&quot;</>)}

              <h4>Landings, half moons, stringers</h4>
              {row("C1", "Landings 3×3 / 3×6 / other", <>{num("landings.s3x3", "3x3")} {num("landings.s3x6", "3x6")} {num("landings.other", "other")}</>)}
              {row("C2", "Half moons, nosing ft", <>{num("halfMoons.count", "half moons")} {num("halfMoons.nosingFt", "half moon nosing")} {tick("halfMoons.solid", "solid one-piece")}</>)}
              {row("D1", "Stringers now", choice("stringers.now", ["White", "Stained", "Other"]))}
              {row("D2", "Stringers made of", choice("stringers.made", ["Veneer", "Solid", "Don't know"]))}

              <h4>Nosings</h4>
              {row("E1", "Default: thickness / depth (blank = 4.5\")", <>{tick("nosingDefault.carpet", "carpet on now")} {choice("nosingDefault.thickness", THICKNESSES, THICK_LABEL)} {num("nosingDefault.depth", "nosing depth")}</>)}
              <div className={`ss-tbl${unclear.has("E2") ? " unclear" : ""}`}>
                <table>
                  <thead>
                    <tr><th>{code("E2")}</th>{pieces.map((_, i) => <th key={i}>{i + 1}</th>)}</tr>
                  </thead>
                  <tbody>
                    <tr><th>Length ft</th>{pieces.map((p, i) => <td key={i}><input className="in ss-num" style={{ width: 46 }} inputMode="decimal" aria-label={`nosing ${i + 1} length`} value={p.ft ?? ""} onChange={(e) => setPiece(i, { ft: e.target.value === "" ? null : (e.target.value as unknown as number) })} /></td>)}</tr>
                    <tr><th>Depth if diff.</th>{pieces.map((p, i) => <td key={i}><input className="in ss-num" style={{ width: 46 }} inputMode="decimal" aria-label={`nosing ${i + 1} depth`} value={p.depth ?? ""} onChange={(e) => setPiece(i, { depth: e.target.value === "" ? null : (e.target.value as unknown as number) })} /></td>)}</tr>
                    <tr><th>Thick if diff.</th>{pieces.map((p, i) => (
                      <td key={i}>
                        <select className="in ss-sel" aria-label={`nosing ${i + 1} thickness`} value={p.thickness ?? ""} onChange={(e) => setPiece(i, { thickness: (e.target.value || null) as NosingPiece["thickness"] })}>
                          <option value="">—</option>
                          {THICKNESSES.filter((t) => t !== "unsure").map((t) => <option key={t} value={t}>{THICK_LABEL[t]}</option>)}
                        </select>
                      </td>
                    ))}</tr>
                    <tr><th>Sand</th>{pieces.map((p, i) => <td key={i}><input type="checkbox" aria-label={`nosing ${i + 1} sand`} checked={p.sand} onChange={(e) => setPiece(i, { sand: e.target.checked })} /></td>)}</tr>
                  </tbody>
                </table>
              </div>

              <h4>Railing as it is</h4>
              <div className={`ss-tbl${unclear.has("F1") ? " unclear" : ""}`}>
                <table>
                  <thead>
                    <tr><th>{code("F1")}</th>{runs.map((_, i) => <th key={i}>{i + 1}</th>)}</tr>
                  </thead>
                  <tbody>
                    <tr><th>Length ft</th>{runs.map((x, i) => <td key={i}><input className="in ss-num" style={{ width: 46 }} inputMode="decimal" aria-label={`run ${i + 1} length`} value={x.ft ?? ""} onChange={(e) => setRun(i, { ft: e.target.value === "" ? null : (e.target.value as unknown as number) })} /></td>)}</tr>
                    <tr><th>Where</th>{runs.map((x, i) => (
                      <td key={i}>
                        <select className="in ss-sel" aria-label={`run ${i + 1} where`} value={x.where ?? ""} onChange={(e) => setRun(i, { where: (e.target.value || null) as RailRun["where"] })}>
                          <option value="">—</option>
                          <option value="S">steps</option>
                          <option value="F">flat</option>
                          <option value="W">wall</option>
                        </select>
                      </td>
                    ))}</tr>
                    <tr><th>Curved</th>{runs.map((x, i) => <td key={i}><input type="checkbox" aria-label={`run ${i + 1} curved`} checked={x.curved} onChange={(e) => setRun(i, { curved: e.target.checked })} /></td>)}</tr>
                    <tr><th>Pickets</th>{runs.map((x, i) => <td key={i}><input type="checkbox" aria-label={`run ${i + 1} pickets`} checked={x.pickets} onChange={(e) => setRun(i, { pickets: e.target.checked })} /></td>)}</tr>
                    <tr><th>…or ft</th>{runs.map((x, i) => <td key={i}><input className="in ss-num" style={{ width: 46 }} inputMode="decimal" aria-label={`run ${i + 1} picket feet`} value={x.picketFt ?? ""} onChange={(e) => setRun(i, { picketFt: e.target.value === "" ? null : (e.target.value as unknown as number) })} /></td>)}</tr>
                  </tbody>
                </table>
              </div>
              {row("F2", "Metal bar under the handrail", <>{tick("metalBar", "yes")} <span className="faint">brackets worked out: {d.brackets}</span></>)}
              {row("F2", "Spindles counted (optional): steps / flat top", <>{num("spindles.onSteps", "on steps")} {num("spindles.flatTop", "flat top")}</>)}
              {row("F3", "Picket heights (optional) 36 / 39 / 42", <>{num("heights.h36", "36")} {num("heights.h39", "39")} {num("heights.h42", "42")}</>)}
              {row("F4", "Posts there now / to add", <>{num("posts.now", "posts now")} {num("posts.add", "posts to add")}</>)}

              <h4>What the customer wants</h4>
              {row("G1", "Treads", <>{multi("want.treads", WANT_TREADS, WANT_LABEL)} {tick("want.squareBullnose", "square off bullnose")}</>)}
              {row("G2", "Riser colour", choice("want.riser", ["white", "stain", "unsure"]))}
              {row("G3", "Stringer colour", choice("want.stringer", ["white", "stain", "unsure"]))}
              {row("G4", "Stain colour", <><input className="in" style={{ width: 160 }} value={sheet.want.stain ?? ""} onChange={(e) => edit("want.stain", e.target.value || null)} /> {tick("want.matchFloors", "match floors")}</>)}
              {row("G5", "Handrail, add wall rail ft", <>{choice("want.handrail", ["refinish", "new"])} {num("want.wallRailFt", "wall rail ft")}</>)}
              {row("G6", "Spindles", choice("want.spindles", ["keep", "iron", "wood"]))}
              {row("G7", "Posts", choice("want.posts", ["keep", "refinish", "new"]))}
              {row("G8", "Covers", choice("want.covers", ["main", "both"]))}
              {row("N1", "Notes", <textarea className="in" rows={3} value={sheet.notes ?? ""} onChange={(e) => edit("notes", e.target.value || null)} />)}
            </div>
          </section>

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
              <p className="faint">Build adds these as new options to this quote in the editor, priced at Standard. Review them there and save as a new version.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
