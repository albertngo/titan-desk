import { describe, expect, it } from "vitest";
import { kindOf, liveDocs, savedOn, type DocRow } from "@/lib/files/docs";

const AT = "https://v5.airtableusercontent.com/x/";
const NOW = Date.parse("2026-11-24T15:00:00Z");
const row = (fileName: string, modifiedAt: string, extra: Partial<DocRow> = {}): DocRow => ({
  id: `rec${fileName.length}`,
  fileName,
  modifiedAt,
  pdfUrl: `${AT}${encodeURIComponent(fileName)}`,
  hidden: false,
  ...extra,
});

describe("kindOf", () => {
  it("tells the known documents by their file names, whatever the case", () => {
    expect(kindOf("Titan_Flooring_Labor_Warranty.docx")).toBe("warranty");
    expect(kindOf("commercial policy 2026-2027.pdf")).toBe("insurance");
    expect(kindOf("renewal auto policy till Nov 21 2026.pdf")).toBe("auto");
    expect(kindOf("WSIBClearanceCertificate - Feb 2027.pdf")).toBe("wsib");
  });

  it("gives any other file an address of letters, digits and dashes only", () => {
    expect(kindOf("Bond Letter (signed).PDF")).toBe("doc-bond-letter-signed");
    expect(kindOf("../../etc/passwd")).toBe("doc-etc-passwd");
    expect(kindOf("автомобиль")).toBe("doc-file");
  });
});

describe("liveDocs", () => {
  it("offers the newest save of each document, Project Expectations first, then the known order", () => {
    const got = liveDocs(
      [
        row("WSIBClearanceCertificate - Nov 2026.pdf", "2026-08-28T08:20:54.000Z"),
        row("WSIBClearanceCertificate - Feb 2027.pdf", "2026-11-23T21:39:39.000Z"),
        row("commercial policy 2026-2027.pdf", "2026-03-04T04:30:02.000Z"),
        row("Titan_Flooring_Labor_Warranty.docx", "2026-11-23T04:52:26.000Z"),
      ],
      { modifiedAt: "2026-11-23T12:00:00Z", pdfUrl: `${AT}terms` },
      NOW,
    );
    expect(got.map((d) => [d.kind, d.chip])).toEqual([
      ["expectations", "Nov 23"],
      ["warranty", "Nov 22"],
      ["insurance", "Mar 3"],
      ["wsib", "Nov 23"],
    ]);
    expect(got.find((d) => d.kind === "wsib")?.pdfUrl).toContain("Feb%202027");
    expect(got[1].downloadName).toBe("Titan-Installation-Labor-Warranty-2026-11-22.pdf");
    expect(got.every((d) => d.group === "Warranty, insurance & terms")).toBe(true);
  });

  it("skips a Hidden row, a row with no PDF yet and a row with no date, falling back to the next newest", () => {
    const got = liveDocs(
      [
        row("WSIB - old.pdf", "2026-01-01T12:00:00.000Z"),
        row("WSIB - new.pdf", "2026-06-01T12:00:00.000Z", { hidden: true }),
        row("auto policy.pdf", "2026-06-01T12:00:00.000Z", { pdfUrl: null }),
        row("commercial.pdf", "not a date"),
      ],
      null,
      NOW,
    );
    expect(got.map((d) => [d.kind, d.chip])).toEqual([["wsib", "Jan 1"]]);
  });

  it("offers any other file under its own name, after the known ones", () => {
    const got = liveDocs([row("Bond Letter.pdf", "2026-05-05T12:00:00.000Z"), row("Labor Warranty.docx", "2026-05-01T12:00:00.000Z")], null);
    expect(got.map((d) => [d.kind, d.title, d.downloadName])).toEqual([
      ["warranty", "Installation Labor Warranty", "Titan-Installation-Labor-Warranty-2026-05-01.pdf"],
      ["doc-bond-letter", "Bond Letter", "Titan-Bond-Letter-2026-05-05.pdf"],
    ]);
  });

  it("shows nothing when there is nothing", () => {
    expect(liveDocs([], null)).toEqual([]);
  });
});

describe("savedOn", () => {
  it("reads the day in Toronto: month and day this year, month and year before", () => {
    expect(savedOn("2026-11-23T04:52:26.000Z", NOW)).toBe("Nov 22");
    expect(savedOn("2025-03-04T04:30:02.000Z", NOW)).toBe("Mar 2025");
    expect(savedOn("nope", NOW)).toBeNull();
  });
});
