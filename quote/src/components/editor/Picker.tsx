"use client";

import { useState } from "react";
import { bestContractor, entryLabel, lineFromEntry, manualLine, searchCatalogue, type CardEntry, type EditorLine } from "@/lib/editor/model";
import { money } from "@/lib/format";

/** Add a line: search the rate card and stair items, or type the line in by hand. */
export function Picker({ section, catalogue, onPick, onClose }: { section: string; catalogue: CardEntry[]; onPick: (l: EditorLine) => void; onClose: () => void }) {
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
            const from = e.kind === "rate" ? bestContractor(e) : null;
            return (
              <li key={e.key}>
                <button className="pick" onClick={() => onPick(lineFromEntry(e, section))}>
                  <span className="nm">{entryLabel(e)}</span>
                  <span className="mt">
                    {e.kind === "rate"
                      ? `${money(from!.rate)} / ${e.uom ?? "unit"} · ${e.contractors.length} contractor${e.contractors.length === 1 ? "" : "s"}, cheapest ${from!.name}`
                      : `${money(e.rate)} / piece${e.cost === null ? " · no cost on file" : ""}`}
                  </span>
                </button>
              </li>
            );
          })}
          {results.length === 0 && <li className="empty">Nothing on the rate card matches “{q}”.</li>}
          <li>
            <button className="pick manual" onClick={() => onPick(manualLine(section, q.trim()))}>
              <span className="nm">Type it in yourself{q.trim() ? `: “${q.trim()}”` : ""}</span>
              <span className="mt">A line with your own price and cost, flagged NOSRC</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
