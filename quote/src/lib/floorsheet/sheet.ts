/**
 * The Flooring Site Sheet (Albert, 2026-11-03; quote/sheets/flooring-site-sheet-v1.pdf): one page the PM fills
 * on site, on top of the Stair Site Sheet. Its codes (R0–R12, W1–W5, N2) are printed on the paper, so the shape
 * here follows the sheet box for box. Pure, no I/O: cleanFloorSheet() is the only way anything (the model's
 * answer, the browser's edits) becomes a FloorSheet, and it never invents a value: what it can't read is null
 * or false. Tested in tests/floorsheet.test.ts.
 */

export const MAX_ROOMS = 12;
export const LEVEL_CODES = ["B", "M", "U"] as const;
export type LevelCode = (typeof LEVEL_CODES)[number];
export const MEASURED_WITH = ["Laser", "Moasure", "Tape"] as const;

/** "Floor there now": what a ticked Remove takes out. */
export const NOW = ["carpet", "lamvin", "wood", "tilePly", "tileConc"] as const;
export type NowFloor = (typeof NOW)[number];
export const NOW_NAME: Record<NowFloor, string> = { carpet: "Carpet", lamvin: "Laminate / vinyl", wood: "Wood", tilePly: "Tile on plywood", tileConc: "Tile on concrete" };

/** W1 New floor: one tick names the material, and with it the install. */
export const FLOORS = ["vinylClick", "wpLaminate", "engClick", "eng34", "solid", "tile", "hbVinyl", "hbEng", "sand", "buff"] as const;
export type FloorKind = (typeof FLOORS)[number];
export const FLOOR_NAME: Record<FloorKind, string> = {
  vinylClick: "Vinyl click",
  wpLaminate: "Waterproof laminate",
  engClick: "Engineered click",
  eng34: 'Engineered ¾"',
  solid: "Solid hardwood",
  tile: "Porcelain tile",
  hbVinyl: "Herringbone vinyl",
  hbEng: "Herringbone engineered",
  sand: "Sand & stain existing",
  buff: "Buff & polish only",
};
/** The two floors whose install is chosen by the Nail down / Nail + glue tick. */
export const NAILED: readonly FloorKind[] = ["eng34", "solid"];
/** Refinishing the floor that's there: nothing new goes down, so no material. */
export const NO_MATERIAL: readonly FloorKind[] = ["sand", "buff"];

export const NAILS = ["nail", "nailGlue"] as const;
export const MATERIALS = ["standard", "customer"] as const;
export const BASE_HOW = ["none", "reinstall", "new"] as const;
export const BASE_PIECE = ["baseboard", "shoe", "both"] as const;
export const SUBFLOOR_SHEETS = ["ply34", "osb34", "ply12", "osb12"] as const;
export const SUBFLOOR_NAME: Record<(typeof SUBFLOOR_SHEETS)[number], string> = { ply34: '¾" plywood', osb34: '¾" OSB', ply12: '½" plywood', osb12: '½" OSB' };
export const DISPOSALS = ["general", "condo", "large"] as const;
export const DISPOSAL_NAME: Record<(typeof DISPOSALS)[number], string> = { general: "General (bin / takeaway)", condo: "Condo / apartment", large: "Large (2 bins)" };

/** One row of box R. `floors` is the New floor column: [] = blank, which means every floor written in W. */
export type FloorRoom = {
  name: string | null;
  level: LevelCode | null;
  sqft: number | null;
  linearFt: number | null;
  now: NowFloor | null;
  remove: boolean;
  floors: (1 | 2)[];
};

/** One of W's two columns: Floor 1, Floor 2. */
export type FloorWant = {
  /** W1 */ floor: FloorKind | null;
  /** W1, nailed wood only */ nail: (typeof NAILS)[number] | null;
  /** W2: null = blank, which means standard */ material: (typeof MATERIALS)[number] | null;
  /** W2: a SKU written on site */ sku: string | null;
};

export type FloorSheet = {
  quoteNumber: string | null;
  customer: string | null;
  date: string | null;
  pm: string | null;
  /** R0 */ measuredWith: (typeof MEASURED_WITH)[number] | null;
  /** R1–R12, only the rows with something written */ rooms: FloorRoom[];
  /** W1–W2, Floor 1 and Floor 2 */ want: [FloorWant, FloorWant];
  /** W3 */ baseboards: { how: (typeof BASE_HOW)[number] | null; piece: (typeof BASE_PIECE)[number] | null };
  /** W4: sqft null = all rooms */ subfloor: { screw: boolean; sheet: (typeof SUBFLOOR_SHEETS)[number] | null; sqft: number | null };
  /** W5: null = blank, the customer disposes */ disposal: (typeof DISPOSALS)[number] | null;
  /** N2 */ notes: string | null;
  /** Codes Claude wasn't sure of, like "R3" or "W2". */
  unclear: string[];
};

export const emptyWant = (): FloorWant => ({ floor: null, nail: null, material: null, sku: null });
export const emptyFloorSheet = (): FloorSheet => ({
  quoteNumber: null,
  customer: null,
  date: null,
  pm: null,
  measuredWith: null,
  rooms: [],
  want: [emptyWant(), emptyWant()],
  baseboards: { how: null, piece: null },
  subfloor: { screw: false, sheet: null, sqft: null },
  disposal: null,
  notes: null,
  unclear: [],
});

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};
const pick = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null);
/** A measurement: a number, or digits with an optional decimal point. Never negative, never absurd. */
export function measure(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*(\d+\.?\d*|\.\d+)\s*$/.test(v) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n >= 100000) return null;
  return Math.round(n * 100) / 100;
}

const SKU = /^[A-Za-z0-9][A-Za-z0-9 ._\-/]{0,39}$/;

function room(v: unknown): FloorRoom {
  const o = obj(v);
  const floors = (Array.isArray(o.floors) ? o.floors : []).map(Number).filter((n): n is 1 | 2 => n === 1 || n === 2);
  return {
    name: text(o.name, 80),
    level: pick(o.level, LEVEL_CODES),
    sqft: measure(o.sqft),
    linearFt: measure(o.linearFt),
    now: pick(o.now, NOW),
    remove: o.remove === true,
    floors: [...new Set(floors)].sort() as (1 | 2)[],
  };
}
const blankRoom = (r: FloorRoom) => !r.name && !r.level && r.sqft === null && r.linearFt === null && !r.now && !r.remove && r.floors.length === 0;

function want(v: unknown): FloorWant {
  const o = obj(v);
  const sku = text(o.sku, 40);
  return { floor: pick(o.floor, FLOORS), nail: pick(o.nail, NAILS), material: pick(o.material, MATERIALS), sku: sku && SKU.test(sku) ? sku : null };
}

export function cleanFloorSheet(v: unknown): FloorSheet {
  const o = obj(v);
  const w = Array.isArray(o.want) ? o.want : [];
  const base = obj(o.baseboards);
  const sub = obj(o.subfloor);
  return {
    quoteNumber: text(o.quoteNumber, 12),
    customer: text(o.customer, 80),
    date: text(o.date, 20),
    pm: text(o.pm, 40),
    measuredWith: pick(o.measuredWith, MEASURED_WITH),
    rooms: (Array.isArray(o.rooms) ? o.rooms : []).slice(0, MAX_ROOMS).map(room).filter((r) => !blankRoom(r)),
    want: [want(w[0]), want(w[1])],
    baseboards: { how: pick(base.how, BASE_HOW), piece: pick(base.piece, BASE_PIECE) },
    subfloor: { screw: sub.screw === true, sheet: pick(sub.sheet, SUBFLOOR_SHEETS), sqft: measure(sub.sqft) },
    disposal: pick(o.disposal, DISPOSALS),
    notes: typeof o.notes === "string" && o.notes.trim() ? o.notes.replace(/\r\n?/g, "\n").trim().slice(0, 1000) : null,
    unclear: [...new Set((Array.isArray(o.unclear) ? o.unclear : []).filter((c): c is string => typeof c === "string" && /^[A-Z]\d{1,2}$/.test(c.trim())).map((c) => c.trim()))].slice(0, 40),
  };
}

/** What is kept on the quote (Quotes → Flooring Sheet): the sheet, who read or checked it and when, and the CompanyCam photos it came from. */
export type StoredFloorSheet = { sheet: FloorSheet; by: string; at: string; checked: boolean; photoIds: string[] };

export const floorSheetRaw = (v: unknown): string => (typeof v === "string" ? v : "");

export function parseFloorStored(raw: string): StoredFloorSheet | null {
  if (!raw.trim()) return null;
  try {
    const o = obj(JSON.parse(raw));
    if (o.v !== 1) return null;
    const ids = (Array.isArray(o.photoIds) ? o.photoIds : []).filter((x): x is string => typeof x === "string" && /^\d{1,15}$/.test(x)).slice(0, 4);
    return { sheet: cleanFloorSheet(o.sheet), by: text(o.by, 120) ?? "", at: text(o.at, 40) ?? "", checked: o.checked === true, photoIds: ids };
  } catch {
    return null;
  }
}

export function serializeFloorStored(s: StoredFloorSheet): string {
  return JSON.stringify({ v: 1, sheet: cleanFloorSheet(s.sheet), by: s.by, at: s.at, checked: s.checked, photoIds: s.photoIds });
}
