import { describe, expect, it } from "vitest";
import { LINE, OPTION, VERSION } from "../src/lib/airtable/fields";
import type { EditorLine, EditorOption, EditorQuote } from "../src/lib/editor/model";
import { cleanEditorQuote, isRecordId, lineFields, planIsEmpty, planSave } from "../src/lib/quotes/savePlan";
import { profileLine, stairProfileLine } from "../src/lib/quick/stairs";

// INVENTED rates, quantities and ids only: this repo is public.
const L = (o: Partial<EditorLine> & { id: string }): EditorLine => ({
  sourceKind: "manual",
  sourceId: null,
  labourType: null,
  spec: null,
  description: "Something",
  contractor: null,
  area: "",
  uom: "sqft",
  clientNote: "",
  lineType: "Install",
  section: "Install",
  include: true,
  qty: 100,
  waste: null,
  unitPrice: null,
  unitPriceSnap: 2,
  unitCostSnap: 1,
  costOverride: null,
  manualCost: null,
  minChargeSnap: null,
  hasSource: false,
  ...o,
});
const O = (o: Partial<EditorOption> & { id: string }): EditorOption => ({ name: "Option 1", description: "", recommended: false, lines: [], ...o });
const Q = (options: EditorOption[], o: Partial<EditorQuote> = {}): EditorQuote => ({
  quoteRecordId: "recVer0000000000A",
  customerName: "",
  siteAddress: "",
  siteCity: "",
  ghlContactId: null,
  ghlOpportunityId: null,
  addressStatus: null,
  projectNumber: null,
  notionProjectUrl: null,
  discountRate: 0.1,
  showHst: true,
  options,
  ...o,
});

const OPT_A = "recOptA000000000A";
const OPT_B = "recOptB000000000B";
const LINE_1 = "recLine100000000A";
const LINE_2 = "recLine200000000A";
const OTHER_QUOTES_LINE = "recForeign000000A";

const original = () =>
  Q([
    O({ id: OPT_A, name: "Vinyl", lines: [L({ id: LINE_1, description: "Remove carpet" }), L({ id: LINE_2, description: "Install plank" })] }),
    O({ id: OPT_B, name: "Hardwood", lines: [] }),
  ]);

describe("saving a version", () => {
  it("writes nothing when nothing changed", () => {
    const plan = planSave(original(), structuredClone(original()));
    expect(planIsEmpty(plan)).toBe(true);
  });

  it("updates only the line that changed", () => {
    const edited = original();
    edited.options[0].lines[1].unitPrice = 2.5;
    const plan = planSave(original(), edited);
    expect(plan.updateLines.map((u) => u.id)).toEqual([LINE_2]);
    expect(plan.updateLines[0].fields[LINE.unitPrice]).toBe(2.5);
    expect(plan.createLines).toEqual([]);
    expect(plan.updateOptions).toEqual([]);
    expect(plan.version).toEqual({});
  });

  it("creates new options and lines, pointing new lines at their new option", () => {
    const edited = original();
    edited.options.push(O({ id: "opt_local_1", name: "Tile", lines: [L({ id: "line_local_1", description: "Tile set" })] }));
    edited.options[1].lines.push(L({ id: "line_local_2", description: "Sand" }));
    const plan = planSave(original(), edited);
    expect(plan.createOptions).toEqual([{ ref: "new:2", fields: expect.objectContaining({ [OPTION.name]: "Tile", [OPTION.sortOrder]: 3 }) }]);
    expect(plan.createLines.map((c) => c.option)).toEqual([OPT_B, "new:2"]);
  });

  it("never updates a record that was not on this version, whatever id the browser sends", () => {
    const edited = original();
    edited.options[0].lines.push(L({ id: OTHER_QUOTES_LINE, description: "Sneaky" }));
    edited.options.push(O({ id: "recForeignOpt000A", name: "Not ours" }));
    const plan = planSave(original(), edited);
    expect(plan.updateLines.map((u) => u.id)).not.toContain(OTHER_QUOTES_LINE);
    expect(plan.updateOptions.map((u) => u.id)).not.toContain("recForeignOpt000A");
    expect(plan.createLines.map((c) => c.fields[LINE.label])).toContain("Sneaky");
    expect(plan.createOptions.map((c) => c.fields[OPTION.name])).toContain("Not ours");
  });

  it("updates a line only once even if the browser sends it twice", () => {
    const edited = original();
    edited.options[1].lines.push(structuredClone(edited.options[0].lines[0]));
    const plan = planSave(original(), edited);
    expect(plan.updateLines).toEqual([]);
    expect(plan.createLines).toHaveLength(1);
  });

  it("detaches removed lines and options instead of deleting them", () => {
    const edited = original();
    edited.options[0].lines = edited.options[0].lines.filter((l) => l.id !== LINE_1);
    edited.options = edited.options.filter((o) => o.id !== OPT_B);
    const plan = planSave(original(), edited);
    expect(plan.detachLines).toEqual([LINE_1]);
    expect(plan.detachOptions).toEqual([OPT_B]);
    // LINE_2 moved up one place, so its sort order changes.
    expect(plan.updateLines).toEqual([{ id: LINE_2, option: OPT_A, fields: expect.objectContaining({ [LINE.sortOrder]: 1 }) }]);
  });

  it("moves a line to another option by updating it", () => {
    const edited = original();
    const [moved] = edited.options[0].lines.splice(1, 1);
    edited.options[1].lines.push(moved);
    const plan = planSave(original(), edited);
    expect(plan.updateLines).toEqual([{ id: LINE_2, option: OPT_B, fields: expect.any(Object) }]);
    expect(plan.detachLines).toEqual([]);
  });

  it("writes the terms only when they change, and always for a new version", () => {
    const edited = original();
    edited.discountRate = 0.11;
    expect(planSave(original(), edited).version).toEqual({ [VERSION.discountRate]: 0.11 });
    const reasoned = { ...original(), discountReason: "Fall promotion" };
    expect(planSave(original(), reasoned).version).toEqual({ [VERSION.discountReason]: "Fall promotion" });
    const fresh = planSave(null, original());
    expect(fresh.version).toEqual({ [VERSION.discountRate]: 0.1, [VERSION.showHst]: true, [VERSION.discountReason]: null });
    expect(fresh.createOptions).toHaveLength(2);
    expect(fresh.createLines).toHaveLength(2);
    expect(fresh.updateLines).toEqual([]);
  });
});

describe("line fields", () => {
  it("links the line to where its price came from, and only there", () => {
    const f = lineFields(L({ id: "x", sourceKind: "rate", sourceId: "recRate000000000A", labourType: "Install", spec: "CLICK", description: "Install | CLICK" }), 4);
    expect(f[LINE.rateItem]).toEqual(["recRate000000000A"]);
    expect(f[LINE.stairItem]).toEqual([]);
    expect(f[LINE.product]).toEqual([]);
    expect(f[LINE.sortOrder]).toBe(4);
  });

  it("leaves a card line's own name to Airtable, and keeps wording someone typed", () => {
    const card = { id: "x", sourceKind: "rate" as const, sourceId: "recRate000000000A", labourType: "Install", spec: "CLICK" };
    expect(lineFields(L({ ...card, description: "Install | CLICK" }), 1)[LINE.descriptionOverride]).toBeNull();
    expect(lineFields(L({ ...card, description: "Install click plank, main floor" }), 1)[LINE.descriptionOverride]).toBe("Install click plank, main floor");
    expect(lineFields(L({ id: "y", description: "Haul away old tile" }), 1)[LINE.descriptionOverride]).toBe("Haul away old tile");
  });

  it("writes every section the editor has, Private included (2026-10-22), and blanks one Airtable doesn't know", () => {
    expect(lineFields(L({ id: "p", section: "Private", lineType: "Other", description: "Referral fee" }), 1)[LINE.section]).toBe("Private");
    expect(cleanEditorQuote({ options: [O({ id: "o", lines: [L({ id: "p", section: "Private" })] })] }).options[0].lines[0].section).toBe("Private");
    expect(lineFields(L({ id: "z", section: "Unsorted" }), 1)[LINE.section]).toBeNull();
  });
});

describe("what the browser sends, cleaned", () => {
  it("drops customer details: GHL owns them, the save never writes them", () => {
    const q = cleanEditorQuote({ ...original(), customerName: "Someone", siteAddress: "1 Example St", ghlContactId: "abc" });
    expect([q.customerName, q.siteAddress, q.ghlContactId]).toEqual(["", "", null]);
  });

  it("keeps the discount between 0 and 100%", () => {
    expect(cleanEditorQuote({ ...original(), discountRate: 5 }).discountRate).toBe(1);
    expect(cleanEditorQuote({ ...original(), discountRate: -1 }).discountRate).toBe(0);
    expect(cleanEditorQuote({ ...original(), discountRate: "0.2" }).discountRate).toBe(0);
  });

  it("caps sizes and turns anything that isn't a number into blank", () => {
    const many = Array.from({ length: 30 }, (_, i) => O({ id: `opt_${i}` }));
    expect(cleanEditorQuote({ options: many }).options).toHaveLength(20);
    const q = cleanEditorQuote({ options: [O({ id: "o", lines: [{ ...L({ id: "l" }), qty: "100", description: "x".repeat(5000) } as unknown as EditorLine] })] });
    expect(q.options[0].lines[0].qty).toBeNull();
    expect(q.options[0].lines[0].description).toHaveLength(1000);
  });

  it("never invents a select option or a link to a record that isn't an id", () => {
    const q = cleanEditorQuote({
      options: [O({ id: "o", lines: [L({ id: "l", section: "Unsorted", lineType: "Bogus", uom: "furlong", sourceKind: "rate", sourceId: "not-an-id" })] })],
    });
    const l = q.options[0].lines[0];
    expect([l.section, l.lineType, l.uom]).toEqual([null, null, null]);
    expect([l.sourceKind, l.sourceId, l.hasSource]).toEqual(["manual", null, false]);
    expect(isRecordId("recABCDEFGHIJKLMN")).toBe(true);
    expect(isRecordId("recABC")).toBe(false);
  });

  it("keeps a line priced from the card linked to it", () => {
    const q = cleanEditorQuote({ options: [O({ id: "o", lines: [L({ id: "l", sourceKind: "stair", sourceId: "recStair00000000A", section: "Stairs", lineType: "Stairs", uom: "piece" })] })] });
    expect(q.options[0].lines[0]).toMatchObject({ sourceKind: "stair", sourceId: "recStair00000000A", section: "Stairs", hasSource: true });
  });

  it("saves a preset staircase linked to its Stair Profiles row, and reads the kind back (2026-10-20)", () => {
    const row = { id: "recProf000000000A", name: "Wood on main stairs", price: 4000, cost: 2600 };
    const f = lineFields(profileLine(row, 4200), 1);
    expect(f).toMatchObject({ [LINE.section]: "Stairs", [LINE.lineType]: "Stairs", [LINE.uom]: "each", [LINE.qty]: 1, [LINE.unitPriceSnap]: 4000, [LINE.unitCostSnap]: 2600, [LINE.unitPrice]: 4200, [LINE.stairProfile]: [row.id], [LINE.stairItem]: [], [LINE.rateItem]: [], [LINE.product]: [] });
    const q = cleanEditorQuote({ options: [O({ id: "o", lines: [L({ id: "l", sourceKind: "profile", sourceId: row.id, section: "Stairs", lineType: "Stairs", uom: "each" })] })] });
    expect(q.options[0].lines[0]).toMatchObject({ sourceKind: "profile", sourceId: row.id, hasSource: true });
  });

  it("saves a stair profile as a flat Stairs line with no links and its name as the wording (2026-10-18)", () => {
    const f = lineFields(stairProfileLine("Townhome", "Vinyl treads", 1500), 1);
    expect(f).toMatchObject({ [LINE.section]: "Stairs", [LINE.lineType]: "Stairs", [LINE.uom]: "flat", [LINE.qty]: 1, [LINE.unitPrice]: 1500, [LINE.descriptionOverride]: "Townhome – Vinyl treads", [LINE.rateItem]: [], [LINE.stairItem]: [], [LINE.product]: [] });
  });
});
