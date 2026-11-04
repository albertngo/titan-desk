import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { noEmDash } from "../src/lib/send/copy";

// Albert, 2026-11-04: "There should be NO em-dashes on any of the wordings from anywhere."
const EM = "—";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("no em dashes (2026-11-04)", () => {
  it("appear nowhere in the app's source, words or comments", () => {
    // pdfDoc.ts maps the character for the PDF's font encoding; it writes no words.
    const hits = files(path.resolve(__dirname, "../src"))
      .filter((f) => /\.(ts|tsx|css)$/.test(f) && !f.endsWith(`${path.sep}pdfDoc.ts`))
      .flatMap((f) => readFileSync(f, "utf8").split("\n").map((line, i) => (line.includes(EM) ? `${path.relative(path.resolve(__dirname, ".."), f)}:${i + 1}` : null)))
      .filter(Boolean);
    expect(hits).toEqual([]);
  });

  it("are taken out of words typed into Airtable before a customer sees them", () => {
    expect(noEmDash(`Oak plank ${EM} natural`)).toBe("Oak plank, natural");
    expect(noEmDash(`5${EM}7 days`)).toBe("5-7 days");
    expect(noEmDash(`Removal ${EM}`)).toBe("Removal");
    expect(noEmDash(`${EM} by others`)).toBe("by others");
    expect(noEmDash("No dash here")).toBe("No dash here");
  });
});
