import type { QuickChoice, QuickGroup, QuickRow } from "@/lib/quick/plan";
import type { Room } from "@/lib/rooms/log";
import { DISPOSAL_NAME, FLOOR_NAME, NAILED, NO_MATERIAL, NOW_NAME, SUBFLOOR_NAME, type FloorKind, type FloorRoom, type FloorSheet, type NowFloor } from "./sheet";

/**
 * A checked Flooring Site Sheet as the quick form's rows (Albert, 2026-11-03: "build the sheets from companycam
 * into rooms and flooring lines"). Pure, no I/O. Each option is a QuickWork, so the server prices it exactly as it
 * prices a preliminary (buildQuickOptions() in src/lib/quotes/start.ts): same Quick Quote Choices, same Rate Card
 * rows, same standard products. Tested in tests/floorsheet.test.ts.
 *
 * The rules, from the sheet and the 2026-11-03 decision (vault 05_decisions/2026-11-03-measured-quote-from-site-sheets):
 * - Two floors at most, set room by room. A room's New floor left blank gets every floor written in W.
 * - A room with both floors (ticked both, or blank with two floors written) is a choice: the quote gets two
 *   options, one with Floor 1 there and one with Floor 2. Without such a room it is one option holding both floors.
 * - W1 names the material and so the install; engineered ¾" and solid take Nail down / Nail + glue.
 * - W2 blank or Standard = the choice's standard product; Customer supplies = no material line; a SKU = that
 *   catalogue product, and a SKU not in the catalogue is left for staff, never swapped for the standard one.
 * - Remove and Disposal left blank mean the customer does it: no line.
 * - Anything the sheet leaves unsaid is never guessed; a default the app takes is said in `notes`.
 */

/**
 * The Quick Quote Choices each box becomes: the record id first (a rename can't unlink it, the lesson of
 * 2026-10-31 on the stair sheet), then the choice's name.
 */
type Ref = { id: string; label: string };
const C = {
  remove: {
    carpet: { id: "rechCjAFWS1Ry9AYk", label: "Carpet / Laminate / Vinyl" },
    lamvin: { id: "rechCjAFWS1Ry9AYk", label: "Carpet / Laminate / Vinyl" },
    wood: { id: "rec9zSI3aeEPmDYLU", label: "Hardwood / Parquet" },
    tilePly: { id: "recmCLixy2rVZpgqg", label: "Tiles on Plywood" },
    tileConc: { id: "recaX1jNl7oOSWGIs", label: "Tiles on Concrete" },
  } satisfies Record<NowFloor, Ref>,
  disposal: {
    general: { id: "recTA6W4SvkrjWsDo", label: "General Disposal (Bin, Takeaway, etc.)" },
    condo: { id: "recVUlyRVQkKQyca0", label: "Disposal (Condo/Apartment)" },
    large: { id: "recdUYrhAPlaS0r8C", label: "Large Disposal (Bin x 2)" },
  },
  subfloor: {
    screw: { id: "recqJBSxm46RSRAIc", label: "Full Screw-down" },
    ply34: { id: "recpU2L9rohM0F8ug", label: '3/4" Plywood' },
    osb34: { id: "recUh18G5aP2D42tR", label: '3/4" OSB' },
    ply12: { id: "recPA9BHmjV50jgCW", label: '1/2" Plywood' },
    osb12: { id: "recPuUiqqIboKEJNw", label: '1/2" OSB' },
  },
  install: {
    click: { id: "recmwVhyrxhuyZUa1", label: "Laminate | Vinyl | Eng Click" },
    hbVinyl: { id: "recBE2cHFL0ngL9oQ", label: "Herringbone (Vinyl)" },
    hbEng: { id: "recELGNm4rIni3mpJ", label: "Herringbone (Eng)" },
    nail: { id: "recDZUCKLfDZh0SBF", label: "Hardwood (Nail Down)" },
    nailGlue: { id: "rec8guBtkBFdvCjNp", label: "Hardwood (Nail + Glue Assist)" },
    tile: { id: "recLvjGl6OlmK2eub", label: "Tiles" },
    sand: { id: "recGfOEAkweDrFmbG", label: "Sand and Stain Existing Hardwood" },
    buff: { id: "recQAGXShfgRXLETG", label: "Refinish (Buff And Polish Only)" },
  },
  baseboards: {
    newBaseboard: { id: "recOjLJBdlnIMZmuh", label: "Baseboard (Mat + Labor)" },
    newShoe: { id: "recupCtYjGZ2ugYxG", label: "Shoemould (Mat + Labor)" },
    newBoth: { id: "recKvoypLPjjKxtbi", label: "Baseboard + Shoe (Mat + Labor)" },
    reinstallBaseboard: { id: "recq2MPZXQ6qkf4wD", label: "Baseboard (Labor)" },
    reinstallShoe: { id: "recqgCvyIbPpKE0Ud", label: "Shoemould (Labor)" },
    reinstallBoth: { id: "recOCIPInLjiq43PL", label: "Baseboard + Shoe (Labor)" },
  },
  material: {
    vinylClick: { id: "recwij8RSbK4WP2bK", label: "Laminate or Vinyl Click" },
    wpLaminate: { id: "recH0iMQfzZC4g8By", label: "Waterproof Laminate" },
    engClick: { id: "recsvImgYqb1IDpH4", label: "Engineered (Click)" },
    eng34: { id: "recgJaqaPxD5DdA7X", label: 'Engineered (3/4")' },
    solid: { id: "recpNTpthQSX5js0p", label: "Solid Hardwood" },
    tile: { id: "recG819bHlzv2CV7U", label: "Porcelain Tiles" },
    hbVinyl: { id: "recfMMPRYL7MUDSnV", label: "Herringbone (Vinyl)" },
    hbEng: { id: "recNXrLA3OpiV6BYX", label: "Herringbone (Eng)" },
  } satisfies Partial<Record<FloorKind, Ref>>,
};

const GROUP_OF: Record<keyof typeof C, QuickGroup> = { remove: "Remove", disposal: "Disposal", subfloor: "Subfloor prep", install: "Install", baseboards: "Baseboards", material: "Material" };

/**
 * Every choice the sheet can use, as if all were switched on: for the Site sheet tab's preview in the browser,
 * which has no Airtable. The server's own check (`floorPlan()` with the real quick form) decides what is priced.
 */
export function previewChoices(): Pick<QuickChoice, "id" | "label" | "group">[] {
  return (Object.keys(C) as (keyof typeof C)[]).flatMap((g) => Object.values(C[g] as Record<string, Ref>).map((r) => ({ id: r.id, label: r.label, group: GROUP_OF[g] })));
}

const INSTALL_OF: Record<Exclude<FloorKind, "eng34" | "solid">, Ref> = {
  vinylClick: C.install.click,
  wpLaminate: C.install.click,
  engClick: C.install.click,
  tile: C.install.tile,
  hbVinyl: C.install.hbVinyl,
  hbEng: C.install.hbEng,
  sand: C.install.sand,
  buff: C.install.buff,
};

export type FloorWork = { rows: QuickRow[]; description: string };
export type FloorPlan = { works: FloorWork[]; notes: string[] };

const r1 = (n: number) => Math.round(n * 100) / 100;
const roomName = (r: FloorRoom, i: number) => r.name ?? `R${i + 1}`;
const LEVEL_WORD = { B: "Basement", M: "Main", U: "Upper" } as const;

/** The SKUs written in W2, as the server looks them up in the catalogue. */
export function sheetSkus(sheet: FloorSheet): string[] {
  return [...new Set(sheet.want.flatMap((w) => (w.floor && w.material !== "customer" && w.sku ? [w.sku.toUpperCase()] : [])))];
}

/**
 * The options a sheet builds. `choices` is the quick form as it stands (active choices only); `skuProducts` maps
 * an upper-case SKU to its catalogue record id, for the SKUs found.
 */
export function floorPlan(sheet: FloorSheet, choices: Pick<QuickChoice, "id" | "label" | "group">[], skuProducts: Map<string, string> = new Map()): FloorPlan {
  const notes: string[] = [];
  const note = (s: string) => {
    if (!notes.includes(s)) notes.push(s);
  };
  const find = (ref: Ref, group: QuickGroup): string | null => {
    const c = choices.find((x) => x.id === ref.id) ?? choices.find((x) => x.group === group && x.label.trim().toLowerCase() === ref.label.toLowerCase());
    if (!c) note(`"${ref.label}" isn't switched on in Quick Quote Choices, so it has no line. Add it in the editor.`);
    return c?.id ?? null;
  };

  const written = ([1, 2] as const).filter((n) => sheet.want[n - 1].floor !== null);
  const rooms = sheet.rooms.map((r, i) => ({ r, i, name: roomName(r, i) }));
  for (const { r, name } of rooms) if (r.sqft === null) note(`${name} has no square feet, so it adds nothing.`);
  const totalSqft = r1(rooms.reduce((s, { r }) => s + (r.sqft ?? 0), 0));

  // Which floors each room can take: its ticks among the floors written, else every floor written.
  const fits = rooms.map(({ r, name }) => {
    const ticked = r.floors.filter((f) => written.includes(f));
    if (r.floors.some((f) => !written.includes(f))) note(`${name} is ticked for Floor ${r.floors.find((f) => !written.includes(f))}, which has nothing written in W1, so it takes ${written.length === 2 ? "both floors" : "Floor " + (written[0] ?? 1)}.`);
    return ticked.length ? ticked : [...written];
  });
  const choiceRooms = fits.some((f) => f.length === 2);
  const variants: (1 | 2 | null)[] = written.length === 2 && choiceRooms ? [1, 2] : [null];
  if (written.length === 0) note("No new floor is ticked in W1, so the options have no install or material.");

  const shared = sharedRows(sheet, rooms, totalSqft, find, note);
  const works = variants.map((variant): FloorWork => {
    const byFloor = new Map<1 | 2, { sqft: number; names: string[]; levels: Set<string> }>();
    rooms.forEach(({ r, name }, k) => {
      const f = fits[k].length === 1 ? fits[k][0] : (variant ?? fits[k][0]);
      if (f === undefined) return;
      const e = byFloor.get(f) ?? { sqft: 0, names: [], levels: new Set<string>() };
      e.sqft = r1(e.sqft + (r.sqft ?? 0));
      e.names.push(name);
      if (r.level) e.levels.add(LEVEL_WORD[r.level]);
      byFloor.set(f, e);
    });
    const rows: QuickRow[] = [];
    const parts: string[] = [];
    for (const f of [1, 2] as const) {
      const e = byFloor.get(f);
      const w = sheet.want[f - 1];
      if (!e || !w.floor || e.sqft <= 0) continue;
      const kind = w.floor;
      parts.push(`${FLOOR_NAME[kind]}: ${e.names.join(", ")} (${e.sqft} sq ft)`);
      // Install
      let install: Ref;
      if (NAILED.includes(kind)) {
        if (!w.nail) note(`Floor ${f} (${FLOOR_NAME[kind]}) has no Nail down / Nail + glue ticked, so it's priced as nail down.`);
        install = w.nail === "nailGlue" ? C.install.nailGlue : C.install.nail;
      } else {
        install = INSTALL_OF[kind as keyof typeof INSTALL_OF];
      }
      const installId = find(install, "Install");
      if (installId) add(rows, { choiceId: installId, amount: e.sqft, productId: null });
      // Material
      if (NO_MATERIAL.includes(kind)) continue;
      if (w.material === "customer") {
        note(`Floor ${f}: the customer supplies the ${FLOOR_NAME[kind].toLowerCase()}, so there's no material line.`);
        continue;
      }
      const matRef = C.material[kind as keyof typeof C.material];
      const matId = find(matRef, "Material");
      if (!matId) continue;
      if (w.sku) {
        const productId = skuProducts.get(w.sku.toUpperCase());
        if (!productId) {
          note(`Floor ${f}: SKU ${w.sku} isn't in the catalogue, so its material line is left out. Add the product in the editor.`);
          continue;
        }
        rows.push({ choiceId: matId, amount: e.sqft, productId });
      } else {
        rows.push({ choiceId: matId, amount: e.sqft, productId: null });
      }
    }
    rows.push(...shared);
    return { rows, description: parts.join(" · ") };
  });
  return { works: works.filter((w) => w.rows.length > 0), notes };
}

/** Two rows for one choice become one, its amounts added (two floors on the click install, say). */
function add(rows: QuickRow[], row: QuickRow) {
  const same = rows.find((x) => x.choiceId === row.choiceId && x.productId === row.productId);
  if (same) same.amount = r1((same.amount ?? 0) + (row.amount ?? 0));
  else rows.push(row);
}

/** Removal, subfloor, baseboards and disposal: the same on every option, whichever floor goes down. */
function sharedRows(
  sheet: FloorSheet,
  rooms: { r: FloorRoom; name: string }[],
  totalSqft: number,
  find: (ref: Ref, group: QuickGroup) => string | null,
  note: (s: string) => void,
): QuickRow[] {
  const rows: QuickRow[] = [];
  // Remove: ticked rooms, by what is there now.
  const byNow = new Map<string, number>();
  for (const { r, name } of rooms) {
    if (!r.remove) continue;
    if (!r.now) {
      note(`${name} is ticked Remove with nothing ticked under Floor there now, so it has no removal line.`);
      continue;
    }
    const id = find(C.remove[r.now], "Remove");
    if (id) byNow.set(id, r1((byNow.get(id) ?? 0) + (r.sqft ?? 0)));
  }
  for (const [choiceId, amount] of byNow) if (amount > 0) rows.push({ choiceId, amount, productId: null });

  // Subfloor: the sq ft written, else every room.
  const subSqft = sheet.subfloor.sqft ?? totalSqft;
  if (sheet.subfloor.screw) {
    const id = find(C.subfloor.screw, "Subfloor prep");
    if (id && subSqft > 0) rows.push({ choiceId: id, amount: subSqft, productId: null });
  }
  if (sheet.subfloor.sheet) {
    const id = find(C.subfloor[sheet.subfloor.sheet], "Subfloor prep");
    if (id && subSqft > 0) rows.push({ choiceId: id, amount: subSqft, productId: null });
    if (!sheet.subfloor.sqft) note(`New subfloor (${SUBFLOOR_NAME[sheet.subfloor.sheet]}) has no sq ft written, so it covers every room (${subSqft} sq ft).`);
  }

  // Baseboards: every room's linear feet.
  const { how, piece } = sheet.baseboards;
  if (how === "reinstall" || how === "new" || (how === null && piece !== null)) {
    if (how === null) note("Baseboards has a piece ticked but not None / Reinstall / New, so it's priced as new.");
    const isNew = how !== "reinstall";
    const p = piece ?? "baseboard";
    const ref = isNew ? { baseboard: C.baseboards.newBaseboard, shoe: C.baseboards.newShoe, both: C.baseboards.newBoth }[p] : { baseboard: C.baseboards.reinstallBaseboard, shoe: C.baseboards.reinstallShoe, both: C.baseboards.reinstallBoth }[p];
    let feet = r1(rooms.reduce((s, { r }) => s + (r.linearFt ?? 0), 0));
    if (feet <= 0 && totalSqft > 0) {
      feet = Math.round(totalSqft / 3);
      note(`No linear feet are written, so baseboards use a third of the square feet (${feet} ft), as the quick form does.`);
    }
    const id = find(ref, "Baseboards");
    if (id && feet > 0) rows.push({ choiceId: id, amount: feet, productId: null });
  }

  // Disposal: blank = the customer takes it away.
  if (sheet.disposal) {
    const id = find(C.disposal[sheet.disposal], "Disposal");
    if (id) rows.push({ choiceId: id, amount: null, productId: null });
  } else if (rooms.some(({ r }) => r.remove)) {
    note(`Disposal is blank, so there's no disposal line: the customer takes it away. (If not, add ${DISPOSAL_NAME.general}.)`);
  }
  return rows;
}

/** The sheet's rooms as the Rooms tab keeps them (Quotes → Rooms), one for one. Copying them replaces the Rooms tab. */
export function roomsFromSheet(sheet: FloorSheet): Room[] {
  return sheet.rooms.map((r, i) => ({
    id: `r${i + 1}`,
    name: r.name ?? `Room ${i + 1}`,
    level: r.level ? LEVEL_WORD[r.level] : "",
    method: sheet.measuredWith ?? "",
    sqft: r.sqft,
    linearFt: r.linearFt,
    floor: r.now ? NOW_NAME[r.now] : "",
    notes: [r.remove ? "Remove" : "", r.floors.length === 1 ? `New floor ${r.floors[0]}` : r.floors.length === 2 ? "New floor 1 or 2" : ""].filter(Boolean).join(" · "),
  }));
}
