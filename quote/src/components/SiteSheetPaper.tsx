"use client";

import { useEffect, useRef, useState } from "react";
import { sumParts, type NosingPiece, type RailRun, type SiteSheet } from "@/lib/sitesheet/sheet";

/**
 * What was read, drawn as the paper Stair Site Sheet (v5) itself, one box for one box (Albert, 2026-10-29:
 * "make the extraction of what was read look exactly like the sheet that was filled out"). The same sections,
 * grids, codes and shaded cells as the printed page; each bubble, tick, box and line on it is the control for
 * that field: a filled bubble or tick reads as filled in. A code Claude couldn't read with confidence washes
 * its box yellow. The page is drawn at Letter width and scaled to fit its column. State and saving stay in
 * SiteSheet.tsx; this only draws and calls `edit`.
 */

type Edit = (path: string, value: unknown) => void;

export type PaperProps = {
  page: 1 | 2;
  sheet: SiteSheet;
  get: (path: string) => unknown;
  edit: Edit;
  pieces: NosingPiece[];
  runs: RailRun[];
  setPiece: (i: number, patch: Partial<NosingPiece>) => void;
  setRun: (i: number, patch: Partial<RailRun>) => void;
  unclear: Set<string>;
  /** What the tread boxes add up to, shown beside B9. */
  treadsAddUp: number;
  /** Pizza sets that need a custom piece: every 2-piece set, and any 2 side open (derive.ts). */
  pizzaCustom: number;
};

const PAGE_PX = 816; // 8.5in

/** Scales the Letter-width page down to its column, never up, and never below a size a finger can tap: on a
 * phone the page scrolls sideways inside its own frame instead (pinch to zoom works too). */
const MIN_SCALE = 0.62;
function useFit() {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.max(MIN_SCALE, Math.min(1, el.clientWidth / PAGE_PX)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { box, scale };
}

export function SiteSheetPaper(p: PaperProps) {
  const { box, scale } = useFit();
  return (
    <div className="ssp-fit" ref={box}>
      <div className="ssp" style={{ zoom: scale }}>
        <section className="ssp-page" aria-label={`Sheet page ${p.page}, as read`}>
          <i className="reg tl" />
          <i className="reg tr" />
          <i className="reg bl" />
          <i className="reg br" />
          {p.page === 1 ? <PageOne {...p} /> : <PageTwo {...p} />}
        </section>
      </div>
    </div>
  );
}

/* ---------- the marks ---------- */

function useMarks({ get, edit, unclear }: Pick<PaperProps, "get" | "edit" | "unclear">) {
  const raw = (path: string) => {
    const v = get(path);
    return v === null || v === undefined ? "" : String(v);
  };
  /** A box or a line to write in. */
  const box = (path: string, label: string, w?: number) => (
    <input className="ssp-in" style={w ? { width: w } : undefined} inputMode="decimal" aria-label={label} value={raw(path)} onChange={(e) => edit(path, e.target.value.trim() === "" ? null : e.target.value)} />
  );
  /** A count box that adds up (2026-10-31): "4+3+2" is written as counted and the total shown beside it. */
  const sum = (path: string, label: string, w?: number) => {
    const s = sumParts(raw(path));
    return (
      <span className="ssp-sumbox">
        <input className="ssp-in" style={w ? { width: w } : undefined} inputMode="tel" aria-label={label} value={raw(path)} onChange={(e) => edit(path, e.target.value.trim() === "" ? null : e.target.value)} />
        {s.parts > 1 && s.total !== null && <span className="ssp-sum" aria-label={`${label} adds up to ${s.total}`}>= {s.total}</span>}
      </span>
    );
  };
  const line = (path: string, label: string, w: number) => (
    <input className="ssp-line" style={{ width: w }} aria-label={label} value={raw(path)} onChange={(e) => edit(path, e.target.value === "" ? null : e.target.value)} />
  );
  /** A round bubble: one of a set. Tapping the chosen one again clears it, like crossing it out. */
  const bubble = (path: string, value: unknown, label: React.ReactNode, name = String(value)) => {
    const on = get(path) === value;
    return (
      <button type="button" role="radio" aria-checked={on} aria-label={`${path} ${name}`} className={`o${on ? " on" : ""}`} onClick={() => edit(path, on ? null : value)}>
        {label}
      </button>
    );
  };
  /** A square tick on a yes/no field. */
  const tick = (path: string, label: React.ReactNode, name = path) => {
    const on = get(path) === true;
    return (
      <button type="button" role="checkbox" aria-checked={on} aria-label={name} className={`o sq${on ? " on" : ""}`} onClick={() => edit(path, !on)}>
        {label}
      </button>
    );
  };
  /** A square tick in a tick-all list. */
  const many = (path: string, value: string, label: React.ReactNode) => {
    const cur = (get(path) as string[] | undefined) ?? [];
    const on = cur.includes(value);
    return (
      <button type="button" role="checkbox" aria-checked={on} aria-label={`${path} ${value}`} className={`o sq${on ? " on" : ""}`} onClick={() => edit(path, on ? cur.filter((x) => x !== value) : [...cur, value])}>
        {label}
      </button>
    );
  };
  const code = (c: string) => <span className="code">{c}</span>;
  /** A wash on anything whose code Claude marked unclear. */
  const uc = (...codes: string[]) => (codes.some((c) => unclear.has(c)) ? " uc" : "");
  return { box, sum, line, bubble, tick, many, code, uc };
}

function Header({ page, ...p }: PaperProps) {
  const m = useMarks(p);
  return (
    <div className="ph">
      <div className="tt">
        TITAN FLOORING · Stair Site Sheet <small>v5 · page {page} of 2</small>
      </div>
      <div className="ids">
        <span className={`f${m.uc("Q")}`}>
          <span className="lbl">Quote</span>
          <span className="boxes">
            <span className="pre">Q-</span>
            <input className="ssp-in ssp-q" aria-label="Quote on the sheet" value={String(p.get("quoteNumber") ?? "").replace(/^Q-/i, "")} onChange={(e) => p.edit("quoteNumber", e.target.value.trim() ? `Q-${e.target.value.trim().replace(/^Q-/i, "")}` : null)} />
          </span>
        </span>
      </div>
      {page === 1 && (
        <div className="row" style={{ gap: "4pt 14pt" }}>
          <span>Customer {m.line("customer", "Customer", 160)}</span>
          <span>Date {m.line("date", "Date", 80)}</span>
          <span>PM {m.line("pm", "PM", 56)}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- page 1 ---------- */

const SHAPE_SVG: [string, string, React.ReactNode][] = [
  ["Straight", "Straight", <><rect x="17" y="2" width="14" height="44" /><path d="M17 8h14M17 14h14M17 20h14M17 26h14M17 32h14M17 38h14" /></>],
  ["Quarter turn", "Quarter turn", <><rect x="4" y="16" width="14" height="30" /><path d="M4 22h14M4 28h14M4 34h14M4 40h14" /><rect x="4" y="2" width="14" height="14" /><rect x="18" y="2" width="26" height="14" /><path d="M24 2v14M30 2v14M36 2v14" /></>],
  ["Quarter winder", "Quarter winder", <><rect x="4" y="16" width="14" height="30" /><path d="M4 22h14M4 28h14M4 34h14M4 40h14" /><rect x="4" y="2" width="14" height="14" /><path d="M18 16L4 2M18 16L11 2M18 16L4 9" /><rect x="18" y="2" width="26" height="14" /><path d="M26 2v14M34 2v14" /></>],
  ["U landing", "U, landing", <><rect x="4" y="14" width="14" height="32" /><path d="M4 20h14M4 26h14M4 32h14M4 38h14" /><rect x="4" y="2" width="40" height="12" /><rect x="30" y="14" width="14" height="32" /><path d="M30 20h14M30 26h14M30 32h14M30 38h14" /></>],
  ["Curved", "Curved", <><path d="M8 44A36 36 0 0 1 40 6M22 44A24 24 0 0 1 42 20" /><path d="M8 44h14M9 34l13 4M13 25l12 8M19 17l10 10M26 11l8 10M33 7l5 11" /></>],
  ["Spiral", "Spiral", <><circle cx="24" cy="24" r="21" /><circle cx="24" cy="24" r="3" /><path d="M24 3v18M45 24H27M24 45V27M3 24h18M9 9l13 13M39 9L26 22M39 39L26 26M9 39l13-13" /></>],
  ["Double winder", "Double winder", <><rect x="4" y="16" width="14" height="30" /><path d="M4 24h14M4 32h14M4 40h14" /><rect x="4" y="2" width="40" height="14" /><path d="M18 16L4 2M18 16L11 2M30 16l14-14M30 16l7-14M24 2v14" /><rect x="30" y="16" width="14" height="30" /><path d="M30 24h14M30 32h14M30 40h14" /></>],
  ["Half landing", "Half landing", <><rect x="17" y="2" width="14" height="44" /><path d="M17 6h14M17 10h14M17 14h14M17 32h14M17 36h14M17 40h14" /><rect x="17" y="18" width="14" height="10" fill="#ddd" /></>],
];

const TREAD_ROWS = [
  ["rso", "RSO", "right side open", "B1"],
  ["lso", "LSO", "left side open", "B2"],
  ["boxed", "Boxed", "walls both sides", "B3"],
  ["two", "2 side open", "riser to riser", "B4"],
] as const;

function PageOne(p: PaperProps) {
  const m = useMarks(p);
  const depth = p.get("treadDepth");
  const custom = depth !== null && depth !== undefined && depth !== "" && Number(depth) !== 0;
  const sideWidth = p.get("side.width");
  return (
    <>
      <Header {...p} />

      <div className="sec">
        <h3><span className="c">A</span> Staircases <span className="hint">Tick every one that applies</span></h3>
        <div className="sb">
          <div className={`row${m.uc("A1")}`}>
            <span className="k">Where {m.code("A1")}</span>
            {m.many("where", "Main", "Main")}
            {m.many("where", "Basement", "Basement")}
            {m.many("where", "Townhome", "Townhome")}
            {m.many("where", "Side", "Side / half staircase")}
          </div>
          <div className="row"><span className="k">Main shape {m.code("A2")}</span></div>
          <div className={`shapes${m.uc("A2")}`}>
            {SHAPE_SVG.map(([value, label, svg]) => (
              <div className="shape" key={value}>
                <svg viewBox="0 0 48 48" aria-hidden>{svg}</svg>
                {m.bubble("shape", value, label)}
              </div>
            ))}
          </div>
          <div className={`row${m.uc("A3")}`}>
            <span className="k">On the steps now {m.code("A3")}</span>
            {(["Carpet", "Wood caps", "Painted wood", "Vinyl", "Other"] as const).map((v) => <span key={v}>{m.bubble("onSteps", v, v)}</span>)}
          </div>
        </div>
      </div>

      <div className="sec">
        <h3><span className="c">B</span> Treads, main staircase <span className="hint">How many in each box · count in parts if easier: 4 + 3 · width = wall to wall</span></h3>
        <div className="sb">
          <table className="g">
            <thead>
              <tr><th style={{ width: "19%" }}>Tread</th><th style={{ width: "19%" }}>36&quot;</th><th style={{ width: "19%" }}>42&quot;</th><th style={{ width: "19%" }}>48&quot;</th><th>Other width (write it)</th></tr>
            </thead>
            <tbody>
              {TREAD_ROWS.map(([t, name, sub, c]) => (
                <tr key={t} className={m.uc(c)}>
                  <td className="k">{name} <small>{sub}</small>{m.code(c)}</td>
                  <td>{m.sum(`treads.${t}.w36`, `${name} 36`)}</td>
                  <td>{m.sum(`treads.${t}.w42`, `${name} 42`)}</td>
                  <td>{m.sum(`treads.${t}.w48`, `${name} 48`)}</td>
                  <td className="ow">{m.sum(`treads.${t}.other`, `${name} other count`, 40)} <span className="lbl">at</span> {m.box(`treads.${t}.otherWidth`, `${name} other width`, 30)}&quot;</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={`row${m.uc("B5")}`}>
            <span className="k">Tread depth {m.code("B5")}</span>
            {m.bubble("treadDepth", 0, 'Standard 10-5/8"', "standard")}
            <span className={`o${custom ? " on" : ""}`}>
              Custom{" "}
              {/* 0 means standard, so the custom box shows only a custom depth */}
              <input className="ssp-in" style={{ width: 48 }} inputMode="decimal" aria-label="custom tread depth" value={custom ? String(depth) : ""} onChange={(e) => p.edit("treadDepth", e.target.value.trim() === "" ? null : e.target.value)} />&quot;
            </span>
            <span className="lbl">for the grid above</span>
          </div>
          <table className="g">
            <thead>
              <tr><th style={{ width: "21%" }}>Special treads <small style={{ fontWeight: 500 }}>how many of each</small></th><th style={{ width: "7%" }}>Boxed</th><th style={{ width: "15%" }}>LSO</th><th style={{ width: "15%" }}>RSO</th><th style={{ width: "17%" }}>2 side open</th><th>Pizza only</th></tr>
            </thead>
            <tbody>
              <tr className={m.uc("B6")}>
                <td className="k">Pie shape <small>each winder tread</small>{m.code("B6")}</td>
                <td className="x" />
                <td>{m.sum("pie.lso", "pie LSO")}</td>
                <td>{m.sum("pie.rso", "pie RSO")}</td>
                <td>{m.sum("pie.two", "pie 2 side open")}</td>
                <td className="x" />
              </tr>
              <tr className={m.uc("B7")}>
                <td className="k">Pizza set <small>how many sets · one 90° turn each</small><small>custom: every 2-pc · any 2 side open</small>{m.code("B7")}</td>
                <td className="x" />
                <td className="x" />
                <td className="x" />
                {/* How many of the 2-pc / 3-pc sets written beside it are 2 side open: part of them, never extra. */}
                <td className="ow ssp-of">
                  {m.sum("pizza.two", "how many of the pizza sets are 2 side open", 40)}
                  <span className="ssp-of-l">of these sets <b aria-hidden>→</b></span>
                </td>
                <td className="ow" style={{ textAlign: "left" }}>
                  <span className="lbl">2-pc</span> {m.sum("pizza.pc2", "pizza 2-piece sets", 34)} <span className="lbl">3-pc</span> {m.sum("pizza.pc3", "pizza 3-piece sets", 34)}
                  {p.pizzaCustom > 0 && <span className="ssp-custom">{p.pizzaCustom} custom</span>}
                </td>
              </tr>
              <tr className={m.uc("B8")}>
                <td className="k">Bullnose <small>LSO / RSO std (extra large) · 2 side = custom</small>{m.code("B8")}</td>
                <td className="x" />
                <td>{m.sum("bullnose.lso", "bullnose LSO")}</td>
                <td>{m.sum("bullnose.rso", "bullnose RSO")}</td>
                <td>{m.sum("bullnose.two", "bullnose 2 side open")}</td>
                <td className="x" />
              </tr>
            </tbody>
          </table>
          <div className={`row${m.uc("B9")}`}>
            <span style={{ marginLeft: "auto" }}>
              Total treads {m.code("B9")} {m.box("totalTreads", "total treads", 40)} <span className="lbl">must match B1–B8 · boxes add up to {p.treadsAddUp}</span>
            </span>
          </div>
          <div className="sub-h">Side / half staircase {m.code("B10")} · only if ticked in A1</div>
          <div className={`row${m.uc("B10")}`}>
            <span>Steps {m.box("side.steps", "side steps", 40)}</span>
            {m.bubble("side.type", "rso", "RSO")}
            {m.bubble("side.type", "lso", "LSO")}
            {m.bubble("side.type", "boxed", "Boxed")}
            {m.bubble("side.type", "two", "2 side open")}
            <span>
              Width {m.bubble("side.width", 36, '36"')} {m.bubble("side.width", 42, '42"')} {m.bubble("side.width", 48, '48"')}{" "}
              <span className={`o${sideWidth !== null && sideWidth !== undefined && ![36, 42, 48].includes(Number(sideWidth)) && String(sideWidth) !== "" ? " on" : ""}`}>other {m.box("side.width", "side width", 40)}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="cols">
        <div className="sec">
          <h3><span className="c">C</span> Landings &amp; half moons</h3>
          <div className="sb">
            <table className="g">
              <thead><tr><th style={{ width: "28%" }} /><th>3 × 3</th><th>≈ 3 × 6</th><th>Other (write)</th></tr></thead>
              <tbody>
                <tr className={m.uc("C1")}>
                  <td className="k">Landings {m.code("C1")}<small>how many of each</small></td>
                  <td>{m.box("landings.s3x3", "landings 3x3")}</td>
                  <td>{m.box("landings.s3x6", "landings 3x6")}</td>
                  <td>{m.box("landings.other", "landings other")}</td>
                </tr>
              </tbody>
            </table>
            <p className="lbl plain">Oak for landings: about 20 sq ft a box.</p>
            <div className={`row${m.uc("C2")}`}>
              <span className="k">Half moons {m.code("C2")}</span>
              <span>How many {m.box("halfMoons.count", "half moons", 30)}</span>
              <span>Nosing {m.box("halfMoons.nosingFt", "half moon nosing ft", 40)} ft</span>
            </div>
            <div className={`row${m.uc("C2")}`} style={{ paddingLeft: "6pt" }}>
              <button type="button" role="checkbox" aria-checked={!p.sheet.halfMoons.solid} className={`o sq${!p.sheet.halfMoons.solid && (p.sheet.halfMoons.count ?? 0) > 0 ? " on" : ""}`} onClick={() => p.edit("halfMoons.solid", false)}>Nosing method (default)</button>
              {m.tick("halfMoons.solid", "Solid one-piece", "half moon solid one-piece")}
            </div>
          </div>
        </div>
        <div className="sec">
          <h3><span className="c">D</span> Stringers</h3>
          <div className="sb">
            <div className={`row${m.uc("D1")}`}><span className="k">Now {m.code("D1")}</span>{m.bubble("stringers.now", "White", "White")}{m.bubble("stringers.now", "Stained", "Stained")}{m.bubble("stringers.now", "Other", "Other")}</div>
            <div className={`row${m.uc("D2")}`}><span className="k">Made of {m.code("D2")}</span>{m.bubble("stringers.made", "Veneer", "Veneer")}{m.bubble("stringers.made", "Solid", "Solid")}{m.bubble("stringers.made", "Don't know", "Don't know")}</div>
            <p className="lbl plain">Blank reads as veneer.</p>
          </div>
        </div>
      </div>

      <div className="foot"><span><b>Photos to take:</b> bottom step · top · each open side · one tread close-up · each post</span><span><b>P1</b> · keep both pages together</span></div>
    </>
  );
}

/* ---------- page 2 ---------- */

function PageTwo(p: PaperProps) {
  const m = useMarks(p);
  const cols10 = Array.from({ length: 10 }, (_, i) => i);
  const cols8 = Array.from({ length: 8 }, (_, i) => i);
  const wall = Number(p.get("want.wallRailFt") ?? 0) > 0;
  return (
    <>
      <Header {...p} />

      <div className="sec">
        <h3><span className="c">E</span> Nosings <span className="hint">Write a length per piece · everything else follows the default</span></h3>
        <div className="sb">
          <div className={`row${m.uc("E1")}`}>
            <span className="k">Default {m.code("E1")}</span>
            {m.tick("nosingDefault.carpet", "Carpet on the nosings now")}
            <span style={{ marginLeft: "6pt" }}>thickness</span>
            {m.bubble("nosingDefault.thickness", "1/2", '½"')}
            {m.bubble("nosingDefault.thickness", "3/4", '¾"')}
            {m.bubble("nosingDefault.thickness", "unsure", "Not sure")}
            <span style={{ marginLeft: "6pt" }}>depth {m.box("nosingDefault.depth", "nosing depth", 40)}&quot; <span className="lbl plain">(blank = 4.5&quot; with overlap)</span></span>
          </div>
          <table className={`g${m.uc("E2")}`}>
            <thead><tr><th style={{ width: "20%" }}>Piece {m.code("E2")}</th>{cols10.map((i) => <th key={i}>{i + 1}</th>)}</tr></thead>
            <tbody>
              <tr><td className="k">Length <small>feet</small></td>{cols10.map((i) => <td key={i}><input className="ssp-in" inputMode="decimal" aria-label={`nosing ${i + 1} length`} value={p.pieces[i].ft ?? ""} onChange={(e) => p.setPiece(i, { ft: e.target.value === "" ? null : (e.target.value as unknown as number) })} /></td>)}</tr>
              <tr><td className="k">Depth if different <small>inches, else blank</small></td>{cols10.map((i) => <td key={i}><input className="ssp-in" inputMode="decimal" aria-label={`nosing ${i + 1} depth`} value={p.pieces[i].depth ?? ""} onChange={(e) => p.setPiece(i, { depth: e.target.value === "" ? null : (e.target.value as unknown as number) })} /></td>)}</tr>
              <tr>
                <td className="k">Thickness if different <small>circle ½ or ¾, else blank</small></td>
                {cols10.map((i) => (
                  <td key={i} className="wh">
                    {(["1/2", "3/4"] as const).map((t, k) => (
                      <span key={t}>
                        {k > 0 && " · "}
                        <button type="button" className={`mark${p.pieces[i].thickness === t ? " on" : ""}`} aria-pressed={p.pieces[i].thickness === t} aria-label={`nosing ${i + 1} thickness ${t}`} onClick={() => p.setPiece(i, { thickness: p.pieces[i].thickness === t ? null : t })}>
                          {t === "1/2" ? "½" : "¾"}
                        </button>
                      </span>
                    ))}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="k">Sand instead of new <small>tick only if kept</small></td>
                {cols10.map((i) => (
                  <td key={i}>
                    <button type="button" role="checkbox" aria-checked={p.pieces[i].sand} aria-label={`nosing ${i + 1} sand`} className={`o sq${p.pieces[i].sand ? " on" : ""}`} onClick={() => p.setPiece(i, { sand: !p.pieces[i].sand })} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="sec">
        <h3><span className="c">F</span> Railing, as it is now <span className="hint">One column per run of handrail</span></h3>
        <div className="sb">
          <table className={`g${m.uc("F1")}`}>
            <thead><tr><th style={{ width: "20%" }}>Run {m.code("F1")}</th>{cols8.map((i) => <th key={i}>{i + 1}</th>)}</tr></thead>
            <tbody>
              <tr><td className="k">Length <small>feet</small></td>{cols8.map((i) => <td key={i}><input className="ssp-in" inputMode="decimal" aria-label={`run ${i + 1} length`} value={p.runs[i].ft ?? ""} onChange={(e) => p.setRun(i, { ft: e.target.value === "" ? null : (e.target.value as unknown as number) })} /></td>)}</tr>
              <tr>
                <td className="k">Where <small>S steps · F flat · W wall</small></td>
                {cols8.map((i) => (
                  <td key={i} className="wh">
                    {(["S", "F", "W"] as const).map((w, k) => (
                      <span key={w}>
                        {k > 0 && " · "}
                        <button type="button" className={`mark${p.runs[i].where === w ? " on" : ""}`} aria-pressed={p.runs[i].where === w} aria-label={`run ${i + 1} ${w}`} onClick={() => p.setRun(i, { where: p.runs[i].where === w ? null : w })}>
                          {w}
                        </button>
                      </span>
                    ))}
                  </td>
                ))}
              </tr>
              <tr><td className="k">Curved</td>{cols8.map((i) => <td key={i}><button type="button" role="checkbox" aria-checked={p.runs[i].curved} aria-label={`run ${i + 1} curved`} className={`o sq${p.runs[i].curved ? " on" : ""}`} onClick={() => p.setRun(i, { curved: !p.runs[i].curved })} /></td>)}</tr>
              <tr>
                <td className="k">Pickets <small>tick, or feet if part</small></td>
                {cols8.map((i) => (
                  <td key={i} className="pk">
                    <button type="button" role="checkbox" aria-checked={p.runs[i].pickets} aria-label={`run ${i + 1} pickets`} className={`o sq${p.runs[i].pickets ? " on" : ""}`} onClick={() => p.setRun(i, { pickets: !p.runs[i].pickets })} />
                    <input className="ssp-in" inputMode="decimal" placeholder="ft" aria-label={`run ${i + 1} picket feet`} value={p.runs[i].picketFt ?? ""} onChange={(e) => p.setRun(i, { picketFt: e.target.value === "" ? null : (e.target.value as unknown as number) })} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <div className="cols">
            <div style={{ display: "grid", gap: "4pt" }}>
              <div className={`row${m.uc("F2")}`}><span className="k">Metal bar {m.code("F2")}</span>{m.tick("metalBar", "Metal bar under the handrail")}</div>
              <div className={`row${m.uc("F2")}`}><span className="k">Spindles {m.code("F2")} <span className="lbl plain">optional</span></span><span>steps {m.box("spindles.onSteps", "spindles on steps", 40)}</span><span>flat {m.box("spindles.flatTop", "spindles flat top", 40)}</span></div>
              <div className={`row${m.uc("F3")}`}><span className="k">Picket heights {m.code("F3")} <span className="lbl plain">optional</span></span><span>36&quot; {m.box("heights.h36", "36 inch pickets", 32)}</span><span>39&quot; {m.box("heights.h39", "39 inch pickets", 32)}</span><span>42&quot; {m.box("heights.h42", "42 inch pickets", 28)}</span></div>
            </div>
            <div style={{ display: "grid", gap: "4pt" }}>
              <div className={`row${m.uc("F4")}`}><span className="k">Posts {m.code("F4")}</span><span>There now {m.box("posts.now", "posts there now", 32)}</span><span>To add {m.box("posts.add", "posts to add", 32)}</span></div>
              <p className="lbl plain">Spindles and heights are optional: blank, the app counts them from the runs. Wall brackets are worked out (1 ft in, then every 2 ft). Full, half or under post is decided when finalising.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="sec want">
        <h3><span className="c">G</span> What the customer wants <span className="hint">Tick everything they&apos;d consider · the app builds the options</span></h3>
        <div className="sb">
          <div className={`row${m.uc("G1")}`}>
            <span className="k">Treads {m.code("G1")}</span>
            {m.many("want.treads", "sand", "Sand & refinish existing caps")}
            {m.many("want.treads", "caps", "New wood caps")}
            {m.many("want.treads", "vinylTreads", "Vinyl treads")}
            {m.many("want.treads", "vinylSteps", "Vinyl steps")}
            {m.many("want.treads", "unsure", "Not sure")}
          </div>
          <div className={`row${m.uc("G1")}`}><span className="k">Bullnose {m.code("G1")}</span>{m.tick("want.squareBullnose", "Square off bullnose")}</div>
          <div className={`row${m.uc("G2")}`}><span className="k">Riser colour {m.code("G2")}</span>{m.bubble("want.riser", "white", "White")}{m.bubble("want.riser", "stain", "Stain")}{m.bubble("want.riser", "unsure", "Not sure")}</div>
          <div className={`row${m.uc("G3")}`}><span className="k">Stringer colour {m.code("G3")}</span>{m.bubble("want.stringer", "white", "White")}{m.bubble("want.stringer", "stain", "Stain")}{m.bubble("want.stringer", "unsure", "Not sure")}</div>
          <div className={`row${m.uc("G4")}`}><span className="k">Stain colour {m.code("G4")}</span>{m.line("want.stain", "stain colour", 200)}{m.tick("want.matchFloors", "Match floors")}</div>
          <div className={`row${m.uc("G5")}`}>
            <span className="k">Handrail {m.code("G5")}</span>
            {m.bubble("want.handrail", "refinish", "Keep & refinish")}
            {m.bubble("want.handrail", "new", "New")}
            <span className={`o sq${wall ? " on" : ""}`}>Add wall rail {m.box("want.wallRailFt", "wall rail feet", 36)} ft</span>
          </div>
          <div className={`row${m.uc("G6")}`}><span className="k">Spindles {m.code("G6")}</span>{m.bubble("want.spindles", "keep", "Keep")}{m.bubble("want.spindles", "iron", "New iron")}{m.bubble("want.spindles", "wood", "New wood")}</div>
          <div className={`row${m.uc("G7")}`}><span className="k">Posts {m.code("G7")}</span>{m.bubble("want.posts", "keep", "Keep")}{m.bubble("want.posts", "refinish", "Refinish")}{m.bubble("want.posts", "new", "New")}</div>
          <div className={`row${m.uc("G8")}`}><span className="k">Covers {m.code("G8")}</span>{m.bubble("want.covers", "main", "Main only")}{m.bubble("want.covers", "both", "Main + side / half")}</div>
        </div>
      </div>

      <div className={`notes${m.uc("N1")}`}>
        <span className="lbl">Notes {m.code("N1")} · conditions, anything to refinish instead of replace, what the customer said</span>
        <textarea aria-label="Notes" value={p.sheet.notes ?? ""} onChange={(e) => p.edit("notes", e.target.value || null)} />
      </div>
      <div className="foot"><span>Upload: open the quote → <b>Site sheet</b> → a photo of each page</span><span><b>P2</b> · keep both pages together</span></div>
    </>
  );
}
