import { describe, expect, it } from "vitest";
import { floorPlan, previewChoices, roomsFromSheet, sheetSkus } from "../src/lib/floorsheet/plan";
import { cleanFloorSheet, parseFloorStored, serializeFloorStored, type FloorSheet } from "../src/lib/floorsheet/sheet";

// INVENTED rooms and SKUs only: this repo is public.

const ALL = previewChoices();
const id = (label: string) => ALL.find((c) => c.label === label)!.id;
const CLICK = id("Laminate | Vinyl | Eng Click");
const VINYL = id("Laminate or Vinyl Click");
const ENG34 = id('Engineered (3/4")');

function sheet(over: Record<string, unknown> = {}): FloorSheet {
  return cleanFloorSheet({
    rooms: [
      { name: "Bedroom", level: "U", sqft: 150, linearFt: 50, now: "carpet", remove: true },
      { name: "Hall", level: "U", sqft: 50, linearFt: 30, now: "lamvin", remove: true },
      { name: "Living", level: "M", sqft: 300, linearFt: 70, now: "tilePly", remove: true },
    ],
    want: [{ floor: "vinylClick" }, {}],
    ...over,
  });
}

describe("cleaning a flooring sheet", () => {
  it("keeps what was read and never invents a value", () => {
    const s = cleanFloorSheet({
      measuredWith: "Laser",
      rooms: [{ name: " Kitchen ", level: "M", sqft: "120.5", linearFt: -3, now: "marble", remove: "yes", floors: [2, 1, 3, 2] }, { name: "", sqft: null }],
      want: [{ floor: "solid", nail: "nailGlue", material: "standard", sku: "AB-123" }, { floor: "rug", sku: "bad'sku" }],
      disposal: "dumpster",
      unclear: ["R1", "nope", "W2", "R1"],
    });
    expect(s.rooms).toEqual([{ name: "Kitchen", level: "M", sqft: 120.5, linearFt: null, now: null, remove: false, floors: [1, 2] }]);
    expect(s.want[0]).toEqual({ floor: "solid", nail: "nailGlue", material: "standard", sku: "AB-123" });
    expect(s.want[1]).toEqual({ floor: null, nail: null, material: null, sku: null });
    expect(s.disposal).toBeNull();
    expect(s.unclear).toEqual(["R1", "W2"]);
  });

  it("stores and reads back with the CompanyCam photos it came from", () => {
    const cam = [{ id: "1001", pageUrl: "https://app.companycam.com/photos/1001", at: "2026-11-03T14:05:00.000Z" }, { id: "1002", pageUrl: "https://evil.example.com/photos/1002", at: null }];
    const raw = serializeFloorStored({ sheet: sheet(), by: "pm@example.com", at: "2026-11-03T15:00:00.000Z", checked: false, cam, files: ["flooring-sheet-2026-11-03-15-00-00-1.jpg"] });
    const back = parseFloorStored(raw)!;
    expect(back.files).toEqual(["flooring-sheet-2026-11-03-15-00-00-1.jpg"]);
    expect(back.sheet).toEqual(sheet());
    // Only a CompanyCam photo page is kept as a link.
    expect(back.cam).toEqual([cam[0], { id: "1002", pageUrl: null, at: null }]);
    expect(parseFloorStored("not json")).toBeNull();
    expect(parseFloorStored("")).toBeNull();
  });
});

describe("what a flooring sheet builds", () => {
  it("one floor everywhere: one option, the rooms added up, the standard material", () => {
    const p = floorPlan(sheet(), ALL);
    expect(p.works).toHaveLength(1);
    const rows = p.works[0].rows;
    expect(rows.find((r) => r.choiceId === CLICK)).toEqual({ choiceId: CLICK, amount: 500, productId: null });
    expect(rows.find((r) => r.choiceId === VINYL)).toEqual({ choiceId: VINYL, amount: 500, productId: null });
    expect(p.works[0].description).toBe("Vinyl click: Bedroom, Hall, Living (500 sq ft)");
  });

  it("removal by what is there now: carpet and laminate share a line, tile on plywood is its own", () => {
    const rows = floorPlan(sheet(), ALL).works[0].rows;
    expect(rows.find((r) => r.choiceId === id("Carpet / Laminate / Vinyl"))?.amount).toBe(200);
    expect(rows.find((r) => r.choiceId === id("Tiles on Plywood"))?.amount).toBe(300);
    expect(rows.some((r) => r.choiceId === id("Tiles on Concrete"))).toBe(false);
  });

  it("two floors and no ticks: two options to compare, every room in each", () => {
    const p = floorPlan(sheet({ want: [{ floor: "vinylClick" }, { floor: "solid", nail: "nail" }] }), ALL);
    expect(p.works).toHaveLength(2);
    expect(p.works[0].rows.find((r) => r.choiceId === CLICK)?.amount).toBe(500);
    expect(p.works[1].rows.find((r) => r.choiceId === id("Hardwood (Nail Down)"))?.amount).toBe(500);
    expect(p.works[1].rows.some((r) => r.choiceId === CLICK)).toBe(false);
  });

  it("different levels ticked 1 and 2: one option holding both floors", () => {
    const s = sheet({
      rooms: [
        { name: "Bedroom", level: "U", sqft: 150, floors: [1] },
        { name: "Living", level: "M", sqft: 300, floors: [2] },
      ],
      want: [{ floor: "vinylClick" }, { floor: "eng34", nail: "nailGlue" }],
    });
    const p = floorPlan(s, ALL);
    expect(p.works).toHaveLength(1);
    const rows = p.works[0].rows;
    expect(rows.find((r) => r.choiceId === CLICK)?.amount).toBe(150);
    expect(rows.find((r) => r.choiceId === id("Hardwood (Nail + Glue Assist)"))?.amount).toBe(300);
    expect(rows.find((r) => r.choiceId === ENG34)?.amount).toBe(300);
    expect(p.works[0].description).toBe("Vinyl click: Bedroom (150 sq ft) · Engineered ¾\": Living (300 sq ft)");
  });

  it("upstairs set, main a choice: all of Floor 1, or Floor 2 on the main floor", () => {
    const s = sheet({
      rooms: [
        { name: "Bedroom", level: "U", sqft: 150, floors: [1] },
        { name: "Living", level: "M", sqft: 300 },
      ],
      want: [{ floor: "vinylClick" }, { floor: "engClick" }],
    });
    const p = floorPlan(s, ALL);
    expect(p.works).toHaveLength(2);
    expect(p.works[0].rows.find((r) => r.choiceId === CLICK)?.amount).toBe(450);
    expect(p.works[0].rows.find((r) => r.choiceId === VINYL)?.amount).toBe(450);
    // Option 2: both floors use the click install, so the install is one line of 450; the materials stay apart.
    expect(p.works[1].rows.filter((r) => r.choiceId === CLICK)).toEqual([{ choiceId: CLICK, amount: 450, productId: null }]);
    expect(p.works[1].rows.find((r) => r.choiceId === VINYL)?.amount).toBe(150);
    expect(p.works[1].rows.find((r) => r.choiceId === id("Engineered (Click)"))?.amount).toBe(300);
  });

  it("material: customer supplies leaves it out; a SKU found is used; a SKU not found is never swapped", () => {
    const own = floorPlan(sheet({ want: [{ floor: "vinylClick", material: "customer" }, {}] }), ALL);
    expect(own.works[0].rows.some((r) => r.choiceId === VINYL)).toBe(false);
    expect(own.notes.some((n) => n.includes("customer supplies"))).toBe(true);

    const withSku = sheet({ want: [{ floor: "vinylClick", sku: "lv-777" }, {}] });
    expect(sheetSkus(withSku)).toEqual(["LV-777"]);
    const found = floorPlan(withSku, ALL, new Map([["LV-777", "recProductAAAAAAAA"]]));
    expect(found.works[0].rows.find((r) => r.choiceId === VINYL)).toEqual({ choiceId: VINYL, amount: 500, productId: "recProductAAAAAAAA" });
    const missing = floorPlan(withSku, ALL);
    expect(missing.works[0].rows.some((r) => r.choiceId === VINYL)).toBe(false);
    expect(missing.notes.some((n) => n.includes("lv-777 isn't in the catalogue"))).toBe(true);
  });

  it("nailed wood with no method ticked is priced as nail down, and says so", () => {
    const p = floorPlan(sheet({ want: [{ floor: "solid" }, {}] }), ALL);
    expect(p.works[0].rows.find((r) => r.choiceId === id("Hardwood (Nail Down)"))?.amount).toBe(500);
    expect(p.notes.some((n) => n.includes("priced as nail down"))).toBe(true);
  });

  it("refinishing has no material", () => {
    const rows = floorPlan(sheet({ want: [{ floor: "sand" }, {}] }), ALL).works[0].rows;
    expect(rows.find((r) => r.choiceId === id("Sand and Stain Existing Hardwood"))?.amount).toBe(500);
    expect(rows.some((r) => ALL.find((c) => c.id === r.choiceId)?.group === "Material")).toBe(false);
  });

  it("disposal blank means the customer takes it away; ticked is one flat line", () => {
    const blank = floorPlan(sheet(), ALL);
    expect(blank.works[0].rows.some((r) => ALL.find((c) => c.id === r.choiceId)?.group === "Disposal")).toBe(false);
    expect(blank.notes.some((n) => n.includes("Disposal is blank"))).toBe(true);
    const general = floorPlan(sheet({ disposal: "general" }), ALL);
    expect(general.works[0].rows).toContainEqual({ choiceId: id("General Disposal (Bin, Takeaway, etc.)"), amount: null, productId: null });
  });

  it("baseboards from the linear feet, else a third of the square feet", () => {
    const fromFeet = floorPlan(sheet({ baseboards: { how: "new", piece: "both" } }), ALL).works[0].rows;
    expect(fromFeet).toContainEqual({ choiceId: id("Baseboard + Shoe (Mat + Labor)"), amount: 150, productId: null });
    const noFeet = floorPlan(sheet({ rooms: [{ name: "Living", sqft: 300 }], baseboards: { how: "reinstall", piece: "shoe" } }), ALL);
    expect(noFeet.works[0].rows).toContainEqual({ choiceId: id("Shoemould (Labor)"), amount: 100, productId: null });
    expect(noFeet.notes.some((n) => n.includes("a third of the square feet"))).toBe(true);
    const none = floorPlan(sheet({ baseboards: { how: "none", piece: "baseboard" } }), ALL).works[0].rows;
    expect(none.some((r) => ALL.find((c) => c.id === r.choiceId)?.group === "Baseboards")).toBe(false);
  });

  it("subfloor covers every room unless its sq ft is written", () => {
    const rows = floorPlan(sheet({ subfloor: { screw: true, sheet: "ply34", sqft: null } }), ALL).works[0].rows;
    expect(rows).toContainEqual({ choiceId: id("Full Screw-down"), amount: 500, productId: null });
    expect(rows).toContainEqual({ choiceId: id('3/4" Plywood'), amount: 500, productId: null });
    const part = floorPlan(sheet({ subfloor: { screw: true, sheet: null, sqft: 120 } }), ALL).works[0].rows;
    expect(part).toContainEqual({ choiceId: id("Full Screw-down"), amount: 120, productId: null });
  });

  it("a choice switched off in Quick Quote Choices has no line, and says so", () => {
    const off = ALL.filter((c) => c.label !== "Herringbone (Eng)" || c.group !== "Install");
    const p = floorPlan(sheet({ want: [{ floor: "hbEng" }, {}] }), off);
    expect(p.works[0].rows.some((r) => r.choiceId === id("Herringbone (Eng)") && ALL.find((c) => c.id === r.choiceId)?.group === "Install")).toBe(false);
    expect(p.works[0].rows.find((r) => r.choiceId === ALL.find((c) => c.group === "Material" && c.label === "Herringbone (Eng)")!.id)?.amount).toBe(500);
    expect(p.notes.some((n) => n.includes('"Herringbone (Eng)" isn\'t switched on'))).toBe(true);
  });

  it("finds a choice by name when its record id changed", () => {
    const renamed = ALL.map((c) => (c.id === CLICK ? { ...c, id: "recNewIdAAAAAAAAA" } : c));
    expect(floorPlan(sheet(), renamed).works[0].rows.find((r) => r.choiceId === "recNewIdAAAAAAAAA")?.amount).toBe(500);
  });
});

describe("the sheet's rooms on the Rooms tab", () => {
  it("one room for one row, in the Rooms tab's words", () => {
    const rooms = roomsFromSheet(sheet({ measuredWith: "Moasure", rooms: [{ name: "Living", level: "M", sqft: 300, linearFt: 70, now: "tileConc", remove: true, floors: [2] }] }));
    expect(rooms).toEqual([{ id: "r1", name: "Living", level: "Main", method: "Moasure", sqft: 300, linearFt: 70, floor: "Tile on concrete", notes: "Remove · New floor 2" }]);
  });
});
