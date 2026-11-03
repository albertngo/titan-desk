"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { floorOptionsAction, saveFloorSheetAction, saveRoomsAction } from "@/app/q/[id]/actions";
import { draftKey, type EditorQuote } from "@/lib/editor/model";
import { floorPlan, previewChoices, roomsFromSheet, sheetSkus } from "@/lib/floorsheet/plan";
import {
  BASE_HOW,
  BASE_PIECE,
  cleanFloorSheet,
  DISPOSAL_NAME,
  DISPOSALS,
  emptyWant,
  FLOOR_NAME,
  FLOORS,
  LEVEL_CODES,
  MAX_ROOMS,
  measure,
  MEASURED_WITH,
  NAILED,
  NO_MATERIAL,
  NOW,
  NOW_NAME,
  parseFloorStored,
  SUBFLOOR_NAME,
  SUBFLOOR_SHEETS,
  type FloorRoom,
  type FloorSheet,
  type FloorWant,
} from "@/lib/floorsheet/sheet";
import { parseRooms } from "@/lib/rooms/log";

/**
 * The Flooring Site Sheet on the Site sheet tab (Albert, 2026-11-03: "build the sheets from companycam into rooms
 * and flooring lines"). What Claude read, beside the photo, for a person to check box for box; then Copy rooms
 * puts its rooms on the Rooms tab, and Build flooring options prices the sheet on the server like a preliminary
 * (floorOptionsAction) and adds the options to the editor's draft, where they are reviewed and saved as usual.
 * Nothing here writes a quote line. No car check or sending yet (Albert, same day).
 */

const BASE_HOW_NAME = { none: "None", reinstall: "Reinstall existing", new: "New" } as const;
const BASE_PIECE_NAME = { baseboard: "Baseboard", shoe: "Shoe", both: "Both" } as const;
const LEVEL_NAME = { B: "Basement", M: "Main", U: "Upper" } as const;

const blankRoom = (): FloorRoom => ({ name: null, level: null, sqft: null, linearFt: null, now: null, remove: false, floors: [] });

export function FloorSheetPanel({
  quoteRecordId,
  raw,
  photos,
  roomsRaw,
  initial,
  base,
  versionId,
  onSaved,
}: {
  quoteRecordId: string;
  raw: string;
  /** Tells the tab what is saved now, so its next read from CompanyCam compares against it. */
  onSaved?: (saved: string) => void;
  photos: { url: string; name: string }[];
  roomsRaw: string;
  initial: EditorQuote;
  base: string;
  versionId: string;
}) {
  const [seen, setSeen] = useState(raw);
  const stored = useMemo(() => parseFloorStored(seen), [seen]);
  const [sheet, setSheet] = useState<FloorSheet>(() => stored?.sheet ?? cleanFloorSheet({}));
  const [roomsSeen, setRoomsSeen] = useState(roomsRaw);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const clean = useMemo(() => cleanFloorSheet(sheet), [sheet]);
  // Only the server can look a SKU up, so the preview takes every SKU as found; Build gives the real answer.
  const preview = useMemo(() => floorPlan(clean, previewChoices(), new Map(sheetSkus(clean).map((k) => [k, "preview"]))), [clean]);
  const dirty = JSON.stringify(clean) !== JSON.stringify(stored?.sheet ?? cleanFloorSheet({}));
  const unclear = new Set(sheet.unclear);
  const roomsNow = parseRooms(roomsSeen).rooms.length;
  const totalSqft = Math.round(clean.rooms.reduce((s, r) => s + (r.sqft ?? 0), 0) * 100) / 100;
  const totalFt = Math.round(clean.rooms.reduce((s, r) => s + (r.linearFt ?? 0), 0) * 100) / 100;

  if (!stored) return null;

  const setRoom = (i: number, patch: Partial<FloorRoom>) => setSheet((s) => ({ ...s, rooms: s.rooms.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const setWant = (i: 0 | 1, patch: Partial<FloorWant>) => setSheet((s) => ({ ...s, want: s.want.map((w, j) => (j === i ? { ...w, ...patch } : w)) as [FloorWant, FloorWant] }));
  const u = (code: string) => (unclear.has(code) ? " fs-unclear" : "");

  function save(checked = true, then?: () => void) {
    setMessage(null);
    start(async () => {
      const r = await saveFloorSheetAction(quoteRecordId, seen, { ...clean, unclear: checked ? [] : clean.unclear }, checked);
      if (!r.ok) {
        setMessage({ text: r.message, bad: true });
        if (!then) return;
      } else {
        setSeen(r.saved);
        onSaved?.(r.saved);
        setSheet(parseFloorStored(r.saved)?.sheet ?? clean);
        if (!then) setMessage({ text: "Checked and saved.", bad: false });
      }
      then?.();
    });
  }

  function copyRooms() {
    setMessage(null);
    start(async () => {
      const r = await saveRoomsAction(quoteRecordId, roomsSeen, roomsFromSheet(clean));
      if (!r.ok) return setMessage({ text: r.message, bad: true });
      setRoomsSeen(r.saved);
      setMessage({ text: `${clean.rooms.length} room${clean.rooms.length === 1 ? "" : "s"} put on the Rooms tab.`, bad: false });
    });
  }

  // Like Build stair options: unsaved edits are kept first without marking the sheet checked; a failed save never stops the build.
  function build() {
    const go = () =>
      start(async () => {
        const key = draftKey(initial);
        let begin: { quote: EditorQuote; base?: string } = { quote: initial, base };
        try {
          const prev = window.localStorage.getItem(key);
          if (prev) begin = JSON.parse(prev) as { quote: EditorQuote; base?: string };
        } catch {
          // No storage: start from the version as saved.
        }
        const r = await floorOptionsAction(clean, begin.quote.options.map((o) => o.name));
        if (!r.ok) return setMessage({ text: r.message, bad: true });
        let q = begin.quote;
        const rec = q.options.some((x) => x.recommended && x.scope !== "Stairs");
        r.options.forEach((o, i) => {
          const id = `opt-fs-${i}-${Date.now().toString(36)}`;
          q = { ...q, options: [...q.options, { id, name: o.name, description: o.description, recommended: i === 0 && !rec, serviceLevel: "Standard", crew: null, scope: "Flooring", lines: o.lines }] };
        });
        try {
          window.localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), quote: q, base: begin.base ?? base }));
        } catch {
          return setMessage({ text: "This device won't keep a draft (private browsing?), so the options can't be handed to the editor.", bad: true });
        }
        router.push(`/q/${versionId}/edit`);
      });
    if (dirty) save(stored?.checked === true, go);
    else go();
  }

  const want = (i: 0 | 1) => {
    const w = sheet.want[i];
    const code = (c: string) => u(c);
    return (
      <fieldset className="fs-want" key={i}>
        <legend>Floor {i + 1}</legend>
        <label className={`fs-f${code("W1")}`}>
          <span>W1 New floor</span>
          <select value={w.floor ?? ""} onChange={(e) => setWant(i, { floor: (e.target.value || null) as FloorWant["floor"] })}>
            <option value="">{i === 0 ? "Not ticked" : "Not used"}</option>
            {FLOORS.map((f) => <option key={f} value={f}>{FLOOR_NAME[f]}</option>)}
          </select>
        </label>
        {w.floor && NAILED.includes(w.floor) && (
          <label className="fs-f">
            <span>Nailed wood</span>
            <select value={w.nail ?? ""} onChange={(e) => setWant(i, { nail: (e.target.value || null) as FloorWant["nail"] })}>
              <option value="">Not ticked (nail down)</option>
              <option value="nail">Nail down</option>
              <option value="nailGlue">Nail + glue</option>
            </select>
          </label>
        )}
        {w.floor && !NO_MATERIAL.includes(w.floor) && (
          <>
            <label className={`fs-f${code("W2")}`}>
              <span>W2 Material</span>
              <select value={w.material === "customer" ? "customer" : w.sku !== null ? "sku" : "standard"} onChange={(e) => setWant(i, e.target.value === "customer" ? { material: "customer", sku: null } : e.target.value === "sku" ? { material: null, sku: w.sku ?? "" } : { material: "standard", sku: null })}>
                <option value="standard">Standard</option>
                <option value="customer">Customer supplies</option>
                <option value="sku">A SKU</option>
              </select>
            </label>
            {w.material !== "customer" && w.sku !== null && (
              <label className="fs-f">
                <span>SKU</span>
                <input value={w.sku} onChange={(e) => setWant(i, { sku: e.target.value })} placeholder="As written on the sheet" />
              </label>
            )}
          </>
        )}
        {i === 1 && sheet.want[1].floor && (
          <button type="button" className="linkbtn" onClick={() => setWant(1, emptyWant())}>Clear Floor 2</button>
        )}
      </fieldset>
    );
  };

  return (
    <section className="card fs" aria-label="Flooring sheet">
      <div className="card-h">
        Flooring sheet
        <span className="right faint">{stored.checked ? "checked" : "read, not checked yet"} · {stored.by} · {new Date(stored.at).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
      </div>
      <div className="card-b fs-cols">
        <div className="fs-shots">
          {photos.length === 0 && <p className="faint">No flooring sheet photo on the quote.</p>}
          {photos.map((p) => (
            <a key={p.url} href={p.url} target="_blank" rel="noreferrer" title="Open full size">
              {/* eslint-disable-next-line @next/next/no-img-element -- an Airtable attachment, its address expires */}
              <img src={p.url} alt={p.name} />
            </a>
          ))}
        </div>

        <div className="fs-form">
          <p className="faint">
            Check each box against the photo.{sheet.unclear.length > 0 && <b className="fs-unclear-note"> {sheet.unclear.length} marked in yellow to check.</b>}
          </p>
          <label className={`fs-f fs-inline${u("R0")}`}>
            <span>R0 Measured with</span>
            <select value={sheet.measuredWith ?? ""} onChange={(e) => setSheet((s) => ({ ...s, measuredWith: (e.target.value || null) as FloorSheet["measuredWith"] }))}>
              <option value="">Not ticked</option>
              {MEASURED_WITH.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>

          <div className="fs-tablewrap">
            <table className="fs-rooms">
              <thead>
                <tr><th></th><th>Room</th><th>Level</th><th>Sq ft</th><th>Linear ft</th><th>Floor there now</th><th>Remove</th><th>New floor</th><th></th></tr>
              </thead>
              <tbody>
                {sheet.rooms.map((r, i) => (
                  <tr key={i} className={u(`R${i + 1}`).trim()}>
                    <td className="fs-code">R{i + 1}</td>
                    <td><input aria-label={`R${i + 1} room`} value={r.name ?? ""} onChange={(e) => setRoom(i, { name: e.target.value || null })} /></td>
                    <td>
                      <select aria-label={`R${i + 1} level`} value={r.level ?? ""} onChange={(e) => setRoom(i, { level: (e.target.value || null) as FloorRoom["level"] })}>
                        <option value="">–</option>
                        {LEVEL_CODES.map((l) => <option key={l} value={l}>{LEVEL_NAME[l]}</option>)}
                      </select>
                    </td>
                    <td><input aria-label={`R${i + 1} sq ft`} inputMode="decimal" className="fs-num" defaultValue={r.sqft ?? ""} key={`s${i}-${r.sqft}`} onBlur={(e) => setRoom(i, { sqft: measure(e.target.value) })} /></td>
                    <td><input aria-label={`R${i + 1} linear ft`} inputMode="decimal" className="fs-num" defaultValue={r.linearFt ?? ""} key={`l${i}-${r.linearFt}`} onBlur={(e) => setRoom(i, { linearFt: measure(e.target.value) })} /></td>
                    <td className="fs-now">
                      <select aria-label={`R${i + 1} floor there now`} value={r.now ?? ""} onChange={(e) => setRoom(i, { now: (e.target.value || null) as FloorRoom["now"] })}>
                        <option value="">–</option>
                        {NOW.map((n) => <option key={n} value={n}>{NOW_NAME[n]}</option>)}
                      </select>
                    </td>
                    <td className="fs-c"><input type="checkbox" aria-label={`R${i + 1} remove`} checked={r.remove} onChange={(e) => setRoom(i, { remove: e.target.checked })} /></td>
                    <td className="fs-c fs-nf">
                      {([1, 2] as const).map((f) => (
                        <label key={f}>
                          <input type="checkbox" checked={r.floors.includes(f)} onChange={(e) => setRoom(i, { floors: (e.target.checked ? [...r.floors, f] : r.floors.filter((x) => x !== f)).sort() as FloorRoom["floors"] })} />
                          {f}
                        </label>
                      ))}
                    </td>
                    <td><button type="button" className="linkbtn" aria-label={`Remove row R${i + 1}`} onClick={() => setSheet((s) => ({ ...s, rooms: s.rooms.filter((_, j) => j !== i) }))}>×</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td></td>
                  <td>{sheet.rooms.length < MAX_ROOMS && <button type="button" className="linkbtn" onClick={() => setSheet((s) => ({ ...s, rooms: [...s.rooms, blankRoom()] }))}>+ Add room</button>}</td>
                  <td className="faint">Total</td>
                  <td><b>{totalSqft}</b></td>
                  <td><b>{totalFt}</b></td>
                  <td colSpan={4} className="faint">New floor blank = every floor written below</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="fs-wants">{want(0)}{want(1)}</div>

          <div className="fs-shared">
            <label className={`fs-f${u("W3")}`}>
              <span>W3 Baseboards</span>
              <span className="fs-pair">
                <select value={sheet.baseboards.how ?? ""} onChange={(e) => setSheet((s) => ({ ...s, baseboards: { ...s.baseboards, how: (e.target.value || null) as FloorSheet["baseboards"]["how"] } }))}>
                  <option value="">Not ticked</option>
                  {BASE_HOW.map((b) => <option key={b} value={b}>{BASE_HOW_NAME[b]}</option>)}
                </select>
                <select aria-label="Baseboard piece" value={sheet.baseboards.piece ?? ""} onChange={(e) => setSheet((s) => ({ ...s, baseboards: { ...s.baseboards, piece: (e.target.value || null) as FloorSheet["baseboards"]["piece"] } }))}>
                  <option value="">Piece not ticked</option>
                  {BASE_PIECE.map((b) => <option key={b} value={b}>{BASE_PIECE_NAME[b]}</option>)}
                </select>
              </span>
            </label>
            <label className={`fs-f${u("W4")}`}>
              <span>W4 Subfloor</span>
              <span className="fs-pair">
                <label className="fs-tick"><input type="checkbox" checked={sheet.subfloor.screw} onChange={(e) => setSheet((s) => ({ ...s, subfloor: { ...s.subfloor, screw: e.target.checked } }))} /> Screw-down</label>
                <select aria-label="New subfloor" value={sheet.subfloor.sheet ?? ""} onChange={(e) => setSheet((s) => ({ ...s, subfloor: { ...s.subfloor, sheet: (e.target.value || null) as FloorSheet["subfloor"]["sheet"] } }))}>
                  <option value="">No new subfloor</option>
                  {SUBFLOOR_SHEETS.map((x) => <option key={x} value={x}>{SUBFLOOR_NAME[x]}</option>)}
                </select>
                <input aria-label="Subfloor sq ft" inputMode="decimal" className="fs-num" placeholder="all rooms" defaultValue={sheet.subfloor.sqft ?? ""} key={`sub-${sheet.subfloor.sqft}`} onBlur={(e) => setSheet((s) => ({ ...s, subfloor: { ...s.subfloor, sqft: measure(e.target.value) } }))} />
              </span>
            </label>
            <label className={`fs-f${u("W5")}`}>
              <span>W5 Disposal</span>
              <select value={sheet.disposal ?? ""} onChange={(e) => setSheet((s) => ({ ...s, disposal: (e.target.value || null) as FloorSheet["disposal"] }))}>
                <option value="">Blank: the customer disposes</option>
                {DISPOSALS.map((d) => <option key={d} value={d}>{DISPOSAL_NAME[d]}</option>)}
              </select>
            </label>
            <label className={`fs-f fs-notes${u("N2")}`}>
              <span>N2 Notes</span>
              <textarea rows={2} value={sheet.notes ?? ""} onChange={(e) => setSheet((s) => ({ ...s, notes: e.target.value || null }))} />
            </label>
          </div>

          <div className="fs-result">
            <h4>What it builds</h4>
            {preview.works.length === 0 ? (
              <p className="faint">Nothing yet: tick a new floor (W1) and give the rooms their square feet.</p>
            ) : (
              <ol>
                {preview.works.map((w, i) => (
                  <li key={i}>{w.description || "Removal, prep and baseboards only"} <span className="faint">· {w.rows.length} row{w.rows.length === 1 ? "" : "s"}</span></li>
                ))}
              </ol>
            )}
            {preview.notes.length > 0 && <ul className="ss-flags">{preview.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          </div>

          {message && <p className={message.bad ? "ss-msg bad" : "ss-msg ok"} role="status">{message.text}</p>}
          <div className="ss-acts">
            <button type="button" className="btn" disabled={busy || (!dirty && stored.checked)} onClick={() => save(true)}>{busy ? "Working…" : "Save check"}</button>
            <button type="button" className="btn" disabled={busy || clean.rooms.length === 0} onClick={copyRooms} title={roomsNow ? `Replaces the ${roomsNow} room${roomsNow === 1 ? "" : "s"} on the Rooms tab` : undefined}>
              {roomsNow ? `Replace the Rooms tab (${roomsNow}) with these rooms` : "Copy rooms to the Rooms tab"}
            </button>
            <button type="button" className="btn primary" disabled={busy || preview.works.length === 0} onClick={build}>Build flooring options →</button>
          </div>
          <p className="faint">Build prices the sheet the way a preliminary is priced (the quick form&apos;s choices and standard products) and adds the options to this quote in the editor, at Standard. Review them there and save.</p>
        </div>
      </div>
    </section>
  );
}
