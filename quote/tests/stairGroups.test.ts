import { describe, expect, it } from "vitest";
import { sectionLinesInOrder, stairGroupLabel, stairGroups } from "../src/lib/editor/stairGroups";

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
