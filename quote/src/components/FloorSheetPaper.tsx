"use client";

import type { ReactNode } from "react";
import { DISPOSALS, FLOOR_NAME, FLOORS, MAX_ROOMS, MEASURED_WITH, NOW, SUBFLOOR_SHEETS } from "@/lib/floorsheet/sheet";
import { useFit } from "./SiteSheetPaper";

/**
 * What was read, drawn as the paper Flooring Site Sheet (v1, quote/sheets/flooring-site-sheet-v1.pdf) itself, one
 * box for one box (Albert, 2026-11-03: "the sheet should look 1:1 to the copy online. Easier to compare", the same
 * call as the stair sheet's 2026-10-29). The same sections, rows, codes and wording as the printed page; each bubble,
 * tick and box on it is the control for that field. A code Claude couldn't read with confidence washes yellow.
 * Styles are the stair copy's (`.ssp`) plus `.fsp`. Change the printed sheet and this copy together. State and
 * saving stay in FloorSheetPanel.tsx; this only draws and calls `edit`.
 */

type Edit = (path: string, value: unknown) => void;
export type FloorPaperProps = { get: (path: string) => unknown; edit: Edit; unclear: Set<string> };

const NOW_LABEL: Record<(typeof NOW)[number], string> = { carpet: "Carpet", lamvin: "Lam/Vin", wood: "Wood", tilePly: "Tile/ply", tileConc: "Tile/conc" };
const SUB_LABEL: Record<(typeof SUBFLOOR_SHEETS)[number], string> = { ply34: '¾" ply', osb34: '¾" OSB', ply12: '½" ply', osb12: '½" OSB' };
const DISPOSAL_LABEL: Record<(typeof DISPOSALS)[number], string> = { general: "General (bin / takeaway)", condo: "Condo / apartment", large: "Large (2 bins)" };

export function FloorSheetPaper(p: FloorPaperProps) {
  const { box, scale } = useFit();
  const { get, edit, unclear } = p;
  const raw = (path: string) => {
    const v = get(path);
    return v === null || v === undefined ? "" : String(v);
  };
  const uc = (...codes: string[]) => (codes.some((c) => unclear.has(c)) ? " uc" : "");
  const code = (c: string) => <span className="code">{c}</span>;
  /** A box or line to write in; what is typed is kept as typed and cleaned when the sheet is used. */
  const write = (path: string, label: string, cls: "ssp-in" | "ssp-line", w?: number, numeric = false) => (
    <input className={cls} style={w ? { width: w } : undefined} inputMode={numeric ? "decimal" : undefined} aria-label={label} value={raw(path)} onChange={(e) => edit(path, e.target.value === "" ? null : e.target.value)} />
  );
  /** A round bubble, one of a set. Tapping the chosen one again clears it, like crossing it out. */
  const bubble = (path: string, value: unknown, label: ReactNode, name = String(value)) => {
    const on = get(path) === value;
    return (
      <button type="button" role="radio" aria-checked={on} aria-label={`${path} ${name}`} className={`o${on ? " on" : ""}`} onClick={() => edit(path, on ? null : value)}>
        {label}
      </button>
    );
  };
  const tick = (path: string, label: ReactNode, name = path) => {
    const on = get(path) === true;
    return (
      <button type="button" role="checkbox" aria-checked={on} aria-label={name} className={`o sq${on ? " on" : ""}`} onClick={() => edit(path, !on)}>
        {label}
      </button>
    );
  };
  /** The New floor column: 1 and 2 may both be filled (both = compare). */
  const floorTick = (i: number, f: 1 | 2) => {
    const cur = ((get(`rooms.${i}.floors`) as number[] | undefined) ?? []).filter((x) => x === 1 || x === 2);
    const on = cur.includes(f);
    return (
      <button type="button" role="checkbox" aria-checked={on} aria-label={`R${i + 1} new floor ${f}`} className={`o${on ? " on" : ""}`} onClick={() => edit(`rooms.${i}.floors`, on ? cur.filter((x) => x !== f) : [...cur, f].sort())}>
        {f}
      </button>
    );
  };

  const option = (n: 1 | 2) => {
    const at = `want.${n - 1}`;
    return (
      <div className="fsp-opt">
        <div className="fsp-oh">
          Floor {n} {n === 2 && <small>only if needed</small>}
        </div>
        <div className={`fsp-k2${uc("W1")}`}>
          {code("W1")} New floor <span className="tip">tick one</span>
        </div>
        <div className={`fsp-choices${uc("W1")}`}>{FLOORS.map((f) => <span key={f}>{bubble(`${at}.floor`, f, FLOOR_NAME[f])}</span>)}</div>
        <div className="row">
          <span className="tip">Nailed wood:</span>
          {bubble(`${at}.nail`, "nail", "Nail down")}
          {bubble(`${at}.nail`, "nailGlue", "Nail + glue")}
        </div>
        <div className={`fsp-k2${uc("W2")}`}>
          {code("W2")} Material <span className="tip">blank = standard</span>
        </div>
        <div className={`row${uc("W2")}`}>
          {bubble(`${at}.material`, "standard", "Standard")}
          {bubble(`${at}.material`, "customer", "Customer supplies")}
        </div>
        <div className={`row${uc("W2")}`}>
          <span className="tip">or SKU</span>
          {write(`${at}.sku`, `Floor ${n} SKU`, "ssp-line", 210)}
        </div>
      </div>
    );
  };

  return (
    <div className="ssp-fit" ref={box}>
      <div className="ssp" style={{ zoom: scale }}>
        <section className="ssp-page fsp" aria-label="Flooring sheet, as read">
          <i className="reg tl" />
          <i className="reg tr" />
          <i className="reg bl" />
          <i className="reg br" />

          <div className="ph">
            <div className="tt">
              FLOORING SITE SHEET <small>v1 · goes on top of the Stair Site Sheet</small>
            </div>
            <div className="ids">
              <span className={`f${uc("Q")}`}>
                <span className="lbl">Quote</span>
                <span className="boxes">
                  <span className="pre">Q-</span>
                  <input className="ssp-in ssp-q" aria-label="Quote on the sheet" value={raw("quoteNumber").replace(/^Q-/i, "")} onChange={(e) => edit("quoteNumber", e.target.value.trim() ? `Q-${e.target.value.trim().replace(/^Q-/i, "")}` : null)} />
                </span>
              </span>
            </div>
            <div className="row fsp-who">
              <span className="f"><span className="lbl">Customer</span>{write("customer", "Customer", "ssp-line", 260)}</span>
              <span className="f"><span className="lbl">Date</span>{write("date", "Date", "ssp-line", 106)}</span>
              <span className="f"><span className="lbl">PM</span>{write("pm", "PM", "ssp-line", 120)}</span>
            </div>
          </div>

          <div className="sec">
            <h3>
              <span className="c">R</span> ROOMS <span className="hint">one row a room · never add up, the app does</span>
            </h3>
            <div className="sb">
              <div className={`row${uc("R0")}`}>
                <span className="k">{code("R0")} Measured with</span>
                {MEASURED_WITH.map((m) => <span key={m}>{bubble("measuredWith", m, m)}</span>)}
                <span className="tip">Moasure: the number in brackets (ft²) is Sq ft, the other is Linear ft.</span>
              </div>
              <table className="g fsp-rooms">
                <thead>
                  <tr>
                    <th />
                    <th>Room</th>
                    <th>Level</th>
                    <th>Sq ft</th>
                    <th>Linear ft<small>baseboard run</small></th>
                    <th>Floor there now</th>
                    <th>Remove<small>blank = customer</small></th>
                    <th className="nf">New floor<small>blank = all floors</small></th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: MAX_ROOMS }, (_, i) => (
                    <tr key={i} className={uc(`R${i + 1}`).trim()}>
                      <td className="cd">{code(`R${i + 1}`)}</td>
                      <td className="room">{write(`rooms.${i}.name`, `R${i + 1} room`, "ssp-in")}</td>
                      <td className="lv">{(["B", "M", "U"] as const).map((l) => <span key={l}>{bubble(`rooms.${i}.level`, l, l)}</span>)}</td>
                      <td className="num">{write(`rooms.${i}.sqft`, `R${i + 1} sq ft`, "ssp-in", undefined, true)}</td>
                      <td className="num">{write(`rooms.${i}.linearFt`, `R${i + 1} linear ft`, "ssp-in", undefined, true)}</td>
                      <td className="fn">{NOW.map((n) => <span key={n}>{bubble(`rooms.${i}.now`, n, NOW_LABEL[n])}</span>)}</td>
                      <td className="fsp-rm">{tick(`rooms.${i}.remove`, null, `R${i + 1} remove`)}</td>
                      <td className="nf">
                        {floorTick(i, 1)}
                        {floorTick(i, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="sec want">
            <h3>
              <span className="c">W</span> WHAT THE CUSTOMER WANTS <span className="hint">tick each room&apos;s New floor above · floor 2 only if needed</span>
            </h3>
            <div className="fsp-opts">
              {option(1)}
              {option(2)}
            </div>
            <div className="sb fsp-shared">
              <div className={`row${uc("W3")}`}>
                <span className="k">{code("W3")} Baseboards</span>
                {bubble("baseboards.how", "none", "None")}
                {bubble("baseboards.how", "reinstall", "Reinstall existing")}
                {bubble("baseboards.how", "new", "New")}
                <span className="tip">→</span>
                {bubble("baseboards.piece", "baseboard", "Baseboard")}
                {bubble("baseboards.piece", "shoe", "Shoe")}
                {bubble("baseboards.piece", "both", "Both")}
              </div>
              <div className={`row${uc("W4")}`}>
                <span className="k">{code("W4")} Subfloor</span>
                {tick("subfloor.screw", "Screw-down")}
                <span className="tip">New:</span>
                {SUBFLOOR_SHEETS.map((x) => <span key={x}>{bubble("subfloor.sheet", x, SUB_LABEL[x])}</span>)}
                <span>sq ft {write("subfloor.sqft", "Subfloor sq ft", "ssp-line", 60, true)}</span>
                <span className="tip">blank = all rooms</span>
              </div>
              <div className={`row${uc("W5")}`}>
                <span className="k">{code("W5")} Disposal</span>
                {DISPOSALS.map((d) => <span key={d}>{bubble("disposal", d, DISPOSAL_LABEL[d])}</span>)}
                <span className="tip">blank = customer disposes</span>
              </div>
            </div>
          </div>

          <div className={`notes${uc("N2")}`}>
            <span className="lbl">{code("N2")} Notes</span>
            <textarea aria-label="Notes" value={raw("notes")} onChange={(e) => edit("notes", e.target.value === "" ? null : e.target.value)} />
          </div>

          <div className="foot">
            <span>
              Photograph this page and the stair pages in <b>CompanyCam</b>, tag <b>Site Sheet</b>.
            </span>
            <span>Titan Flooring · Flooring Site Sheet v1</span>
          </div>
        </section>
      </div>
    </div>
  );
}
