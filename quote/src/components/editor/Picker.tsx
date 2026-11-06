"use client";

import { useState } from "react";
import { optionTotals } from "@/lib/calc";
import { bestContractor, entryLabel, lineFromEntry, manualLine, rateSnap, searchCatalogue, SECTION_LABOUR, type CardEntry, type EditorLine } from "@/lib/editor/model";
import { defaultInput, expandProfile, stepSplit, type BuilderInput } from "@/lib/editor/stairBuilder";
import { stairGroupLabel, stairGroupOf } from "@/lib/editor/stairGroups";
import { money } from "@/lib/format";
import { levelPrice, type ServiceLevel } from "@/lib/pricing/service";
import { STAIR_METHODS, STAIR_TYPES, profileName, stairProfileLine } from "@/lib/quick/stairs";
import type { StairProfileRow } from "@/lib/quotes/types";
import { SAND_DISCLAIMER, sandBlocks, sandFlag, sandRole } from "@/lib/editor/sandRule";
import { familiesFor, familyGlue, familyLines, familyMethods, familyRows, type Family } from "@/lib/editor/waterfall";
import { materialDeltas, type QuickChoice } from "@/lib/quick/plan";

/** The fallback when Airtable has no Stair Profiles: type × method, at a price staff type on the line. */
const CODE_PROFILES = STAIR_TYPES.flatMap((type) => STAIR_METHODS.map((method) => ({ type, method })));

const COUNTS: [keyof BuilderInput, string][] = [
  ["steps", "Steps"],
  ["boxedSteps", "Boxed steps"],
  ["openSideSteps", "Open-side steps"],
  ["curvedSteps", "Curved steps"],
  ["handrailFt", "Handrail (ft)"],
  ["nosingFt", "Nosing (ft)"],
  ["landings", "Landings"],
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
  category = null,
  stairsOnly = false,
  catalogue,
  families: families0,
  onPick,
  onClose,
  customer,
  level,
  crew,
  profiles,
  profileLines,
  onPickMany,
  optionLines = [],
}: {
  section: string;
  /** A stairs option's category button (2026-10-30): only Stair Items of that category, no builder. */
  category?: string | null;
  /** A stairs option's Private section (2026-10-30): Stair Items and typed lines only, never the rate card. */
  stairsOnly?: boolean;
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
  /** The option's lines (2026-11-06), so an item that clashes with sanded steps is greyed out. */
  optionLines?: EditorLine[];
  /** Quick Quote Choices (2026-11-06): their waterfall families (Solid Hardwood T&G…) lead the search. */
  families?: QuickChoice[];
}) {
  const [q, setQ] = useState("");
  const [building, setBuilding] = useState<StairProfileRow | null>(null);
  const [input, setInput] = useState<BuilderInput>({ steps: 0, boxedSteps: null, openSideSteps: 0, curvedSteps: 0, handrailFt: 0, nosingFt: 0, landings: 0, spindles: 0, posts: 0 });
  const [replace, setReplace] = useState(true);
  const [all, setAll] = useState(false);
  // The waterfall (2026-11-06): a family, then how it's installed, then the glue. Nothing is picked for you.
  const [fam, setFam] = useState<Family | null>(null);
  const [famPick, setFamPick] = useState<string | null>(null);
  const [famGlue, setFamGlue] = useState<string | null>(null);
  const narrowed = category !== null || stairsOnly;
  const families = narrowed ? [] : familiesFor(families0 ?? [], section, q);
  // A family's own Rate Card rows are left off the plain search; the whole rate card still lists them.
  const hidden = narrowed || all ? new Set<string>() : familyRows(families0 ?? [], section);
  const results = narrowed
    ? searchCatalogue(catalogue, q, "Stairs", Infinity).filter((e) => category === null || (e.kind === "stair" && stairGroupOf({ stairCategory: e.category }) === category)).slice(0, 40)
    : searchCatalogue(catalogue, q, section, 40 + hidden.size, all).filter((e) => e.kind !== "rate" || !e.contractors.some((c) => hidden.has(c.recordId))).slice(0, 40);
  const famChoice = fam && famPick ? fam.members.find((c) => c.id === famPick) : undefined;
  const famGlueQ = famChoice ? familyGlue(famChoice, catalogue, crew) : null;
  const famBuilt = fam ? familyLines(famChoice, famGlue, catalogue, section, crew, level) : null;
  // Only a section with work of its own is filtered, so only there is widening offered; never on a stairs option.
  const filterable = !narrowed && SECTION_LABOUR[section] !== undefined;
  const elsewhere = filterable && !all ? searchCatalogue(catalogue, q, section, Infinity, true).length - searchCatalogue(catalogue, q, section, Infinity).length : 0;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const builder = section === "Stairs" && category === null;
  const rows = builder ? (profiles ?? []).filter((p) => words.every((w) => p.name.toLowerCase().includes(w))) : [];
  const codeProfiles = builder && (profiles ?? []).length === 0 ? CODE_PROFILES.filter((p) => words.every((w) => profileName(p).toLowerCase().includes(w))) : [];
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
          {category !== null && ` · ${stairGroupLabel(category)}`}
          <button className="linkbtn right" onClick={onClose}>Close</button>
        </div>
        <div className="card-b">
          <input
            className="in"
            autoFocus
            placeholder={section === "Stairs" || stairsOnly ? "Search stair items…" : "Search the rate card, e.g. click, baseboard, bin"}
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
        {fam && famBuilt && (
          <div className="sb" role="group" aria-label={`Add ${fam.label}`}>
            <div className="sb-h">
              <b>{fam.label}</b>
              <button className="linkbtn" onClick={() => setFam(null)}>Back</button>
            </div>
            <div className="qw-chips qw-fall qw-fall-1" role="radiogroup" aria-label={`${fam.label}: how it's installed`}>
              {familyMethods(fam, famPick).map((o) => (
                <button type="button" key={o.label} className={`qw-chip${o.on ? " on" : ""}`} role="radio" aria-checked={o.on} onClick={() => setFamPick(o.choiceId)}>
                  {o.label}
                </button>
              ))}
            </div>
            {famGlueQ && (
              <div className="qw-chips qw-fall qw-fall-2" role="radiogroup" aria-label={`${fam.label}: ${famGlueQ.label}`}>
                <span className="qw-fall-k">{famGlueQ.label}</span>
                {(() => {
                  const current = famGlueQ.choices.find((m) => m.id === famGlue) ?? null;
                  // Before a glue is picked each says its own price; after, what it adds or takes off against the one picked.
                  const delta = new Map(materialDeltas({ choices: famGlueQ.choices, current }).map((d) => [d.id, d.delta]));
                  return famGlueQ.choices.map((m) => {
                    const on = m.id === famGlue;
                    const d = delta.get(m.id) ?? 0;
                    return (
                      <button type="button" key={m.id} className={`qw-chip${on ? " on" : ""}`} role="radio" aria-checked={on} onClick={() => setFamGlue(m.id)}>
                        {m.name}
                        {!on && <span className="faint"> {d === 0 && current ? "same" : `${d < 0 ? "-" : "+"}${money(Math.abs(d))}`}</span>}
                        {!on && !customer && current === null && <span className="faint"> · cost {money(m.cost)}</span>}
                      </button>
                    );
                  });
                })()}
              </div>
            )}
            <div className="sb-sum">
              <span>
                {famBuilt.missing ?? `${famBuilt.lines.length} line${famBuilt.lines.length === 1 ? "" : "s"} · ${famBuilt.lines.map((l) => `${money(l.unitPriceSnap ?? 0)} / ${l.uom ?? "unit"}`).join(" + ")}`}
              </span>
              <button className="btn small primary" disabled={famBuilt.missing !== null} onClick={() => (onPickMany ? onPickMany(famBuilt.lines, []) : famBuilt.lines.forEach(onPick))}>
                Add
              </button>
            </div>
          </div>
        )}
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
                  {k === "boxedSteps" ? (
                    // Blank = the rest of the steps (2026-11-02); the placeholder says how many that is.
                    <input className="in" inputMode="numeric" value={input.boxedSteps ?? ""} placeholder={String(stepSplit({ ...input, boxedSteps: null }).boxed)} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setInput({ ...input, boxedSteps: v === "" ? null : Number(v) || 0 }); }} />
                  ) : (
                    <input className="in" inputMode="numeric" value={input[k] || ""} placeholder="0" onChange={(e) => setInput({ ...input, [k]: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
                  )}
                </label>
              ))}
            </div>
            {built.untemplated ? (
              <p className="sb-msg warn">This profile has no Stair Items linked yet. Set its Per step, Per boxed step and other links in Airtable (Stair Profiles), then come back.</p>
            ) : (
              <>
                <ul className="sb-lines">
                  {built.lines.map((l) => {
                    const clash = sandFlag(l, [...optionLines.filter((x) => !replacing.includes(x.id) || !replace), ...built.lines]);
                    return (
                      <li key={l.id}>
                        <span>
                          {l.description}
                          {clash && <span className="sand-flag">⚠ {clash}</span>}
                        </span>
                        <span className="faint">{l.qty} × {money(l.unitPriceSnap ?? 0)}</span>
                      </li>
                    );
                  })}
                </ul>
                {built.lines.some((l) => sandRole({ id: l.sourceId, name: l.description, category: l.stairCategory }) === "sand") && <p className="sand-note">{SAND_DISCLAIMER}</p>}
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
            !fam &&
            families.map((f) => (
              <li key={f.key}>
                <button
                  className="pick"
                  onClick={() => {
                    setFam(f);
                    setFamPick(null);
                    setFamGlue(null);
                  }}
                >
                  <span className="nm">{f.label}</span>
                  <span className="mt">Pick how it&apos;s installed, then the glue when it takes one</span>
                </button>
              </li>
            ))}
          {!building &&
            rows.map((p) => (
              <li key={p.id}>
                <button className="pick" onClick={() => startBuilding(p)}>
                  <span className="nm">{p.name}</span>
                  <span className="mt">
                    {p.steps ? `${p.steps} steps · ` : ""}build it into Stair Item lines
                    {p.method === "Sand & stain" && <span className="mt disclaim">{SAND_DISCLAIMER}</span>}
                  </span>
                </button>
              </li>
            ))}
          {!building &&
            codeProfiles.map((p) => (
              <li key={profileName(p)}>
                <button className="pick" onClick={() => onPick(stairProfileLine(p.type, p.method, null))}>
                  <span className="nm">{profileName(p)}</span>
                  <span className="mt">
                    Whole staircase at a price you type · its description goes on the option
                    {p.method === "Sand & stain" && <span className="mt disclaim">{SAND_DISCLAIMER}</span>}
                  </span>
                </button>
              </li>
            ))}
          {results.map((e) => {
            const from = e.kind === "rate" ? (e.contractors.find((c) => c.name === crew) ?? bestContractor(e)) : null;
            // Sand steps → painted risers and stringers only (2026-11-06): whichever is on the option first greys the other out.
            const stairItem = e.kind === "stair" ? { id: e.recordId, name: e.name, category: e.category } : null;
            const blocked = stairItem ? sandBlocks(stairItem, optionLines) : null;
            const sanding = stairItem ? sandRole(stairItem) === "sand" : false;
            return (
              <li key={e.key}>
                <button className="pick" disabled={blocked !== null} title={blocked ?? undefined} onClick={() => onPick(lineFromEntry(e, section, crew ?? undefined, level))}>
                  <span className="nm">{entryLabel(e)}</span>
                  {blocked && <span className="mt blocked">{blocked}</span>}
                  {sanding && <span className="mt disclaim">{SAND_DISCLAIMER}</span>}
                  <span className="mt">
                    {e.kind === "rate"
                      ? `${money(rateSnap(e, from!, null, level).price)} / ${e.uom ?? "unit"}${customer ? "" : ` · ${e.contractors.length} contractor${e.contractors.length === 1 ? "" : "s"}, ${from!.name === crew ? "crew" : "cheapest"} ${from!.name}`}${from!.material && from!.material.choices.length > 1 ? ` · ${from!.material.choices.length} materials` : ""}`
                      : `${money(levelPrice(e.rate, level, true))} / piece${!customer && e.cost === null ? " · no cost on file" : ""}`}
                  </span>
                </button>
              </li>
            );
          })}
          {results.length === 0 && rows.length === 0 && codeProfiles.length === 0 && families.length === 0 && <li className="empty">{narrowed ? `No stair item${category !== null ? ` in ${stairGroupLabel(category)}` : ""} matches “${q}”.` : filterable && !all ? `Nothing in ${section} matches “${q}”.` : `Nothing on the rate card matches “${q}”.`}</li>}
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
