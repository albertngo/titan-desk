import { describe, expect, it } from "vitest";
import { addChoices, sectionLinesInOrder, stairGroupLabel, stairGroups, stairSections } from "../src/lib/editor/stairGroups";

/* Invented lines only. */

const l = (id: string, stairCategory: string | null) => ({ id, stairCategory });

describe("the Stairs section grouped by Stair Item category (2026-10-28)", () => {
  it("puts the groups in work order, keeps each group's own order, and labels them", () => {
    const g = stairGroups([l("post", "railing"), l("riser", "riser"), l("step1", "step"), l("nosing", "accent"), l("step2", "step"), l("paint", "task"), l("typed", null), l("landing", "landing")]);
    expect(g.map((x) => [x.group, x.lines.map((y) => y.id)])).toEqual([
      ["step", ["step1", "step2"]],
      ["riser", ["riser"]],
      ["landing", ["landing"]],
      ["accent", ["nosing"]],
      ["railing", ["post"]],
      ["task", ["paint"]],
      [null, ["typed"]],
    ]);
    expect(g.map((x) => stairGroupLabel(x.group))).toEqual(["Steps", "Risers", "Landings", "Accents", "Railing", "Tasks", "Other"]);
  });

  it("shows no headings when no line has a category, and leaves other sections alone", () => {
    expect(stairGroups([l("a", null), l("b", null)])).toEqual([{ group: null, heading: false, lines: [l("a", null), l("b", null)] }]);
    expect(sectionLinesInOrder("Install", [l("b", "task"), l("a", "step")]).map((x) => x.id)).toEqual(["b", "a"]);
    expect(sectionLinesInOrder("Stairs", [l("b", "task"), l("a", "step")]).map((x) => x.id)).toEqual(["a", "b"]);
    expect(stairGroupLabel("Trim")).toBe("Trim");
  });
});

describe("what an option can add (2026-10-30)", () => {
  const sections = ["Install", "Stairs", "Removal", "Disposal", "Prep", "Materials", "Delivery", "Other", "Private"];
  it("a stairs option: the builder, the Stair Item categories in work order, a typed line, and Private (stair items only)", () => {
    const c = addChoices("Stairs", ["Railing", "Step", null, "Riser", "step", "Weird"], sections);
    expect(c.map((x) => x.label)).toEqual(["Staircase", "Steps", "Risers", "Railing", "Weird", "Typed line", "Private"]);
    expect(c.find((x) => x.label === "Steps")).toEqual({ label: "Steps", section: "Stairs", category: "step" });
    expect(c.find((x) => x.label === "Typed line")?.typed).toBe(true);
    expect(c.find((x) => x.label === "Private")).toEqual({ label: "Private", section: "Private", stairsOnly: true });
    // Customer view leaves Private out of the sections, and so out of the choices.
    expect(addChoices("Stairs", ["Step"], sections.filter((s) => s !== "Private")).map((x) => x.label)).toEqual(["Staircase", "Steps", "Typed line"]);
  });
  it("a flooring option: every work section but Stairs", () => {
    expect(addChoices("Flooring", ["Step"], sections).map((x) => x.section)).toEqual(["Install", "Removal", "Disposal", "Prep", "Materials", "Delivery", "Other", "Private"]);
  });
});

describe("a stairs option shows every category, even empty (2026-11-04)", () => {
  it("lists the card's categories and the lines' in work order, then Other, each with its lines", () => {
    const lines = [l("rail", "railing"), l("typed", null), l("s1", "step"), l("odd", "Stringer"), l("s2", "step")];
    const g = stairSections(lines, ["Riser", "step", null, "landing", "railing", "post"]);
    expect(g.map((x) => [x.group, x.lines.map((y) => y.id)])).toEqual([
      ["step", ["s1", "s2"]],
      ["riser", []],
      ["landing", []],
      ["railing", ["rail"]],
      ["post", []],
      ["stringer", ["odd"]],
      [null, ["typed"]],
    ]);
  });
  it("keeps the lines in the same order as the grouped quote page, so numbering agrees", () => {
    const lines = [l("rail", "railing"), l("typed", null), l("s1", "step"), l("r", "riser")];
    expect(stairSections(lines, ["step", "bullnose"]).flatMap((x) => x.lines)).toEqual(sectionLinesInOrder("Stairs", lines));
  });
  it("is just Other when the card has no categories and no line has one", () => {
    expect(stairSections([l("a", null)], [])).toEqual([{ group: null, lines: [l("a", null)] }]);
  });
});
