import { describe, expect, it } from "vitest";
import { buildInfo, builtLabel, commitUrl, parseCommitMessage, prUrl } from "../src/lib/build";

describe("build line", () => {
  it("reads a GitHub merge commit as its PR number and the PR title from the body", () => {
    expect(parseCommitMessage("Merge pull request #137 from someone/some-branch\n\nquote: a change\n\nmore")).toEqual({ pr: 137, title: "quote: a change" });
  });

  it("reads a squash merge's (#n) and a plain commit's subject", () => {
    expect(parseCommitMessage("web: a fix (#42)\n\nbody")).toEqual({ pr: 42, title: "web: a fix" });
    expect(parseCommitMessage("quote: direct commit\n\nbody")).toEqual({ pr: null, title: "quote: direct commit" });
    expect(parseCommitMessage("Merge pull request #9 from a/b")).toEqual({ pr: 9, title: "" });
    expect(parseCommitMessage("")).toEqual({ pr: null, title: "" });
  });

  it("shows nothing when the build was stamped with nothing", () => {
    expect(buildInfo({})).toBeNull();
    expect(buildInfo({ sha: " ", time: "" })).toBeNull();
  });

  it("links the commit and the PR", () => {
    const b = buildInfo({ sha: "0123456789abcdef", message: "Merge pull request #5 from a/b\n\nT", time: "2026-11-03T21:12:00.000Z" })!;
    expect(b.short).toBe("0123456");
    expect(commitUrl(b)).toBe("https://github.com/albertngo/titan-desk/commit/0123456789abcdef");
    expect(prUrl(b)).toBe("https://github.com/albertngo/titan-desk/pull/5");
    expect(prUrl({ ...b, pr: null })).toBeNull();
    expect(commitUrl({ ...b, sha: "" })).toBeNull();
  });

  it("gives the built time in Toronto, whatever the server's zone", () => {
    // 21:12 UTC on 2026-11-03 is 4:12 pm in Toronto (EST).
    const label = builtLabel("2026-11-03T21:12:00.000Z");
    expect(label).toContain("Nov");
    expect(label).toContain("3");
    expect(label).toMatch(/4:12/);
    expect(builtLabel("not a date")).toBe("");
  });
});
