"use client";

import { useState } from "react";
import { optionTotals } from "@/lib/calc";
import { bestContractor, entryLabel, lineFromEntry, manualLine, rateSnap, searchCatalogue, SECTION_LABOUR, type CardEntry, type EditorLine } from "@/lib/editor/model";
import { defaultInput, expandProfile, type BuilderInput } from "@/lib/editor/stairBuilder";
import { money } from "@/lib/format";
import { levelPrice, type ServiceLevel } from "@/lib/pricing/service";
import { STAIR_METHODS, STAIR_TYPES, profileName, stairProfileLine } from "@/lib/quick/stairs";
import type { StairProfileRow } from "@/lib/quotes/types";

/** The fallback when Airtable has no Stair Profiles: type × method, at a price staff type on the line. */
const CODE_PROFILES = STAIR_TYPES.flatMap((type) => STAIR_METHODS.map((method) => ({ type, method })));

const COUNTS: [keyof BuilderInput, string][] = [
  ["steps", "Steps"],
  ["openSideSteps", "Open-side steps"],
  ["handrailFt", "Handrail (ft)"],
  ["spindles", "Spindles"],
  ["posts", "Posts"],
];

/**
 * Add a line: search the rate card and stair items, or type the line in by hand. In the Stairs
 * section, pick a Stair Profile and the builder (2026-10-20) turns it into Stair Item lines from
 * a few counts, replacing the preliminary's preset line if there is one. Customer view shows the
 * charge rate only. Each section lists only its own work (2026-10-27); "Search the whole rate card"
 * widens it.
 */
export function Picker({
  section,
  catalogue,
  onPick,
  onClose,
  customer,
  level,
  crew,
  profiles,
  profileLines,
  onPickMany,
}: {
  section: string;
  catalogue: CardEntry[];
  onPick: (l: EditorLine) => void;
  onClose: () => void;
  customer: boolean;
  /** The option's service level: Premium shows, and adds, labour at its Premium price. */
  level: ServiceLevel;
  /** The option's crew: new lines go to it when it has a rate for the work, else to the cheapest. */
  crew: string | null;
  /** Stair Profiles rows, for the Stairs section's builder. */
  profiles?: StairProfileRow[];
  /** The option's preset staircase lines (sourceKind "profile"), so the builder can offer to replace one. */
  profileLines?: { id: string; sourceId: string | null }[];
  /** Several lines at once, in place of the given line ids (the builder). */
  onPickMany?: (lines: EditorLine[], replacing: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [building, setBuilding] = useState<StairProfileRow | null>(null);
  const [input, setInput] = useState<BuilderInput>({ steps: 0, openSideSteps: 0, handrailFt: 0, spindles: 0, posts: 0 });
  const [replace, setReplace] = useState(true);
  const [all, setAll] = useState(false);
  const results = searchCatalogue(catalogue, q, section, 40, all);
  // Only a section with work of its own is filtered, so only there is widening offered.
  const filterable = SECTION_LABOUR[section] !== undefined;
  const elsewhere = filterable && !all ? searchCatalogue(catalogue, q, section, Infinity, true).length - searchCatalogue(catalogue, q, section, Infinity).length : 0;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = section === "Stairs" ? (profiles ?? []).filter((p) => words.every((w) => p.name.toLowerCase().includes(w))) : [];
  const codeProfiles = section === "Stairs" && (profiles ?? []).length === 0 ? CODE_PROFILES.filter((p) => words.every((w) => profileName(p).toLowerCase().includes(w))) : [];
  const built = building ? expandProfile(building, input, catalogue, level) : null;
  const replacing = building ? (profileLines ?? []).filter((l) => l.sourceId === building.id).map((l) => l.id) : [];

  function startBuilding(p: StairProfileRow) {
    setBuilding(p);
    setInput(defaultInput(p));
    setReplace(true);
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`Add to ${section}`} onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-h">
          Add to {section}
          <button className="linkbtn right" onClick={onClose}>Close</button>
        </div>
        <div className="card-b">
          <input
            className="in"
            autoFocus
            placeholder={section === "Stairs" ? "Search stair items…" : "Search the rate card, e.g. click, baseboard, bin"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search the rate card"
          />
          {filterable && (
            <label className="check-in pick-all">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
              Search the whole rate card{!all && elsewhere > 0 ? ` · ${elsewhere} more in other sections` : ""}
            </label>
          )}
        </div>
        {building && built && (
          <div className="sb" role="group" aria-label={`Build ${building.name}`}>
            <div className="sb-h">
              <b>{building.name}</b>
              <button className="linkbtn" onClick={() => setBuilding(null)}>Back</button>
            </div>
            <div className="sb-grid">
              {COUNTS.map(([k, label]) => (
                <label key={k}>
                  {label}
                  <input className="in" inputMode="numeric" value={input[k] || ""} placeholder="0" onChange={(e) => setInput({ ...input, [k]: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
                </label>
              ))}
            </div>
            {built.untemplated ? (
              <p className="sb-msg warn">This profile has no Stair Items linked yet. Set its Per step, Per staircase and other links in Airtable (Stair Profiles), then come back.</p>
            ) : (
              <>
                <ul className="sb-lines">
                  {built.lines.map((l) => (
                    <li key={l.id}>
                      <span>{l.description}</span>
                      <span className="faint">{l.qty} × {money(l.unitPriceSnap ?? 0)}</span>
                    </li>
                  ))}
                </ul>
                {built.missing.length > 0 && <p className="sb-msg warn">{built.missing.length} linked Stair Item{built.missing.length === 1 ? " is" : "s are"} inactive or gone and left out.</p>}
                {replacing.length > 0 && (
                  <label className="check-in">
                    <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                    Replace the preliminary&apos;s preset line for this staircase
                  </label>
                )}
                <div className="sb-sum">
                  <span>{built.lines.length} line{built.lines.length === 1 ? "" : "s"} · {money(optionTotals(built.lines, 0, false).preDiscount)}</span>
                  <button className="btn small primary" disabled={built.lines.length === 0} onClick={() => (onPickMany ?? ((ls) => ls.forEach(onPick)))(built.lines, replace ? replacing : [])}>
                    Add staircase
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <ul className="pick-list">
          {!building &&
            rows.map((p) => (
              <li key={p.id}>
                <button className="pick" onClick={() => startBuilding(p)}>
                  <span className="nm">{p.name}</span>
                  <span className="mt">
                    Preset {money(p.price)}{p.steps ? ` for ${p.steps} steps` : ""} · build it into Stair Item lines
                  </span>
                </button>
              </li>
            ))}
          {!building &&
            codeProfiles.map((p) => (
              <li key={profileName(p)}>
                <button className="pick" onClick={() => onPick(stairProfileLine(p.type, p.method, null))}>
                  <span className="nm">{profileName(p)}</span>
                  <span className="mt">Whole staircase at a price you type · its description goes on the option</span>
                </button>
              </li>
            ))}
          {results.map((e) => {
            const from = e.kind === "rate" ? (e.contractors.find((c) => c.name === crew) ?? bestContractor(e)) : null;
            return (
              <li key={e.key}>
                <button className="pick" onClick={() => onPick(lineFromEntry(e, section, crew ?? undefined, level))}>
                  <span className="nm">{entryLabel(e)}</span>
                  <span className="mt">
                    {e.kind === "rate"
                      ? `${money(rateSnap(e, from!, null, level).price)} / ${e.uom ?? "unit"}${customer ? "" : ` · ${e.contractors.length} contractor${e.contractors.length === 1 ? "" : "s"}, ${from!.name === crew ? "crew" : "cheapest"} ${from!.name}`}${from!.material && from!.material.choices.length > 1 ? ` · ${from!.material.choices.length} materials` : ""}`
                      : `${money(levelPrice(e.rate, level, true))} / piece${!customer && e.cost === null ? " · no cost on file" : ""}`}
                  </span>
                </button>
              </li>
            );
          })}
          {results.length === 0 && rows.length === 0 && codeProfiles.length === 0 && <li className="empty">{filterable && !all ? `Nothing in ${section} matches “${q}”.` : `Nothing on the rate card matches “${q}”.`}</li>}
          <li>
            <button className="pick manual" onClick={() => onPick(manualLine(section, q.trim()))}>
              <span className="nm">Type it in yourself{q.trim() ? `: “${q.trim()}”` : ""}</span>
              <span className="mt">{customer ? "A line with your own price" : "A line with your own price and cost, flagged NOSRC"}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
