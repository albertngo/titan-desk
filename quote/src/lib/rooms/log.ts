/**
 * The Rooms tab (Albert, 2026-10-27): a manual log, room by room, of what was measured on site
 * (laser, Moasure, tape). One measurement per room, its total square feet, whichever way it was
 * measured (Albert, same day: no length, width or perimeter). It lives on the quote (Quotes →
 * Rooms), so every version shows the same rooms. A log only: nothing here prices, checks or
 * changes a quote, and the lines' own "Area / room" text is untouched. Pure, so the browser and
 * the server read it the same way; tested in tests/rooms.test.ts.
 */

export const LEVELS = ["Basement", "Main", "Upper", "Other"] as const;
export const METHODS = ["Laser", "Moasure", "Tape", "Other"] as const;

/** One room as saved. `sqft` is the room's total square feet; null = not measured. */
export type Room = {
  id: string;
  name: string;
  /** One of LEVELS, or "" for not said. */
  level: string;
  /** One of METHODS, or "" for not said. */
  method: string;
  sqft: number | null;
  /** What is on the floor now, in the measurer's words (carpet, glue-down vinyl…). */
  floor: string;
  notes: string;
};

export type RoomsLog = {
  rooms: Room[];
  /** Who saved last (the signed-in email) and when (ISO). */
  by: string | null;
  at: string | null;
  /** The field holds text the app didn't write and can't read; saving replaces it. */
  unreadable: boolean;
};

export const MAX_ROOMS = 60;
const MAX_NAME = 80;
const MAX_FLOOR = 80;
const MAX_NOTES = 600;
const MAX_SQFT = 100000;
const ID = /^r[a-z0-9]{1,20}$/;

/** The field's value exactly as stored; the save compares it to what the page saw. */
export const roomsRaw = (v: unknown): string => (typeof v === "string" ? v : "");

/** A typed or stored square footage: a number, or digits with an optional decimal point. Anything else is not measured. */
export function toSqft(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*(\d+\.?\d*|\.\d+)\s*$/.test(v) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0 || n >= MAX_SQFT) return null;
  return Math.round(n * 1000) / 1000;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const notes = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, MAX_NOTES) : "");
const pick = (v: unknown, list: readonly string[]) => (typeof v === "string" && list.includes(v) ? v : "");

const isBlank = (r: Room) => !r.name && !r.level && !r.method && !r.floor && !r.notes && r.sqft === null;

/**
 * Whatever the browser sends, as rooms safe to store: text trimmed and capped, levels and methods
 * off the lists blanked, a square footage that isn't a plain non-negative number dropped, rooms with
 * nothing in them left out, and no more than MAX_ROOMS.
 */
export function cleanRooms(input: unknown): Room[] {
  if (!Array.isArray(input)) return [];
  const out: Room[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    let id = typeof r.id === "string" && ID.test(r.id) && !seen.has(r.id) ? r.id : "";
    if (!id) {
      let n = out.length + 1;
      while (seen.has(`r${n}`)) n++;
      id = `r${n}`;
    }
    const room: Room = {
      id,
      name: text(r.name, MAX_NAME),
      level: pick(r.level, LEVELS),
      method: pick(r.method, METHODS),
      sqft: toSqft(r.sqft),
      floor: text(r.floor, MAX_FLOOR),
      notes: notes(r.notes),
    };
    if (isBlank(room)) continue;
    seen.add(id);
    out.push(room);
    if (out.length === MAX_ROOMS) break;
  }
  return out;
}

/** The field's text read back. Empty reads as no rooms; text the app didn't write is flagged, never guessed at. */
export function parseRooms(raw: string): RoomsLog {
  if (!raw.trim()) return { rooms: [], by: null, at: null, unreadable: false };
  try {
    const data = JSON.parse(raw) as unknown;
    if (data && typeof data === "object" && Array.isArray((data as { rooms?: unknown }).rooms)) {
      const d = data as { rooms: unknown; by?: unknown; at?: unknown };
      return {
        rooms: cleanRooms(d.rooms),
        by: typeof d.by === "string" ? d.by : null,
        at: typeof d.at === "string" ? d.at : null,
        unreadable: false,
      };
    }
  } catch {
    // not the app's JSON
  }
  return { rooms: [], by: null, at: null, unreadable: true };
}

/** What the save writes: the app's JSON, or "" when every room was removed. */
export function serializeRooms(rooms: Room[], by: string, at: string): string {
  return rooms.length === 0 ? "" : JSON.stringify({ v: 1, rooms, by, at });
}

/** Display only: how many rooms, and the square feet added up over the rooms that have them. */
export function roomTotals(rooms: Pick<Room, "sqft">[]): { count: number; sqft: number } {
  return { count: rooms.length, sqft: Math.round(rooms.reduce((a, r) => a + (r.sqft ?? 0), 0) * 10) / 10 };
}
