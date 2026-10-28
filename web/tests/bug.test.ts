import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Report a bug (2026-10-28) is the desk's only write anywhere: one Notion task per report. These
 * checks keep it that way. The report logic itself is tested in quote/tests/bug.test.ts, which also
 * fails if the two copies drift.
 */
const SRC = path.resolve(__dirname, "../src");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const all = files(SRC).map((p) => ({ rel: path.relative(SRC, p).split(path.sep).join("/"), text: readFileSync(p, "utf8") }));
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

describe("Notion boundary (Report a bug)", () => {
  it("has exactly one file that talks to Notion, and it alone reads the token", () => {
    expect(all.filter((f) => f.text.includes("api.notion.com")).map((f) => f.rel)).toEqual(["lib/bug/notion.ts"]);
    expect(all.filter((f) => f.text.includes("NOTION_BUG_TOKEN") && f.rel !== "lib/bug/notion.ts").map((f) => f.rel)).toEqual([]);
  });
  it("POSTs only, and is imported only by the bug route and the app layout, never a browser component", () => {
    const n = read("lib/bug/notion.ts");
    expect(n.match(/\bfetch\(/g)?.length).toBe(1);
    expect(n).not.toMatch(/PATCH|DELETE|"PUT"/);
    const importers = all.filter((f) => /from ["']@\/lib\/bug\/notion["']/.test(f.text));
    expect(importers.map((f) => f.rel).sort()).toEqual(["app/(app)/layout.tsx", "app/api/bug/route.ts"]);
    for (const f of importers) expect(f.text.startsWith('"use client"'), f.rel).toBe(false);
  });
  it("the route checks the signed-in session before anything else", () => {
    const r = read("app/api/bug/route.ts");
    expect(r.indexOf("getClaims()")).toBeGreaterThan(0);
    expect(r.indexOf("getClaims()")).toBeLessThan(r.indexOf("request.formData()"));
    expect(r.indexOf("getClaims()")).toBeLessThan(r.indexOf("uploadImage("));
  });
});
