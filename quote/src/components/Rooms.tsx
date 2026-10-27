"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { saveRoomsAction } from "@/app/q/[id]/actions";
import { cleanRooms, LEVELS, MAX_ROOMS, METHODS, parseRooms, roomTotals, type Room } from "@/lib/rooms/log";

/**
 * The Rooms tab (Albert, 2026-10-27): what was measured on site, room by room, typed in as a log.
 * Kept on the quote, so every version shows the same rooms. Nothing reads it to price or check the
 * quote. Edited here and saved with one button; the save is refused if someone else saved first.
 */

type Draft = Omit<Room, "length" | "width" | "sqft" | "perimeter"> & { length: string; width: string; sqft: string; perimeter: string };
type NumKey = "length" | "width" | "sqft" | "perimeter";

const show = (n: number | null) => (n === null ? "" : String(n));
const toDraft = (r: Room): Draft => ({ ...r, length: show(r.length), width: show(r.width), sqft: show(r.sqft), perimeter: show(r.perimeter) });
const blank = (id: string): Draft => ({ id, name: "", level: "", method: "", length: "", width: "", sqft: "", perimeter: "", floor: "", notes: "" });
const sameRooms = (a: Room[], b: Room[]) => JSON.stringify(a) === JSON.stringify(b);
const one = (n: number) => n.toLocaleString("en-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function nextId(drafts: Draft[]): string {
  let n = drafts.length + 1;
  while (drafts.some((d) => d.id === `r${n}`)) n++;
  return `r${n}`;
}

const NUMS: { key: NumKey; label: string }[] = [
  { key: "length", label: "Length (ft)" },
  { key: "width", label: "Width (ft)" },
  { key: "sqft", label: "Area (sq ft)" },
  { key: "perimeter", label: "Perimeter (ft)" },
];

export function Rooms({ quoteRecordId, quoteNumber, raw, savedLabel }: { quoteRecordId: string; quoteNumber: string | null; raw: string; savedLabel: string | null }) {
  const [seen, setSeen] = useState(raw);
  const log = useMemo(() => parseRooms(seen), [seen]);
  const [drafts, setDrafts] = useState<Draft[]>(() => log.rooms.map(toDraft));
  const [label, setLabel] = useState(savedLabel);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const cleaned = useMemo(() => cleanRooms(drafts), [drafts]);
  const dirty = !sameRooms(cleaned, log.rooms);
  const totals = roomTotals(cleaned);

  // On site a reload or a back swipe would lose what was typed; the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (id: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const remove = (id: string) => setDrafts((ds) => ds.filter((d) => d.id !== id));
  const add = () => setDrafts((ds) => (ds.length >= MAX_ROOMS ? ds : [...ds, blank(nextId(ds))]));

  function save() {
    setError(null);
    startSave(async () => {
      const r = await saveRoomsAction(quoteRecordId, seen, drafts);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setSeen(r.saved);
      setDrafts(parseRooms(r.saved).rooms.map(toDraft));
      setLabel("Saved just now");
    });
  }

  return (
    <section className="card rooms" aria-labelledby="rooms-h">
      <div className="card-h" id="rooms-h">
        Rooms
        <span className="right faint num">
          {totals.count} {totals.count === 1 ? "room" : "rooms"}
          {totals.sqft > 0 && ` · ${one(totals.sqft)} sq ft`}
          {totals.perimeter > 0 && ` · ${one(totals.perimeter)} ft perimeter`}
        </span>
      </div>
      <div className="card-b rm-body">
        <p className="faint rm-intro">
          A log of what was measured on site, room by room: laser, Moasure or tape. It is kept on {quoteNumber ?? "this quote"}, so every version shows
          the same rooms. Nothing here changes the quote&apos;s lines or prices.
        </p>

        {log.unreadable && (
          <div className="rm-odd" role="note">
            The Rooms field in Airtable holds text the app didn&apos;t write, so it isn&apos;t shown as rooms. Saving here replaces it.
            <details>
              <summary>Show that text</summary>
              <pre>{seen}</pre>
            </details>
          </div>
        )}

        <fieldset className="rm-set" disabled={saving}>
          <legend className="sr-only">Rooms</legend>
          {drafts.length === 0 ? (
            <p className="empty rm-empty">No rooms logged yet.</p>
          ) : (
            <ol className="rm-list">
              {drafts.map((d, i) => {
                const name = d.name.trim() || `room ${i + 1}`;
                return (
                  <li key={d.id} className="rm">
                    <div className="rm-top">
                      <span className="rm-n num" aria-hidden="true">{i + 1}</span>
                      <input
                        className="in rm-name"
                        aria-label={`Room ${i + 1} name`}
                        placeholder="Room, e.g. Upstairs bedroom 2"
                        value={d.name}
                        maxLength={80}
                        onChange={(e) => update(d.id, { name: e.target.value })}
                      />
                      <button type="button" className="iconbtn danger" title="Remove room" aria-label={`Remove ${name}`} onClick={() => remove(d.id)}>
                        ✕
                      </button>
                    </div>
                    <div className="rm-grid">
                      <label className="rm-f">
                        <span>Level</span>
                        <select className="in" value={d.level} onChange={(e) => update(d.id, { level: e.target.value })}>
                          <option value="">—</option>
                          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </label>
                      <label className="rm-f">
                        <span>Measured with</span>
                        <select className="in" value={d.method} onChange={(e) => update(d.id, { method: e.target.value })}>
                          <option value="">—</option>
                          {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </label>
                      {NUMS.map(({ key, label: l }) => (
                        <label key={key} className="rm-f">
                          <span>{l}</span>
                          <input className="in num" inputMode="decimal" autoComplete="off" value={d[key]} onChange={(e) => update(d.id, { [key]: e.target.value } as Partial<Draft>)} />
                        </label>
                      ))}
                      <label className="rm-f rm-wide">
                        <span>Floor there now</span>
                        <input className="in" placeholder="e.g. carpet, glue-down vinyl, hardwood" maxLength={80} value={d.floor} onChange={(e) => update(d.id, { floor: e.target.value })} />
                      </label>
                      <label className="rm-f rm-wide">
                        <span>Notes</span>
                        <textarea
                          className="in area"
                          placeholder="What it's like: subfloor, squeaks, dips, closets, transitions"
                          maxLength={600}
                          value={d.notes}
                          onChange={(e) => update(d.id, { notes: e.target.value })}
                        />
                      </label>
                    </div>
                    {d.method === "Moasure" && (
                      <p className="rm-hint faint">Moasure shows the perimeter first and the area in brackets: 46.0ft (128.5ft²) is a 46 ft perimeter and 128.5 sq ft.</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </fieldset>

        {error && <p className="ca-err rm-err" role="alert">{error}</p>}

        <div className="rm-foot">
          <button type="button" className="chip-btn" onClick={add} disabled={saving || drafts.length >= MAX_ROOMS}>
            + Add room
          </button>
          <span className="rm-state faint">{dirty ? "Unsaved changes" : (label ?? "")}</span>
          <button type="button" className="btn primary" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save rooms"}
          </button>
        </div>
      </div>
    </section>
  );
}
