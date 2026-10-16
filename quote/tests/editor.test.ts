import { describe, expect, it } from "vitest";
import { lineFlags, lineTotal, optionTotals } from "../src/lib/calc";
import {
  addLine,
  addOption,
  blankQuote,
  bestContractor,
  buildCatalogue,
  duplicateOption,
  exclusionLine,
  lineFromEntry,
  manualLine,
  parseNum,
  removeLine,
  revertLine,
  searchCatalogue,
  setContractor,
  setServiceLevel,
  updateLine,
  updateOption,
  withCustomerFrom,
  type CardEntry,
} from "../src/lib/editor/model";
import type { RateRow, StairRow } from "../src/lib/quotes/types";
import { levelOf } from "../src/lib/pricing/service";
import { cleanEditorQuote } from "../src/lib/quotes/savePlan";

// INVENTED rates and contractors only: this repo is public.
const R = (o: Partial<RateRow>): RateRow => ({
  id: "recRate0000000000",
  labourType: "Install",
  spec: "CLICK PLANK",
  contractor: "Crew A",
  uom: "sqft",
  rate: 2,
  cost: 1.2,
  minCharge: null,
  defaultWaste: null,
  ...o,
});
const rates: RateRow[] = [
  R({ id: "recRateA000000001", contractor: "Crew A", cost: 1.2 }),
  R({ id: "recRateB000000001", contractor: "Crew B", cost: 1.0 }),
  R({ id: "recRateC000000001", labourType: "Remove", spec: "OLD CARPET", contractor: "Crew A", rate: 0.5, cost: 0.2 }),
  R({ id: "recRateD000000001", labourType: "Disposal", spec: "SMALL BIN", contractor: "Crew C", uom: "flat", rate: 300, cost: 250, minCharge: 300 }),
  R({ id: "recRateE000000001", labourType: "Refinish", spec: "SAND AND COAT", contractor: "Crew D", rate: 3, cost: 1.5 }),
];
const stairs: StairRow[] = [{ id: "recStair000000001", name: "Stair tread", category: "Treads", size: "36in", rate: 90, cost: 40 }];
const cat = buildCatalogue(rates, stairs);
const click = cat.find((e) => e.key === "Install|CLICK PLANK") as Extract<CardEntry, { kind: "rate" }>;

describe("catalogue", () => {
  it("groups contractors under one entry, cheapest first", () => {
    expect(click.contractors.map((c) => c.name)).toEqual(["Crew B", "Crew A"]);
    expect(bestContractor(click).name).toBe("Crew B");
    expect(cat.filter((e) => e.kind === "rate")).toHaveLength(4);
  });

  it("ranks the section's own work first and needs every word", () => {
    expect(searchCatalogue(cat, "", "Removal")[0].key).toBe("Remove|OLD CARPET");
    // Install is the main work: install and refinish entries both rank ahead of removal and disposal.
    expect(searchCatalogue(cat, "", "Install").slice(0, 2).map((e) => e.key).sort()).toEqual(["Install|CLICK PLANK", "Refinish|SAND AND COAT"]);
    expect(searchCatalogue(cat, "click plank", "Removal").map((e) => e.key)).toEqual(["Install|CLICK PLANK"]);
    expect(searchCatalogue(cat, "click carpet", "Install")).toEqual([]);
  });
});

describe("lines", () => {
  it("prices a card line from the cheapest contractor, linked to its rate row", () => {
    const l = lineFromEntry(click, "Install");
    expect([l.contractor, l.unitPriceSnap, l.unitCostSnap, l.sourceId, l.hasSource]).toEqual(["Crew B", 2, 1.0, "recRateB000000001", true]);
    expect(l.description).toBe("Install | CLICK PLANK");
    expect(l.lineType).toBe("Install");
  });

  it("switching contractor moves the card rate and cost but keeps an override", () => {
    let q = blankQuote();
    const opt = q.options[0].id;
    const l = { ...lineFromEntry(click, "Install"), qty: 100, unitPrice: 1.8 };
    q = addLine(q, opt, l);
    q = setContractor(q, opt, l.id, "Crew A", cat);
    const after = q.options[0].lines[0];
    expect([after.contractor, after.unitCostSnap, after.unitPrice, after.sourceId]).toEqual(["Crew A", 1.2, 1.8, "recRateA000000001"]);
    expect(lineTotal(after)).toBe(180);
    expect(lineFlags(after)).toContain("OVR");
  });

  it("reverting clears both overrides and the OVR flag", () => {
    let q = blankQuote();
    const opt = q.options[0].id;
    const l = { ...lineFromEntry(click, "Install"), qty: 10, unitPrice: 9, costOverride: 5 };
    q = revertLine(addLine(q, opt, l), opt, l.id);
    const after = q.options[0].lines[0];
    expect([after.unitPrice, after.costOverride]).toEqual([null, null]);
    expect(lineFlags(after)).toEqual([]);
  });

  it("stair items price per piece; manual lines have no source", () => {
    const s = lineFromEntry(cat.find((e) => e.kind === "stair")!, "Stairs");
    expect([s.uom, s.unitPriceSnap, s.sourceKind]).toEqual(["piece", 90, "stair"]);
    const m = { ...manualLine("Delivery", "Delivery"), qty: 1, unitPrice: 200, costOverride: 100 };
    expect(m.uom).toBe("flat");
    expect(lineFlags(m)).toEqual(["NOSRC"]);
  });

  it("exclusions are text only and never priced", () => {
    const x = exclusionLine("Appliances by others");
    expect([x.section, x.lineType, lineTotal(x)]).toEqual(["Exclusions", "Note", null]);
  });
});

describe("options", () => {
  it("a duplicate is fully independent of the original", () => {
    let q = blankQuote();
    const a = q.options[0].id;
    const l = { ...lineFromEntry(click, "Install"), qty: 100 };
    q = addLine(q, a, l);
    q = duplicateOption(q, a);
    const b = q.options[1];
    expect(b.lines[0].id).not.toBe(l.id);
    q = updateLine(q, b.id, b.lines[0].id, { qty: 500 });
    expect(q.options[0].lines[0].qty).toBe(100);
    expect(q.options[1].lines[0].qty).toBe(500);
    q = removeLine(q, b.id, q.options[1].lines[0].id);
    expect(q.options[0].lines).toHaveLength(1);
  });

  it("only one option is recommended at a time", () => {
    let q = addOption(blankQuote());
    q = updateOption(q, q.options[0].id, { recommended: true });
    q = updateOption(q, q.options[1].id, { recommended: true });
    expect(q.options.map((o) => o.recommended)).toEqual([false, true]);
  });

  it("totals come from the same maths as the read-only view", () => {
    let q = blankQuote();
    const opt = q.options[0].id;
    q = addLine(q, opt, { ...lineFromEntry(click, "Install"), qty: 100 });
    q = { ...q, discountRate: 0.1 };
    const t = optionTotals(q.options[0].lines, q.discountRate, q.showHst);
    expect([t.preDiscount, t.discount, t.subtotal, t.cost]).toEqual([200, -20, 180, 100]);
  });
});

describe("parseNum", () => {
  it("treats blank as 'use the card' and ignores $ and commas", () => {
    expect(parseNum("")).toBeNull();
    expect(parseNum("  ")).toBeNull();
    expect(parseNum("$1,250.50")).toBe(1250.5);
    expect(parseNum("abc")).toBeNull();
    expect(parseNum("0")).toBe(0);
  });
});

describe("customer and site", () => {
  it("a restored draft keeps its work but shows today's customer and address", () => {
    let draft = blankQuote();
    draft = { ...draft, customerName: "Doe, Jane", siteAddress: "1 Old Rd", siteCity: "Oldtown", discountRate: 0.05 };
    draft = addLine(draft, draft.options[0].id, { ...lineFromEntry(click, "Install"), qty: 10 });
    const now = { ...blankQuote(), customerName: "Doe, Jane", siteAddress: "12 Example St", siteCity: "Oakville", ghlContactId: "conAAA111111", addressStatus: "Confirmed" };
    const merged = withCustomerFrom(draft, now);
    expect([merged.siteAddress, merged.siteCity, merged.ghlContactId, merged.addressStatus]).toEqual(["12 Example St", "Oakville", "conAAA111111", "Confirmed"]);
    expect([merged.discountRate, merged.options[0].lines.length]).toEqual([0.05, 1]);
  });
});

describe("service level (Premium = labour +15%)", () => {
  const removal = cat.find((e) => e.key === "Remove|OLD CARPET")!;
  const bin = cat.find((e) => e.key === "Disposal|SMALL BIN")!;
  const stair = cat.find((e) => e.kind === "stair")!;

  function premiumReady() {
    let q = blankQuote();
    const opt = q.options[0].id;
    for (const l of [
      { ...lineFromEntry(click, "Install"), qty: 100 },
      { ...lineFromEntry(removal, "Removal"), qty: 100 },
      { ...lineFromEntry(bin, "Disposal"), qty: 1 },
      { ...lineFromEntry(stair, "Install"), qty: 10 },
      { ...manualLine("Delivery", "Delivery"), qty: 1, unitPrice: 200 },
    ])
      q = addLine(q, opt, l);
    return { q, opt };
  }

  it("new options are Standard", () => {
    expect(blankQuote().options[0].serviceLevel).toBe("Standard");
    expect(levelOf({})).toBe("Standard");
  });

  it("prices labour at the card +15% and leaves cost, disposal and typed lines alone", () => {
    const { q, opt } = premiumReady();
    const { quote, notRepriced } = setServiceLevel(q, opt, "Premium", cat);
    const [install, remove, disposal, tread, delivery] = quote.options[0].lines;
    expect(quote.options[0].serviceLevel).toBe("Premium");
    expect(notRepriced).toEqual([]);
    expect([install.unitPriceSnap, install.unitCostSnap]).toEqual([2.3, 1.0]); // 2 × 1.15, cost unchanged
    expect(remove.unitPriceSnap).toBe(0.58); // 0.5 × 1.15 = 0.575 → 0.58
    expect(tread.unitPriceSnap).toBe(103.5);
    expect(disposal.unitPriceSnap).toBe(300);
    expect(delivery.unitPrice).toBe(200);
    // Margin goes up by exactly the markup: price up, cost the same.
    const std = optionTotals(q.options[0].lines, 0, false);
    const prem = optionTotals(quote.options[0].lines, 0, false);
    expect(prem.cost).toBe(std.cost);
    expect(prem.preDiscount).toBe(230 + 58 + 300 + 1035 + 200);
  });

  it("goes back to Standard exactly, and never touches a typed price", () => {
    const { q, opt } = premiumReady();
    const typed = updateLine(q, opt, q.options[0].lines[0].id, { unitPrice: 2.75 });
    const prem = setServiceLevel(typed, opt, "Premium", cat).quote;
    expect(prem.options[0].lines[0].unitPrice).toBe(2.75);
    const back = setServiceLevel(prem, opt, "Standard", cat).quote;
    expect(back.options[0].lines.map((l) => l.unitPriceSnap)).toEqual(q.options[0].lines.map((l) => l.unitPriceSnap));
  });

  it("lines added to, or re-crewed on, a Premium option are priced at Premium", () => {
    let { q, opt } = premiumReady();
    q = setServiceLevel(q, opt, "Premium", cat).quote;
    const added = lineFromEntry(click, "Install", "Crew A", levelOf(q.options[0]));
    expect(added.unitPriceSnap).toBe(2.3);
    q = setContractor(q, opt, q.options[0].lines[0].id, "Crew A", cat);
    expect([q.options[0].lines[0].unitPriceSnap, q.options[0].lines[0].unitCostSnap]).toEqual([2.3, 1.2]);
  });

  it("says which lines it could not re-price because their card row is gone", () => {
    const { q, opt } = premiumReady();
    const gone = cat.filter((e) => e.key !== "Remove|OLD CARPET");
    const { quote, notRepriced } = setServiceLevel(q, opt, "Premium", gone);
    expect(notRepriced.map((l) => l.description)).toEqual(["Remove | OLD CARPET"]);
    expect(quote.options[0].lines[1].unitPriceSnap).toBe(0.5);
  });

  it("is kept on duplicate and saved as Standard or Premium only", () => {
    let { q, opt } = premiumReady();
    q = setServiceLevel(q, opt, "Premium", cat).quote;
    q = duplicateOption(q, opt);
    expect(q.options[1].serviceLevel).toBe("Premium");
    const clean = cleanEditorQuote({ options: [{ name: "A", serviceLevel: "Gold", lines: [] }, { name: "B", serviceLevel: "Premium", lines: [] }] });
    expect(clean.options.map((o) => o.serviceLevel)).toEqual(["Standard", "Premium"]);
  });
});
