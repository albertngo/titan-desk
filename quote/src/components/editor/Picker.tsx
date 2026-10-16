"use client";

import { useState } from "react";
import { bestContractor, entryLabel, lineFromEntry, manualLine, searchCatalogue, type CardEntry, type EditorLine } from "@/lib/editor/model";
import { money } from "@/lib/format";
import { levelApplies, levelPrice, type ServiceLevel } from "@/lib/pricing/service";

/** Add a line: search the rate card and stair items, or type the line in by hand. Customer view shows the charge rate only. */
export function Picker({
  section,
  catalogue,
  onPick,
  onClose,
  customer,
  level,
  crew,
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
}) {
  const [q, setQ] = useState("");
  const results = searchCatalogue(catalogue, q, section);

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
        </div>
        <ul className="pick-list">
          {results.map((e) => {
            const from = e.kind === "rate" ? (e.contractors.find((c) => c.name === crew) ?? bestContractor(e)) : null;
            return (
              <li key={e.key}>
                <button className="pick" onClick={() => onPick(lineFromEntry(e, section, crew ?? undefined, level))}>
                  <span className="nm">{entryLabel(e)}</span>
                  <span className="mt">
                    {e.kind === "rate"
                      ? `${money(levelPrice(from!.rate, level, levelApplies({ sourceKind: "rate", labourType: e.labourType })))} / ${e.uom ?? "unit"}${customer ? "" : ` · ${e.contractors.length} contractor${e.contractors.length === 1 ? "" : "s"}, ${from!.name === crew ? "crew" : "cheapest"} ${from!.name}`}`
                      : `${money(levelPrice(e.rate, level, true))} / piece${!customer && e.cost === null ? " · no cost on file" : ""}`}
                  </span>
                </button>
              </li>
            );
          })}
          {results.length === 0 && <li className="empty">Nothing on the rate card matches “{q}”.</li>}
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
