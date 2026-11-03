"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { floorOptionsAction, saveFloorSheetAction, saveRoomsAction } from "@/app/q/[id]/actions";
import { draftKey, type EditorQuote } from "@/lib/editor/model";
import { floorPlan, previewChoices, roomsFromSheet, sheetSkus } from "@/lib/floorsheet/plan";
import { cleanFloorSheet, MAX_ROOMS, parseFloorStored, type FloorSheet } from "@/lib/floorsheet/sheet";
import { parseRooms } from "@/lib/rooms/log";
import { CamDraw } from "./CamDraw";
import { FloorSheetPaper } from "./FloorSheetPaper";

/**
 * The Flooring Site Sheet on the Site sheet tab (Albert, 2026-11-03). At the top, "Draw from CompanyCam image": pick
 * the photo, it is read, and the link then opens that photo (a new tab) or its page in CompanyCam. Below, what was
 * read drawn as the paper sheet itself, 1:1 ("easier to compare"), every mark the control for its field. Then Copy
 * rooms puts its rooms on the Rooms tab, and Build flooring options prices it on the server like a preliminary
 * (floorOptionsAction) and adds the options to the editor's draft, reviewed and saved there as usual. Nothing here
 * writes a quote line. No car check or sending yet.
 */

type Photo = { url: string; name: string };
type Raw = Record<string, unknown>;

/** The sheet as the paper edits it: every room row present (blank ones too), boxes as typed. Cleaned when used. */
function toRaw(s: FloorSheet): Raw {
  const rooms = [...s.rooms, ...Array.from({ length: Math.max(0, MAX_ROOMS - s.rooms.length) }, () => ({ name: null, level: null, sqft: null, linearFt: null, now: null, remove: false, floors: [] }))];
  return structuredClone({ ...s, rooms }) as unknown as Raw;
}
function getAt(o: Raw, path: string): unknown {
  return path.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Raw)[k] : undefined), o);
}
function setAt(o: Raw, path: string, value: unknown): Raw {
  const keys = path.split(".");
  const out = structuredClone(o);
  let x: Raw = out;
  for (const k of keys.slice(0, -1)) x = x[k] as Raw;
  x[keys[keys.length - 1]] = value;
  return out;
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null);

export function FloorSheetPanel({
  quoteRecordId,
  raw,
  photos: photos0,
  roomsRaw,
  initial,
  base,
  versionId,
  camLinked,
}: {
  quoteRecordId: string;
  raw: string;
  photos: Photo[];
  roomsRaw: string;
  initial: EditorQuote;
  base: string;
  versionId: string;
  camLinked: boolean;
}) {
  const [seen, setSeen] = useState(raw);
  const stored = useMemo(() => parseFloorStored(seen), [seen]);
  const [sheet, setSheet] = useState<Raw>(() => toRaw(stored?.sheet ?? cleanFloorSheet({})));
  const [photos, setPhotos] = useState<Photo[]>(photos0);
  const [roomsSeen, setRoomsSeen] = useState(roomsRaw);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const clean = useMemo(() => cleanFloorSheet(sheet), [sheet]);
  // Only the server can look a SKU up, so the preview takes every SKU as found; Build gives the real answer.
  const preview = useMemo(() => floorPlan(clean, previewChoices(), new Map(sheetSkus(clean).map((k) => [k, "preview"]))), [clean]);
  const dirty = JSON.stringify(clean) !== JSON.stringify(stored?.sheet ?? cleanFloorSheet({}));
  const unclear = new Set(clean.unclear);
  const roomsNow = parseRooms(roomsSeen).rooms.length;

  const drawn = (saved: string, ph: Photo[] | undefined) => {
    setSeen(saved);
    setSheet(toRaw(parseFloorStored(saved)?.sheet ?? cleanFloorSheet({})));
    if (ph) setPhotos(ph);
    setMessage({ text: "Drawn. Check every box against the photo (Open image), then Save check.", bad: false });
  };

  const draw = camLinked ? <CamDraw quoteRecordId={quoteRecordId} seen={seen} kind="flooring" max={2} label={stored ? "Draw again" : "Draw from CompanyCam image"} onRead={(r) => drawn(r.saved, r.photos)} /> : null;

  if (!stored) {
    return (
      <section className="card fs" aria-label="Flooring sheet">
        <div className="card-h">Flooring sheet</div>
        <div className="card-b fs-source">
          {draw ?? <span className="faint">Link a CompanyCam project to this quote to draw the flooring sheet from its photo.</span>}
          {message && <p className={message.bad ? "ss-msg bad" : "ss-msg ok"} role="status">{message.text}</p>}
        </div>
      </section>
    );
  }

  function save(checked = true, then?: () => void) {
    setMessage(null);
    start(async () => {
      const r = await saveFloorSheetAction(quoteRecordId, seen, { ...clean, unclear: checked ? [] : clean.unclear }, checked);
      if (r.ok) {
        setSeen(r.saved);
        setSheet(toRaw(parseFloorStored(r.saved)?.sheet ?? clean));
        if (!then) setMessage({ text: "Checked and saved.", bad: false });
      } else {
        setMessage({ text: r.message, bad: true });
        if (!then) return;
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

  const taken = when(stored.cam[0]?.at ?? null);

  return (
    <section className="card fs" aria-label="Flooring sheet">
      <div className="card-h">
        Flooring sheet
        <span className="right faint">{stored.checked ? "checked" : "read, not checked yet"} · {stored.by} · {when(stored.at)}</span>
      </div>
      <div className="card-b fs-body">
        <div className="fs-source">
          <span>
            Drawn from {stored.cam.length ? "CompanyCam image" : "a photo"}
            {taken && <span className="faint"> · taken {taken}</span>}
          </span>
          {photos.map((p, i) => (
            <a key={p.url} href={p.url} target="_blank" rel="noreferrer">
              Open image{photos.length > 1 ? ` ${i + 1}` : ""} ↗
            </a>
          ))}
          {stored.cam.filter((c) => c.pageUrl).map((c, i, all) => (
            <a key={c.id} href={c.pageUrl!} target="_blank" rel="noreferrer">
              Open in CompanyCam{all.length > 1 ? ` ${i + 1}` : ""} ↗
            </a>
          ))}
          {draw}
          {clean.unclear.length > 0 && <b className="fs-unclear-note">{clean.unclear.length} marked in yellow to check</b>}
        </div>

        <FloorSheetPaper get={(path) => getAt(sheet, path)} edit={(path, v) => setSheet((s) => setAt(s, path, v))} unclear={unclear} />

        <div className="fs-result">
          <h4>What it builds</h4>
          {preview.works.length === 0 ? (
            <p className="faint">Nothing yet: tick a new floor (W1) and give the rooms their square feet.</p>
          ) : (
            <ol>
              {preview.works.map((w, i) => (
                <li key={i}>
                  {w.description || "Removal, prep and baseboards only"} <span className="faint">· {w.rows.length} row{w.rows.length === 1 ? "" : "s"}</span>
                </li>
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
    </section>
  );
}
