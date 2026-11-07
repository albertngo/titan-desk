import { describe, expect, it } from "vitest";
import { addOption, buildCatalogue, removeLine, type EditorOption, type EditorQuote } from "../src/lib/editor/model";
import { DELIVERY_KEY, newOptionIds, stairBaseLine, withFees } from "../src/lib/quotes/fees";

// INVENTED rows only.
const rate = (labourType: string, spec: string, id: string) => ({ id, labourType, spec, contractor: "TITAN", uom: "flat", rate: 200, cost: 0, minCharge: null, defaultWaste: null, materialGroup: null, defaultMaterialId: null, wording: labourType === "Delivery" ? "Delivery" : "Stair base fee" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const entries = buildCatalogue([rate("Delivery", "Standard Delivery", "recDELIVERY000001")] as any, []);
const blank = (): EditorQuote => ({ quoteRecordId: null, customerName: "", siteAddress: "", siteCity: "", ghlContactId: null, ghlOpportunityId: null, addressStatus: null, projectNumber: null, notionProjectUrl: null, discountRate: 0, showHst: true, options: [] }) as unknown as EditorQuote;
const opt = (q: EditorQuote) => q.options[q.options.length - 1];
const keyOf = (o: EditorOption) => o.lines.map((l) => `${l.section}:${l.labourType}|${l.spec}`);

describe("the fees an option starts with (Albert, 2026-11-06)", () => {
  it("a new flooring option on a measured version gets delivery; on a preliminary, none", () => {
    const before = blank();
    const added = addOption(before);
    expect(keyOf(opt(withFees(added, entries, true, newOptionIds(before, added))))).toEqual([`Delivery:${DELIVERY_KEY}`]);
    expect(opt(withFees(added, entries, false, newOptionIds(before, added))).lines).toEqual([]);
    expect(opt(withFees(added, entries, true)).lines[0].unitPriceSnap).toBe(200);
    expect(opt(withFees(added, entries, true)).lines[0].unitCostSnap).toBe(0);
  });

  it("a stairs option gets the same Delivery line in Private, even empty, measured or not (2026-11-07)", () => {
    const q = { ...blank(), options: [{ ...addOption(blank()).options[0], scope: "Stairs" as const }] };
    const out = withFees(q, entries, false);
    expect(keyOf(opt(out))).toEqual([`Private:${DELIVERY_KEY}`]);
    expect(opt(out).lines[0].description).toBe("Delivery");
    expect(withFees(out, entries, true)).toBe(out);
    expect(stairBaseLine(entries)?.section).toBe("Private");
  });

  it("adds nothing twice, only to the options named, and a removed fee stays removed", () => {
    const once = withFees(addOption(blank()), entries, true);
    expect(withFees(once, entries, true)).toBe(once);
    const removed = removeLine(once, opt(once).id, opt(once).lines[0].id);
    expect(withFees(removed, entries, true, [])).toBe(removed);
  });

  it("adds nothing when the Rate Card row is gone", () => {
    const q = addOption(blank());
    expect(withFees(q, [], true)).toBe(q);
  });
});

