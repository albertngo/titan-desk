import { describe, expect, it } from "vitest";
import { cleanRooms, MAX_ROOMS, parseRooms, roomsRaw, roomTotals, serializeRooms, toSqft } from "../src/lib/rooms/log";

/** The Rooms tab's log (2026-10-27). Invented rooms and numbers only. */

const room = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  name: "Back bedroom",
  level: "Upper",
  method: "Laser",
  sqft: "115",
  floor: "Carpet",
  notes: "Squeak by the door",
  ...over,
});

describe("toSqft", () => {
  it("takes numbers and plain decimal text", () => {
    expect(toSqft(120)).toBe(120);
    expect(toSqft("124.38")).toBe(124.38);
    expect(toSqft(" 9.5 ")).toBe(9.5);
    expect(toSqft(".5")).toBe(0.5);
    expect(toSqft("7.")).toBe(7);
  });

  it("rounds to three places", () => {
    expect(toSqft(1.23456)).toBe(1.235);
  });

  it("reads anything else as not measured", () => {
    for (const v of ["", " ", "12ft", "1,200", "-3", "abc", null, undefined, NaN, Infinity, -1, 100000, {}]) expect(toSqft(v)).toBeNull();
  });
});

describe("cleanRooms", () => {
  it("keeps a room as typed, the square footage as a number", () => {
    expect(cleanRooms([room()])).toEqual([
      { id: "r1", name: "Back bedroom", level: "Upper", method: "Laser", sqft: 115, floor: "Carpet", notes: "Squeak by the door" },
    ]);
  });

  it("keeps only the total square feet: length, width and perimeter are not stored", () => {
    const [r] = cleanRooms([room({ length: "11.5", width: "10", perimeter: "43" })]);
    expect(Object.keys(r).sort()).toEqual(["floor", "id", "level", "method", "name", "notes", "sqft"]);
  });

  it("blanks a level or method off the lists, and drops a bad square footage", () => {
    const [r] = cleanRooms([room({ level: "Attic", method: "Guess", sqft: "about 100" })]);
    expect(r.level).toBe("");
    expect(r.method).toBe("");
    expect(r.sqft).toBeNull();
  });

  it("trims and caps text, and keeps line breaks in notes only", () => {
    const [r] = cleanRooms([room({ name: `  Den \n ${"x".repeat(200)}`, notes: `line one\r\nline two${"y".repeat(800)}` })]);
    expect(r.name.startsWith("Den x")).toBe(true);
    expect(r.name.length).toBe(80);
    expect(r.notes.startsWith("line one\nline two")).toBe(true);
    expect(r.notes.length).toBe(600);
  });

  it("leaves out rooms with nothing in them", () => {
    const empty = { id: "r2", name: " ", level: "", method: "", sqft: "", floor: "", notes: "" };
    expect(cleanRooms([room(), empty]).map((r) => r.id)).toEqual(["r1"]);
  });

  it("keeps a room with only a square footage", () => {
    expect(cleanRooms([{ id: "r3", sqft: "80" }])).toEqual([{ id: "r3", name: "", level: "", method: "", sqft: 80, floor: "", notes: "" }]);
  });

  it("gives a room with a missing, odd or repeated id a fresh one", () => {
    const ids = cleanRooms([room({ id: "r1" }), room({ id: "r1" }), room({ id: "<script>" }), room({ id: undefined })]).map((r) => r.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids[0]).toBe("r1");
    for (const id of ids) expect(id).toMatch(/^r[a-z0-9]{1,20}$/);
  });

  it("ignores anything that isn't a list of rooms, and stops at the cap", () => {
    expect(cleanRooms("rooms")).toEqual([]);
    expect(cleanRooms({ rooms: [room()] })).toEqual([]);
    expect(cleanRooms([null, 3, "x", room()])).toHaveLength(1);
    const many = Array.from({ length: MAX_ROOMS + 5 }, (_, i) => room({ id: `r${i + 1}` }));
    expect(cleanRooms(many)).toHaveLength(MAX_ROOMS);
  });
});

describe("saving and reading back", () => {
  it("round-trips through the field's text with who saved and when", () => {
    const text = serializeRooms(cleanRooms([room()]), "pm@example.com", "2026-01-05T15:00:00.000Z");
    expect(parseRooms(text)).toEqual({ rooms: cleanRooms([room()]), by: "pm@example.com", at: "2026-01-05T15:00:00.000Z", unreadable: false });
  });

  it("writes an empty field when every room was removed", () => {
    expect(serializeRooms([], "pm@example.com", "2026-01-05T15:00:00.000Z")).toBe("");
    expect(parseRooms("")).toEqual({ rooms: [], by: null, at: null, unreadable: false });
    expect(parseRooms("  \n")).toEqual({ rooms: [], by: null, at: null, unreadable: false });
  });

  it("flags text the app didn't write instead of guessing at it", () => {
    expect(parseRooms("kitchen 120 sf").unreadable).toBe(true);
    expect(parseRooms('{"something":"else"}').unreadable).toBe(true);
    expect(parseRooms("[1,2]").unreadable).toBe(true);
  });

  it("cleans rooms read back too", () => {
    const text = JSON.stringify({ v: 1, rooms: [room({ level: "Roof", sqft: "lots" })], by: 5, at: null });
    const log = parseRooms(text);
    expect(log.rooms[0].level).toBe("");
    expect(log.rooms[0].sqft).toBeNull();
    expect(log.by).toBeNull();
  });

  it("reads the stored value exactly, so the save's comparison is exact", () => {
    expect(roomsRaw(" a ")).toBe(" a ");
    expect(roomsRaw(undefined)).toBe("");
    expect(roomsRaw(null)).toBe("");
    expect(roomsRaw(4)).toBe("");
  });
});

describe("roomTotals", () => {
  it("adds up the square feet measured, for display only", () => {
    const rooms = cleanRooms([room(), room({ id: "r2", sqft: "100.25" }), room({ id: "r3", sqft: "" })]);
    expect(roomTotals(rooms)).toEqual({ count: 3, sqft: 215.3 });
    expect(roomTotals([])).toEqual({ count: 0, sqft: 0 });
  });
});
