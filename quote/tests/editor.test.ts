import { describe, expect, it } from "vitest";
import { lineFlags, lineTotal, optionTotals } from "../src/lib/calc";
import {
  addLine,
  addLines,
  addOption,
  blankQuote,
  bestContractor,
  buildCatalogue,
  compareCrews,
  crewState,
  crewsOf,
  duplicateOption,
  exclusionLine,
  lineFromEntry,
  manualLine,
  materialChoices,
  rateSnap,
  setMaterial,
  parseNum,
  removeLine,
  revertLine,
  searchCatalogue,
  setContractor,
  setCrew,
  setServiceLevel,
  updateLine,
  updateOption,
  withCustomerFrom,
  type CardEntry,
} from "../src/lib/editor/model";
import type { MaterialRow, RateRow, StairRow } from "../src/lib/quotes/types";
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
    // Stair items are offered in the Stairs section only (2026-10-18).
    expect(searchCatalogue(cat, "", "Install").some((e) => e.kind === "stair")).toBe(false);
    expect(searchCatalogue(cat, "", "Stairs").some((e) => e.kind === "stair")).toBe(true);
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

  it("adds several lines at once, in place of the ones they replace (the stair builder, 2026-10-20)", () => {
    let q = blankQuote();
    const opt = q.options[0].id;
    const preset = { ...manualLine("Stairs", "Preset staircase"), id: "line_preset", unitPrice: 4000 };
    q = addLine(q, opt, preset);
    const pieces = [lineFromEntry(cat.find((e) => e.kind === "stair")!, "Stairs"), manualLine("Stairs", "Handrail")];
    q = addLines(q, opt, pieces, ["line_preset"]);
    expect(q.options[0].lines.map((l) => l.description)).toEqual([pieces[0].description, "Handrail"]);
    expect(addLines(q, opt, [], ["nothing"]).options[0].lines).toHaveLength(2);
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
    const start = premiumReady();
    let q = start.q;
    const opt = start.opt;
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
    const start = premiumReady();
    let q = start.q;
    const opt = start.opt;
    q = setServiceLevel(q, opt, "Premium", cat).quote;
    q = duplicateOption(q, opt);
    expect(q.options[1].serviceLevel).toBe("Premium");
    const clean = cleanEditorQuote({ options: [{ name: "A", serviceLevel: "Gold", lines: [] }, { name: "B", serviceLevel: "Premium", lines: [] }] });
    expect(clean.options.map((o) => o.serviceLevel)).toEqual(["Standard", "Premium"]);
  });
});

describe("crew per option (pick a contractor for the whole option)", () => {
  // Invented: Crew A and Crew B both do click plank and old-carpet removal; only Crew A does the
  // tile removal; the bin is a shared row (one contractor), and so is the refinish.
  const crewRates: RateRow[] = [
    ...rates,
    R({ id: "recRateF000000001", labourType: "Remove", spec: "OLD CARPET", contractor: "Crew B", rate: 0.5, cost: 0.3 }),
    R({ id: "recRateG000000001", labourType: "Remove", spec: "TILE", contractor: "Crew A", rate: 4, cost: 2 }),
    R({ id: "recRateH000000001", labourType: "Remove", spec: "TILE", contractor: "Crew E", rate: 4, cost: 2.5 }),
  ];
  const cc = buildCatalogue(crewRates, stairs);
  const get = (key: string) => cc.find((e) => e.key === key)!;

  function job() {
    let q = blankQuote();
    const opt = q.options[0].id;
    for (const l of [
      { ...lineFromEntry(get("Install|CLICK PLANK"), "Install"), qty: 100 }, // cheapest: Crew B
      { ...lineFromEntry(get("Remove|OLD CARPET"), "Removal"), qty: 100 }, // cheapest: Crew A
      { ...lineFromEntry(get("Remove|TILE"), "Removal"), qty: 50 }, // Crew A or Crew E
      { ...lineFromEntry(get("Disposal|SMALL BIN"), "Disposal"), qty: 1 }, // Crew C only
      { ...manualLine("Delivery", "Delivery"), qty: 1, unitPrice: 200 },
    ])
      q = addLine(q, opt, l);
    return { q, opt };
  }
  const who = (q: ReturnType<typeof blankQuote>) => q.options[0].lines.map((l) => l.contractor);

  it("lists as crews only contractors there is a choice of, most work first; no names in code", () => {
    expect(crewsOf(cc).map((c) => [c.name, c.covers])).toEqual([["Crew A", 3], ["Crew B", 2], ["Crew E", 1]]);
  });

  it("moves every line the crew can do, leaves shared rows and typed lines alone", () => {
    const { q, opt } = job();
    const r = setCrew(q, opt, "Crew B", cc);
    expect(r.quote.options[0].crew).toBe("Crew B");
    expect(who(r.quote)).toEqual(["Crew B", "Crew B", "Crew A", "Crew C", null]);
    expect(r.cannot.map((l) => l.description)).toEqual(["Remove | TILE"]);
    expect(r.quote.options[0].lines[1].unitCostSnap).toBe(0.3); // Crew B's cost for the removal
    expect(r.quote.options[0].lines[4].unitPrice).toBe(200);
  });

  it("keeps a line set by hand when the crew changes, and can send it back", () => {
    const { q, opt } = job();
    let x = setCrew(q, opt, "Crew A", cc).quote;
    const install = x.options[0].lines[0].id;
    x = setContractor(x, opt, install, "Crew B", cc); // one line by hand
    expect(crewState(x.options[0].lines[0], "Crew A", cc)).toBe("hand");
    const r = setCrew(x, opt, "Crew B", cc);
    expect(r.kept).toEqual([]); // it was Crew B by hand; Crew B is now the crew
    const back = setCrew(r.quote, opt, "Crew A", cc);
    expect(who(back.quote)).toEqual(["Crew A", "Crew A", "Crew A", "Crew C", null]);
    // Set by hand under Crew A, then switch to Crew E: the hand-set line stays.
    let y = setContractor(back.quote, opt, install, "Crew B", cc);
    const toE = setCrew(y, opt, "Crew E", cc);
    expect(toE.kept.map((l) => l.id)).toEqual([install]);
    expect(who(toE.quote)).toEqual(["Crew B", "Crew A", "Crew E", "Crew C", null]);
    y = setContractor(toE.quote, opt, install, "Crew E", cc); // no Crew E rate: nothing changes
    expect(y.options[0].lines[0].contractor).toBe("Crew B");
  });

  it("never changes a typed price or cost, and prices at the option's level", () => {
    const start = job();
    let q = start.q;
    const opt = start.opt;
    q = setServiceLevel(q, opt, "Premium", cc).quote;
    q = updateLine(q, opt, q.options[0].lines[0].id, { unitPrice: 2.75, costOverride: 0.9 });
    const r = setCrew(q, opt, "Crew A", cc).quote.options[0].lines[0];
    expect([r.contractor, r.unitPrice, r.costOverride, r.unitCostSnap, r.unitPriceSnap]).toEqual(["Crew A", 2.75, 0.9, 1.2, 2.3]);
  });

  it("clearing the crew leaves every line where it is", () => {
    const { q, opt } = job();
    const a = setCrew(q, opt, "Crew A", cc).quote;
    const none = setCrew(a, opt, null, cc).quote;
    expect(none.options[0].crew).toBeNull();
    expect(who(none)).toEqual(who(a));
  });

  it("compares the option's cost per crew; the price moves only where the card prices crews differently", () => {
    const { q, opt } = job();
    const cmp = Object.fromEntries(compareCrews(q, opt, cc).map((c) => [c.name, c]));
    // Crew A: 100×1.2 + 100×0.2 + 50×2 + 250 = 490 · Crew B: 100×1.0 + 100×0.3 + 50×2 (A stays) + 250 = 480
    expect(cmp["Crew A"].cost).toBe(490);
    expect(cmp["Crew B"].cost).toBe(480);
    expect([cmp["Crew A"].cannot, cmp["Crew B"].cannot, cmp["Crew E"].cannot]).toEqual([0, 1, 2]);
    expect(setCrew(q, opt, "Crew A", cc).quote.options[0].lines.map((l) => l.unitPriceSnap)).toEqual(q.options[0].lines.map((l) => l.unitPriceSnap));
  });

  it("new lines go to the crew; the crew is kept on duplicate and saved as text", () => {
    const start = job();
    let q = start.q;
    const opt = start.opt;
    q = setCrew(q, opt, "Crew A", cc).quote;
    expect(lineFromEntry(get("Install|CLICK PLANK"), "Install", q.options[0].crew ?? undefined).contractor).toBe("Crew A");
    q = duplicateOption(q, opt);
    expect(q.options[1].crew).toBe("Crew A");
    const clean = cleanEditorQuote({ options: [{ name: "A", crew: "  Crew A ", lines: [] }, { name: "B", crew: 7, lines: [] }] });
    expect(clean.options.map((o) => o.crew)).toEqual(["Crew A", null]);
  });
});

describe("swappable material on a Rate Card line (one line, material named)", () => {
  // Invented: full-coverage glue install. Crew A's row is $4.00 / cost $3.00 including Glue One
  // (price $1.00, cost $0.80). Glue Two is dearer, Glue Three has no price yet (not offered).
  const mats: MaterialRow[] = [
    { id: "recMat00000000001", name: "Glue One", group: "Full glue", cost: 0.8, price: 1 },
    { id: "recMat00000000002", name: "Glue Two", group: "Full glue", cost: 1.5, price: 2 },
    { id: "recMat00000000003", name: "Glue Three", group: "Full glue", cost: 1, price: null },
    { id: "recMat00000000004", name: "Board", group: "Subfloor", cost: 2, price: 3 },
  ];
  const glueRates: RateRow[] = [
    R({ id: "recRateM000000001", spec: "FULL GLUE", contractor: "Crew A", rate: 4, cost: 3, materialGroup: "Full glue", defaultMaterialId: "recMat00000000001" }),
    R({ id: "recRateM000000002", spec: "FULL GLUE", contractor: "Crew B", rate: 4, cost: 2.6, materialGroup: "Full glue", defaultMaterialId: "recMat00000000001" }),
    R({ id: "recRateM000000003", spec: "NO GROUP", contractor: "Crew A", rate: 2, cost: 1 }),
    // Misconfigured: the default costs more than the whole row, so no swap is offered.
    R({ id: "recRateM000000004", spec: "BAD", contractor: "Crew A", rate: 0.5, cost: 0.4, materialGroup: "Full glue", defaultMaterialId: "recMat00000000001" }),
  ];
  const mc = buildCatalogue(glueRates, [], mats);
  const glue = mc.find((e) => e.key === "Install|FULL GLUE") as Extract<CardEntry, { kind: "rate" }>;

  function withGlue(level?: "Premium") {
    let q = blankQuote();
    const opt = q.options[0].id;
    q = addLine(q, opt, { ...lineFromEntry(glue, "Install", "Crew A", level), qty: 100 });
    return { q, opt, id: q.options[0].lines[0].id };
  }

  it("offers only priced materials in the group, and nothing on a misconfigured row", () => {
    const a = glue.contractors.find((c) => c.name === "Crew A")!;
    expect(a.material!.choices.map((m) => m.name)).toEqual(["Glue One", "Glue Two"]);
    expect(mc.find((e) => e.key === "Install|BAD")!.kind === "rate" && (mc.find((e) => e.key === "Install|BAD") as typeof glue).contractors[0].material).toBeNull();
  });

  it("a new line is the row as it stands, named with its default material", () => {
    const { q } = withGlue();
    const l = q.options[0].lines[0];
    expect([l.unitPriceSnap, l.unitCostSnap, l.materialId, l.description]).toEqual([4, 3, "recMat00000000001", "Install | FULL GLUE · Glue One"]);
  });

  it("swapping changes price and cost by the difference, and back again exactly", () => {
    const { q, opt, id } = withGlue();
    const two = setMaterial(q, opt, id, "recMat00000000002", mc);
    const l = two.options[0].lines[0];
    expect([l.unitPriceSnap, l.unitCostSnap, l.description]).toEqual([5, 3.7, "Install | FULL GLUE · Glue Two"]);
    const back = setMaterial(two, opt, id, "recMat00000000001", mc).options[0].lines[0];
    expect([back.unitPriceSnap, back.unitCostSnap]).toEqual([4, 3]);
    // Not in the group, or not priced: nothing happens.
    expect(setMaterial(q, opt, id, "recMat00000000004", mc)).toEqual(q);
    expect(setMaterial(q, opt, id, "recMat00000000003", mc)).toEqual(q);
  });

  it("Premium marks up the labour only, never the material", () => {
    const { q, opt, id } = withGlue("Premium");
    expect(q.options[0].lines[0].unitPriceSnap).toBe(4.45); // (4 − 1) × 1.15 + 1
    const two = setMaterial({ ...q, options: [{ ...q.options[0], serviceLevel: "Premium" }] }, opt, id, "recMat00000000002", mc);
    expect(two.options[0].lines[0].unitPriceSnap).toBe(5.45); // 3.45 + 2
    const std = setServiceLevel(two, opt, "Standard", mc).quote.options[0].lines[0];
    expect(std.unitPriceSnap).toBe(5);
    // A row with no material is marked up whole, as before.
    const plain = mc.find((e) => e.key === "Install|NO GROUP") as typeof glue;
    expect(rateSnap(plain, plain.contractors[0], null, "Premium").price).toBe(2.3);
  });

  it("keeps the material when the contractor or crew changes, at the new contractor's labour cost", () => {
    const { q, opt, id } = withGlue();
    const two = setMaterial(q, opt, id, "recMat00000000002", mc);
    const b = setContractor(two, opt, id, "Crew B", mc).options[0].lines[0];
    expect([b.contractor, b.materialId, b.unitPriceSnap, b.unitCostSnap]).toEqual(["Crew B", "recMat00000000002", 5, 3.3]); // 2.6 − 0.8 + 1.5
    const crewB = setCrew(two, opt, "Crew B", mc).quote.options[0].lines[0];
    expect(crewB.unitCostSnap).toBe(3.3);
  });

  it("never changes a typed price, and says what the line can be swapped between", () => {
    const { q, opt, id } = withGlue();
    const typed = updateLine(q, opt, id, { unitPrice: 4.25 });
    expect(setMaterial(typed, opt, id, "recMat00000000002", mc).options[0].lines[0].unitPrice).toBe(4.25);
    const c = materialChoices(q.options[0].lines[0], mc);
    expect([c.choices.length, c.current?.name, c.base?.name]).toEqual([2, "Glue One", "Glue One"]);
  });

  it("is saved as a link on Rate Card lines only", () => {
    const clean = cleanEditorQuote({
      options: [{ name: "A", lines: [
        { sourceKind: "rate", sourceId: "recRateM000000001", materialId: "recMat00000000002" },
        { sourceKind: "manual", materialId: "recMat00000000002" },
      ] }],
    });
    expect(clean.options[0].lines.map((l) => l.materialId)).toEqual(["recMat00000000002", null]);
  });
});
