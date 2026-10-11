import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural rules for the quoting app, checked on the source text so a mistake fails CI
 * before it can ever deploy. See quote/CLAUDE.md.
 */

const SRC = path.resolve(__dirname, "../src");
const CLIENT = "lib/airtable/client.ts";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const all = files(SRC).map((p) => ({ rel: path.relative(SRC, p).split(path.sep).join("/"), text: readFileSync(p, "utf8") }));
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("Airtable boundary", () => {
  it("has exactly one file that talks to Airtable", () => {
    const callers = all.filter((f) => code(f.text).includes("api.airtable.com")).map((f) => f.rel);
    expect(callers).toEqual([CLIENT]);
  });

  it("reads the Airtable token in that file only", () => {
    const readers = all.filter((f) => code(f.text).includes("QUOTE_AIRTABLE_TOKEN")).map((f) => f.rel);
    expect(readers).toEqual([CLIENT]);
  });

  it("is read-only in milestone 1: no write verb in the Airtable client", () => {
    const client = code(all.find((f) => f.rel === CLIENT)!.text);
    for (const verb of ["POST", "PATCH", "PUT", "DELETE"]) expect(client).not.toMatch(new RegExp(`["'\`]${verb}["'\`]`));
  });

  it("keeps the client, the loaders and the auth check server-only", () => {
    for (const rel of [CLIENT, "lib/quotes/load.ts", "lib/auth.ts"]) {
      expect(all.find((f) => f.rel === rel)!.text).toMatch(/^import "server-only";/m);
    }
  });

  it("never imports Airtable code into a browser component", () => {
    const leaks = all
      .filter((f) => /^["']use client["'];?/m.test(f.text))
      .filter((f) => /from ["']@\/lib\/(airtable|quotes\/load|auth)/.test(f.text))
      .map((f) => f.rel);
    expect(leaks).toEqual([]);
  });

  it("never exposes an Airtable setting to the browser", () => {
    expect(all.filter((f) => /NEXT_PUBLIC_[A-Z_]*AIRTABLE/.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("checks the quoter allowlist in both the proxy and every loader", () => {
    expect(all.find((f) => f.rel === "proxy.ts")!.text).toContain("isQuoter(");
    const load = all.find((f) => f.rel === "lib/quotes/load.ts")!.text;
    const exported = load.match(/export async function \w+/g) ?? [];
    const guarded = load.match(/export async function \w+[^{]*\{\s*await requireQuoter\(\);/g) ?? [];
    expect(exported.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(exported.length);
  });
});
