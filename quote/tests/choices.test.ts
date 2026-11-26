import { describe, expect, it } from "vitest";
import { addLine, blankQuote, manualLine, productLine, updateLine, type EditorQuote } from "../src/lib/editor/model";
import { addChoice, choiceLabel, choicesOf, isFollower, removeChoice, roundChoices, showFirst, startChoices, syncChoices } from "../src/lib/editor/choices";
import { optionTotals } from "../src/lib/calc";

/* Invented products and prices only (quote/CLAUDE.md rule 4). Vault 05_decisions/2026-11-26-quote-flooring-choices. */

const product = (sku: string, name: string, rate: number) => productLine({ recordId: `rec${sku.padEnd(14, "0")}`, sku, name, rate, cost: rate / 2, boxSf: 20 });

function quote(): { q: EditorQuote; lead: string; floor: string } {
  let q = blankQuote();
  const lead = q.options[0].id;
  q = addLine(q, lead, { ...manualLine("Install", "Install, click lock"), qty: 600, unitPrice: 2.5 });
  q = addLine(q, lead, { ...product("LAM-1", "Laminate A", 3.49), qty: 600, waste: 0.1 });
  const floor = q.options[0].lines[1].id;
  return { q: startChoices(q, lead, floor), lead, floor };
}

describe("flooring choices (2026-11-26)", () => {
  it("adds a flooring as an option that shares everything but the flooring line", () => {
    const { q: q0, lead } = quote();
    const q = addChoice(q0, lead, product("SPC-1", "Vinyl B", 4.29));
    const [a, b] = choicesOf(q, q.options[0]);
    expect(b.choiceGroup).toBe(a.choiceGroup);
    expect(isFollower(q, b)).toBe(true);
    expect(choiceLabel(b)).toMatch(/^Vinyl B/);
    expect(b.lines.map((l) => l.description)[0]).toBe("Install, click lock");
    // The same square feet and waste; its own price.
    expect([b.lines[1].qty, b.lines[1].waste]).toEqual([600, 0.1]);
    expect(optionTotals(b.lines, 0, true).total).toBeGreaterThan(optionTotals(a.lines, 0, true).total);
  });

  it("an edit to a shared line, or new square feet, reaches every flooring", () => {
    const { q: q0, lead, floor } = quote();
    const q1 = addChoice(q0, lead, product("SPC-1", "Vinyl B", 4.29));
    const install = q1.options[0].lines[0].id;
    const q2 = syncChoices(q1, updateLine(q1, lead, install, { unitPrice: 3 }));
    expect(q2.options[1].lines[0].unitPrice).toBe(3);
    // Its line ids stay its own, so a save updates rather than recreates them.
    expect(q2.options[1].lines[0].id).toBe(q1.options[1].lines[0].id);
    const q3 = syncChoices(q2, updateLine(q2, lead, floor, { qty: 650, waste: 0.15 }));
    expect([q3.options[1].lines[1].qty, q3.options[1].lines[1].waste]).toEqual([650, 0.15]);
  });

  it("rounds each flooring to its own whole boxes, and a rounding leaves the others alone", () => {
    const { q: q0, lead } = quote();
    const q1 = addChoice(q0, lead, product("SPC-1", "Vinyl B", 4.29));
    const b = q1.options[1];
    const boxSf = { [q1.options[0].lines[1].sourceId!]: 25, [b.lines[1].sourceId!]: 20 };
    const r = roundChoices(q1, [lead], boxSf);
    const q2 = syncChoices(q1, r, true);
    // 600 sf + 10% = 660 sf = 26.4 boxes of 25: up to 27 boxes, 675 sf, so 613.64 sf before waste.
    expect(q2.options[0].lines[1].qty).toBe(613.64);
    expect(q2.options[1].lines[1].qty).toBe(600);
  });

  it("shows another flooring first, and comes apart when one is left", () => {
    const { q: q0, lead } = quote();
    const q1 = addChoice(q0, lead, product("SPC-1", "Vinyl B", 4.29));
    const b = q1.options[1].id;
    const q2 = showFirst(q1, b);
    expect(q2.options[0].id).toBe(b);
    expect(isFollower(q2, q2.options[1])).toBe(true);
    const q3 = removeChoice(q2, q2.options[1].id);
    expect(q3.options).toHaveLength(1);
    expect(q3.options[0].choiceGroup).toBeUndefined();
    expect(q3.options[0].lines.some((l) => l.choiceLine)).toBe(false);
  });
});
