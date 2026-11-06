import { describe, expect, it } from "vitest";
import { buildCatalogue } from "../src/lib/editor/model";
import { familiesFor, familyGlue, familyLines, familyMethods, familyRows, methodChoices, switchMethod } from "../src/lib/editor/waterfall";
import type { QuickChoice, QuickPart } from "../src/lib/quick/plan";
import type { MaterialRow, RateRow } from "../src/lib/quotes/types";

// INVENTED rates, costs, ids and names only: this repo is public.
const R = (o: Partial<RateRow> & { id: string; spec: string }): RateRow => ({ labourType: "Install", contractor: "Crew A", uom: "sqft", rate: 2.3, cost: 1.6, minCharge: null, defaultWaste: null, ...o });
const rates: RateRow[] = [
  R({ id: "recRateTGA0000000", spec: "T&G" }),
  R({ id: "recRateTGB0000000", spec: "T&G", contractor: "Crew B", cost: 1.5 }),
  R({ id: "recRateFullA00000", spec: "FULL GLUE", materialGroup: "Glue - Full Spread", defaultMaterialId: "recGlueA000000000" }),
  R({ id: "recRateClickA0000", spec: "CLICK", rate: 1.9, cost: 1.2 }),
  R({ id: "recRateNailFullA0", spec: "FULL GLUE NAIL", rate: 2.99, cost: 2.3, materialGroup: "Glue - Full Spread", defaultMaterialId: "recGlueA000000000" }),
];
const mats: MaterialRow[] = [
  { id: "recGlueA000000000", name: "Glue A", group: "Glue - Full Spread", cost: 1.5, price: 1.75 },
  { id: "recGlueB000000000", name: "Glue B", group: "Glue - Full Spread", cost: 0.6, price: 0.8 },
  { id: "recGlueClient0000", name: "Provided by Client", group: "Glue - Full Spread", cost: 0, price: 0 },
];
const cat = buildCatalogue(rates, [], mats);

const part = (recordId: string): QuickPart => ({ kind: "rate", recordId, labourType: "Install", spec: null, description: recordId, contractor: null, uom: "sqft", rate: 0, cost: null, minCharge: null });
const choice = (o: Partial<QuickChoice> & { id: string; label: string }): QuickChoice => ({ group: "Install", sort: 1, times: 1, parts: [], product: null, ...o });
const NAIL = choice({ id: "recSolNail0000000", label: "Solid Hardwood T&G (Nail Down)", sort: 3, path: ["Solid Hardwood T&G", "Nail down"], parts: [part("recRateTGA0000000")] });
const FULL = choice({ id: "recSolFull0000000", label: "Solid Hardwood T&G (Full Gluedown)", sort: 5, path: ["Solid Hardwood T&G", "Full gluedown"], parts: [part("recRateFullA00000")] });
const CLICK = choice({ id: "recClick000000000", label: "Laminate | Vinyl | Eng Click", sort: 1, parts: [part("recRateClickA0000")] });
const NAIL_FULL = choice({ id: "recSolNailFull000", label: "Solid Hardwood T&G (Nail + Full Gluedown)", sort: 6, path: ["Solid Hardwood T&G", "Nail + full gluedown"], parts: [part("recRateNailFullA0")] });
const choices = [CLICK, NAIL, FULL, NAIL_FULL];

describe("the waterfall in the editor's Add search (Albert, 2026-11-06)", () => {
  it("offers a family in its section only, matched on its name or its members'", () => {
    expect(familiesFor(choices, "Install").map((f) => [f.label, f.members.map((m) => m.id)])).toEqual([["Solid Hardwood T&G", [NAIL.id, FULL.id, NAIL_FULL.id]]]);
    expect(familiesFor(choices, "Install", "glue").map((f) => f.label)).toEqual(["Solid Hardwood T&G"]);
    expect(familiesFor(choices, "Install", "tile")).toEqual([]);
    expect(familiesFor(choices, "Removal")).toEqual([]);
    // A choice with no Path is never a family: it stays on the plain search.
    expect(familyRows(choices, "Install")).toEqual(new Set(["recRateTGA0000000", "recRateFullA00000", "recRateNailFullA0"]));
  });

  it("picks nothing for you: no method on, and Add waits for a method and then a glue", () => {
    const f = familiesFor(choices, "Install")[0];
    expect(familyMethods(f, null).map((o) => [o.label, o.on])).toEqual([["Nail down", false], ["Full gluedown", false], ["Nail + full gluedown", false]]);
    expect(familyMethods(f, FULL.id).map((o) => o.on)).toEqual([false, true, false]);
    expect(familyLines(undefined, null, cat, "Install", null, "Standard")).toEqual({ lines: [], missing: "Pick how it's installed." });
    expect(familyLines(FULL, null, cat, "Install", null, "Standard")).toEqual({ lines: [], missing: "Pick the type of glue." });
  });

  it("asks the glue only for a method that takes one, Provided by Client last", () => {
    expect(familyGlue(NAIL, cat, null)).toBeNull();
    const g = familyGlue(FULL, cat, null)!;
    expect(g.label).toBe("Type of glue");
    expect(g.choices.map((m) => m.name)).toEqual(["Glue B", "Glue A", "Provided by Client"]);
  });

  it("adds the editor's own lines: the picked glue on top of the labour, at quantity 1", () => {
    const glued = familyLines(FULL, "recGlueB000000000", cat, "Install", null, "Standard");
    expect(glued.missing).toBeNull();
    expect(glued.lines.map((l) => [l.sourceId, l.qty, l.unitPriceSnap, l.unitCostSnap, l.materialId, l.description])).toEqual([["recRateFullA00000", 1, 3.1, 2.2, "recGlueB000000000", "Install | FULL GLUE · Glue: Glue B"]]);
    // Provided by Client is the labour alone, and says so.
    const client = familyLines(FULL, "recGlueClient0000", cat, "Install", null, "Standard").lines[0];
    expect([client.unitPriceSnap, client.unitCostSnap, client.description]).toEqual([2.3, 1.6, "Install | FULL GLUE · Glue: Provided by Client"]);
    // Premium marks up the labour only.
    expect(familyLines(FULL, "recGlueB000000000", cat, "Install", null, "Premium").lines[0].unitPriceSnap).toBe(3.45);
  });

  it("goes to the option's crew when the crew has a rate for the work, else the choice's own row", () => {
    const nail = familyLines(NAIL, null, cat, "Install", "Crew B", "Standard").lines[0];
    expect([nail.contractor, nail.sourceId, nail.unitCostSnap]).toEqual(["Crew B", "recRateTGB0000000", 1.5]);
    const full = familyLines(FULL, "recGlueA000000000", cat, "Install", "Crew B", "Standard").lines[0];
    expect([full.contractor, full.sourceId]).toEqual(["Crew A", "recRateFullA00000"]);
  });

  it("names a part that is no longer on the rate card, never guessing", () => {
    const gone = choice({ ...NAIL, parts: [part("recRateGone000000")] });
    expect(familyLines(gone, null, cat, "Install", null, "Standard")).toEqual({ lines: [], missing: "recRateGone000000 is no longer on the rate card." });
  });

  it("switches a line's method in place: quantity and area stay, the glue stays when it fits (2026-11-06)", () => {
    const start = { ...familyLines(FULL, "recGlueB000000000", cat, "Install", null, "Standard").lines[0], qty: 820, area: "Main floor", unitPrice: 9 };
    expect(methodChoices(start, choices, cat, "Install").map((o) => [o.label, o.on])).toEqual([["Nail down", false], ["Full gluedown", true], ["Nail + full gluedown", false]]);
    // Full gluedown → Nail + full gluedown: same glue group, so Glue B stays; the typed price goes.
    const nf = switchMethod(start, NAIL_FULL.id, choices, cat, "Install", "Standard");
    expect([nf.sourceId, nf.qty, nf.area, nf.materialId, nf.unitPriceSnap, nf.unitPrice, nf.description]).toEqual(["recRateNailFullA0", 820, "Main floor", "recGlueB000000000", 3.79, null, "Install | FULL GLUE NAIL · Glue: Glue B"]);
    // → Nail down: no glue on that row.
    const nd = switchMethod(nf, NAIL.id, choices, cat, "Install", "Standard");
    expect([nd.sourceId, nd.qty, nd.materialId, nd.unitPriceSnap, nd.description]).toEqual(["recRateTGA0000000", 820, null, 2.3, "Install | T&G"]);
    // → Full gluedown again: nothing to keep, so no glue is picked for you.
    const back = switchMethod(nd, FULL.id, choices, cat, "Install", "Standard");
    expect([back.sourceId, back.materialId, back.unitPriceSnap]).toEqual(["recRateFullA00000", null, 2.3]);
    // A line on no family's row has no methods, and an unknown choice changes nothing.
    const click = familyLines(CLICK, null, cat, "Install", null, "Standard");
    expect(click.missing).toBeNull();
    expect(methodChoices(click.lines[0], choices, cat, "Install")).toEqual([]);
    expect(switchMethod(start, "recNope0000000000", choices, cat, "Install", "Standard")).toBe(start);
  });
});

describe("line words from Customer Wording (Albert, 2026-11-06: \"draft the wordings, use everywhere\")", () => {
  it("names the work by its wording and the glue as 'Glue: …', falling back to the rows' own names", () => {
    const worded = buildCatalogue(
      [R({ id: "recRateWord000000", spec: "FULL GLUE", materialGroup: "Glue - Full Spread", defaultMaterialId: "recGlueW000000000", wording: "Hardwood T&G install · Full gluedown" })],
      [],
      [
        { id: "recGlueW000000000", name: "Silane Based: Pail-Brand (or Equivalent)", group: "Glue - Full Spread", cost: 1, price: 2, wording: "Silane, a brand or equivalent" },
        { id: "recGlueN000000000", name: "Plain Glue", group: "Glue - Full Spread", cost: 0.5, price: 1 },
      ],
    );
    const pick = (id: string) => familyLines(choice({ id: "recWordChoice0000", label: "x", path: ["Hardwood T&G", "Full gluedown"], parts: [part("recRateWord000000")] }), id, worded, "Install", null, "Standard").lines[0].description;
    expect(pick("recGlueW000000000")).toBe("Hardwood T&G install · Full gluedown · Glue: Silane, a brand or equivalent");
    expect(pick("recGlueN000000000")).toBe("Hardwood T&G install · Full gluedown · Glue: Plain Glue");
    // No wording on the row: the row's own name, as before.
    expect(familyLines(FULL, "recGlueB000000000", cat, "Install", null, "Standard").lines[0].description).toBe("Install | FULL GLUE · Glue: Glue B");
  });
});
