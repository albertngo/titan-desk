import { describe, expect, it } from "vitest";
import { paidTotal, planProgress } from "@/lib/calc";
import { inFilter, QUOTE_FILTERS, type QuoteGroup } from "@/lib/quotes/group";
import { collectGroup, formulaText, isFinished, projectPlan, projectRow, readyToCollect, rollupNames, secondPaymentDue, walkthroughWords, workOrderWords, type ProjectStatus } from "@/lib/projects/status";
import { paymentProjects } from "@/lib/notion/rows";

/** Won and finished projects on All quotes (Albert, 2026-11-27). Invented numbers only. */

const TODAY = "2026-11-27";
const pay = (amount: number, date = "2026-11-01") => ({ date, amount, method: "e-Transfer", reference: null });
const project = (over: Partial<ProjectStatus> = {}): ProjectStatus => ({ start: null, end: null, walkthrough: null, workOrders: [], ready: null, deal: "Invoice", valueApprox: null, payments: [], ...over });
const stages = [
  { label: "Deposit", when: "On acceptance", pay: "etransfer" as const, amount: 350 },
  { label: "Second payment", when: "First day on site", pay: "etransfer" as const, amount: 350 },
  { label: "Final payment", when: "On completion", pay: "etransfer" as const, amount: 300 },
];
const contract = { total: 1000, stages };

describe("the payment plan against what came in (calc.ts)", () => {
  it("adds payments to the cent", () => {
    expect(paidTotal([100.1, 200.2, Number.NaN])).toBe(300.3);
  });
  it("fills the stages in order, and says what is left and what was due by day one", () => {
    const p = planProgress(stages, 1000, 500);
    expect(p.stages.map((s) => [s.state, s.paid])).toEqual([["paid", 350], ["part", 150], ["open", 0]]);
    expect(p.balance).toBe(500);
    expect(p.dueBeforeFinal).toBe(700);
    expect(p.secondOwing).toBe(200);
  });
  it("within a cent is paid, and an overpayment leaves nothing owing", () => {
    expect(planProgress(stages, 1000, 999.995).balance).toBe(0);
    const over = planProgress(stages, 1000, 1200);
    expect(over.balance).toBe(0);
    expect(over.secondOwing).toBe(0);
    expect(over.stages.every((s) => s.state === "paid")).toBe(true);
  });
  it("a stage with no amount counts as nothing", () => {
    expect(planProgress([{ label: "Deposit", when: "", pay: null, amount: null }], 500, 0).stages[0]).toMatchObject({ amount: 0, state: "paid" });
  });
});

describe("reading a Titan Projects row", () => {
  const page = {
    id: "1b4596a4505f81ca00000000000000aa",
    properties: {
      "Confirmed Start Date": { date: { start: "2026-11-20", end: "2026-11-22" } },
      "Project End Date": { date: { start: "2026-11-24" } },
      "Final Walkthrough": { status: { name: "Completed" } },
      "Work Order Statuses": { rollup: { type: "array", array: [{ type: "status", status: { name: "Done" } }, { type: "status", status: { name: "Notified Contractor" } }] } },
      "Ready to Collect": { formula: { type: "string", string: "Ready to collect" } },
      "Type of Deal": { select: { name: "Cash" } },
      "Value Approx": { number: 1234.5 },
    },
  };
  it("takes the dates, statuses, formula text and deal as Notion has them", () => {
    expect(projectRow(page)).toEqual({
      id: "1b4596a4-505f-81ca-0000-0000000000aa",
      status: { start: "2026-11-20", end: "2026-11-24", walkthrough: "Completed", workOrders: ["Done", "Notified Contractor"], ready: "Ready to collect", deal: "Cash", valueApprox: 1234.5 },
    });
  });
  it("reads a formula of any type, and a blank as nothing", () => {
    expect(formulaText({ formula: { type: "string", string: "  " } })).toBeNull();
    expect(formulaText({ formula: { type: "boolean", boolean: true } })).toBe("Ready");
    expect(formulaText(undefined)).toBeNull();
    expect(rollupNames({ rollup: { type: "number", number: 2 } })).toEqual([]);
  });
  it("a payment belongs to the projects in its Projects relation", () => {
    expect(paymentProjects({ properties: { Projects: { relation: [{ id: "1b4596a4505f81ca00000000000000aa" }] } } })).toEqual(["1b4596a4-505f-81ca-0000-0000000000aa"]);
    expect(paymentProjects({ properties: {} })).toEqual([]);
  });
});

describe("Notion's Ready to Collect, mirrored", () => {
  it("is ready when its text says ready, and not when it lists what is open", () => {
    expect(readyToCollect("Ready to collect")).toBe(true);
    expect(readyToCollect("Not submitted")).toBe(false);
    expect(readyToCollect("Not ready: walkthrough in progress")).toBe(false);
    expect(readyToCollect(null)).toBe(false);
  });
});

describe("Complete and Won", () => {
  const g = (projectNumber: string | null) => ({ projectNumber, versions: [{ status: "Won" }] }) as unknown as QuoteGroup;
  it("Complete sits right after Won", () => {
    const keys = QUOTE_FILTERS.map((f) => f.key);
    expect(keys.indexOf("complete")).toBe(keys.indexOf("won") + 1);
  });
  it("a finished project is Complete, not Won; one not finished is Won", () => {
    expect(inFilter(g("PP-1"), "won", new Date(), false)).toBe(true);
    expect(inFilter(g("PP-1"), "complete", new Date(), false)).toBe(false);
    expect(inFilter(g("PP-1"), "won", new Date(), true)).toBe(false);
    expect(inFilter(g("PP-1"), "complete", new Date(), true)).toBe(true);
    expect(inFilter(g(null), "complete", new Date(), true)).toBe(false);
  });
  it("finished means an end date today or earlier", () => {
    expect(isFinished({ end: TODAY }, TODAY)).toBe(true);
    expect(isFinished({ end: "2026-11-28" }, TODAY)).toBe(false);
    expect(isFinished({ end: null }, TODAY)).toBe(false);
  });
});

describe("ready for second payment", () => {
  const due = (p: ProjectStatus) => secondPaymentDue(p, projectPlan(contract, p), TODAY);
  it("is due from the first day on site until the day-one payments are in", () => {
    expect(due(project({ start: TODAY, payments: [pay(350)] }))).toBe(true);
    expect(due(project({ start: TODAY, payments: [pay(350), pay(350)] }))).toBe(false);
  });
  it("not before the start, not once finished, and never when the payments couldn't be read", () => {
    expect(due(project({ start: "2026-11-30", payments: [pay(350)] }))).toBe(false);
    expect(due(project({ start: "2026-11-20", end: "2026-11-25", payments: [pay(350)] }))).toBe(false);
    expect(due(project({ start: TODAY, payments: null }))).toBe(false);
  });
});

describe("where a finished project sits", () => {
  it("paid in full, ready to collect, or not ready yet, by Notion's own formula", () => {
    const done = { end: "2026-11-20", walkthrough: "Completed" };
    expect(collectGroup(project({ ...done, ready: "Ready to collect", payments: [pay(1000)] }), projectPlan(contract, project({ payments: [pay(1000)] })))).toBe("paid");
    const part = project({ ...done, ready: "Ready to collect", payments: [pay(700)] });
    expect(collectGroup(part, projectPlan(contract, part))).toBe("ready");
    const open = project({ ...done, ready: "Not submitted", payments: [pay(700)] });
    expect(collectGroup(open, projectPlan(contract, open))).toBe("waiting");
  });
  it("a project won outside the app follows Notion's Value Approx, with no stages", () => {
    const p = project({ valueApprox: 800, payments: [pay(300)] });
    expect(projectPlan({ total: null, stages: [] }, p)).toMatchObject({ total: 800, balance: 500, stages: [] });
    expect(projectPlan({ total: null, stages: [] }, project())).toBeNull();
  });
});

describe("the words", () => {
  it("work orders and walkthrough", () => {
    expect(workOrderWords([])).toEqual({ text: "None", open: false });
    expect(workOrderWords(["Done", "Dropped", "Sending...."])).toEqual({ text: "1 open · 2 done", open: true });
    expect(walkthroughWords("None").text).toBe("Not needed");
    expect(walkthroughWords("In progress [Auto]").tone).toBe("warn");
  });
});
