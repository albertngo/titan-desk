import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { companySheets, latestSheets, sheetFor } from "@/lib/files/sheets";

describe("latestSheets", () => {
  it("offers the newest version of each kind, flooring first", () => {
    const got = latestSheets(["stair-site-sheet-v6.pdf", "stair-site-sheet-v7.pdf", "flooring-site-sheet-v1.pdf", "stair-site-sheet-v7.html", "render.js", "README.md"]);
    expect(got.map((s) => [s.kind, s.version, s.file])).toEqual([
      ["flooring", 1, "flooring-site-sheet-v1.pdf"],
      ["stair", 7, "stair-site-sheet-v7.pdf"],
    ]);
    expect(got[1].downloadName).toBe("Titan-Stair-Site-Sheet-v7.pdf");
  });

  it("compares versions as numbers, so v10 beats v9", () => {
    expect(latestSheets(["stair-site-sheet-v9.pdf", "stair-site-sheet-v10.pdf"])[0].version).toBe(10);
  });

  it("leaves out a kind with no PDF and ignores look-alikes", () => {
    expect(latestSheets(["flooring-site-sheet-v1.html", "my-stair-site-sheet-v2.pdf", "stair-site-sheet-v2.pdf.bak"])).toEqual([]);
  });
});

describe("companySheets and sheetFor", () => {
  const saved = process.env.COMPANY_SHEETS;
  afterEach(() => {
    process.env.COMPANY_SHEETS = saved;
  });

  it("reads the inlined list and serves only a known kind", () => {
    process.env.COMPANY_SHEETS = JSON.stringify(["flooring-site-sheet-v1.pdf", "stair-site-sheet-v7.pdf"]);
    expect(sheetFor("stair")?.file).toBe("stair-site-sheet-v7.pdf");
    expect(sheetFor("../package.json")).toBeNull();
    expect(sheetFor("flooring-site-sheet-v1.pdf")).toBeNull();
  });

  it("reads as none when the list is missing or broken", () => {
    process.env.COMPANY_SHEETS = "not json";
    expect(companySheets()).toEqual([]);
    delete process.env.COMPANY_SHEETS;
    expect(companySheets()).toEqual([]);
  });

  it("finds both kinds in the real sheets folder", () => {
    const got = latestSheets(readdirSync(join(__dirname, "..", "sheets")));
    expect(got.map((s) => s.kind)).toEqual(["flooring", "stair"]);
  });
});
