"use client";

import { useRef, useState, useTransition } from "react";
import { saveDescriptionAction } from "@/app/q/[id]/actions";
import { cleanDescription, DESCRIPTION_MAX } from "@/lib/quotes/group";

/**
 * The quote's description (Albert, 2026-11-03), under the customer's name in the quote page header: a short
 * staff-only label ("Unit 1204 · kitchen + hall") that All quotes shows under the name, so several quotes for one
 * customer at one address can be told apart. Click to edit; Enter saves, Escape cancels; an empty box clears it.
 * Staff only: the page leaves it out in Customer view, and the customer copy never carries it.
 */
export function QuoteDescription({ quoteRecordId, initial }: { quoteRecordId: string; initial: string | null }) {
  const [seen, setSeen] = useState(initial ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const open = () => {
    setDraft(seen);
    setError(null);
    setEditing(true);
    requestAnimationFrame(() => input.current?.select());
  };
  const cancel = () => {
    setEditing(false);
    setError(null);
  };
  const save = () => {
    if ((cleanDescription(draft) ?? "") === (cleanDescription(seen) ?? "")) return cancel();
    setError(null);
    startSave(async () => {
      const r = await saveDescriptionAction(quoteRecordId, seen, draft);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setSeen(r.saved ?? "");
      setEditing(false);
    });
  };

  if (!editing) {
    return seen ? (
      <button type="button" className="qd qd-show" onClick={open} title="Edit the description">
        <span className="qd-text">{seen}</span>
        <span className="qd-edit" aria-hidden>Edit</span>
      </button>
    ) : (
      <button type="button" className="qd qd-add" onClick={open}>+ Add a description (unit, rooms…)</button>
    );
  }

  return (
    <div className="qd qd-form">
      <input
        ref={input}
        type="text"
        value={draft}
        maxLength={DESCRIPTION_MAX}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") cancel();
        }}
        placeholder="e.g. Unit 1204 · kitchen + hall"
        aria-label="Quote description, staff only"
        disabled={saving}
        autoFocus
      />
      <button type="button" className="btn small primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      <button type="button" className="btn small" onClick={cancel} disabled={saving}>Cancel</button>
      {error && <p className="qd-err" role="alert">{error}</p>}
      <p className="qd-hint">Staff only. Shows under the name on All quotes; the customer never sees it.</p>
    </div>
  );
}
