import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUG, bugTitle, checkReport, deviceOf, pageOf, taskBody, type BugReport } from "../src/lib/bug/report";

// INVENTED people only: this repo is public.
const img = (size = 1000, type = "image/jpeg") => ({ size, type });
const report = (o: Partial<BugReport> = {}): BugReport => ({
  app: "Quotes",
  summary: "Save does nothing on the Rooms tab",
  urgency: "blocking",
  page: "https://quotes.example.com/q/rec123",
  reporter: { email: "sam@example.com", name: "Sam Lee" },
  at: new Date("2026-10-28T14:05:00Z"),
  device: "iPhone · Safari",
  screen: "390×844",
  ...o,
});

describe("checkReport", () => {
  it("accepts a summary, an urgency and a few screenshots", () => {
    expect(checkReport({ summary: "Search is empty", urgency: "minor", images: [img(), img()] })).toBeNull();
  });
  it("needs a summary and an urgency", () => {
    expect(checkReport({ summary: "  ", urgency: "minor", images: [] })).toMatch(/few words/);
    expect(checkReport({ summary: "x".repeat(BUG.summaryMax + 1), urgency: "minor", images: [] })).toMatch(/under/);
    expect(checkReport({ summary: "Broken", urgency: "whenever", images: [] })).toMatch(/urgent/);
  });
  it("caps screenshots by count, kind and total size", () => {
    expect(checkReport({ summary: "Broken", urgency: "minor", images: Array.from({ length: BUG.maxImages + 1 }, () => img()) })).toMatch(/Up to/);
    expect(checkReport({ summary: "Broken", urgency: "minor", images: [img(10, "application/pdf")] })).toMatch(/images/);
    expect(checkReport({ summary: "Broken", urgency: "minor", images: [img(BUG.maxTotalBytes), img(1)] })).toMatch(/too big/);
  });
});

describe("the task", () => {
  it("is titled BUG FIX: Desk App (<app>) <summary>", () => {
    expect(bugTitle("Catalogue", "  Search\nis empty ")).toBe("BUG FIX: Desk App (Catalogue) Search is empty");
  });
  it("goes to Albert, not started, with the urgency as its priority and the page as its url", () => {
    const b = taskBody(report(), [], 0);
    expect(b.parent.database_id).toBe(BUG.database);
    expect(b.properties.Name.title[0].text.content).toBe("BUG FIX: Desk App (Quotes) Save does nothing on the Rooms tab");
    expect(b.properties["Assign To"].people).toEqual([{ id: BUG.assignee }]);
    expect(b.properties.Status.status.name).toBe("Not started");
    expect(b.properties.Priority.select.name).toBe("high");
    expect(taskBody(report({ urgency: "minor" }), [], 0).properties.Priority.select.name).toBe("low");
    expect(b.properties.url).toEqual({ url: "https://quotes.example.com/q/rec123" });
    expect(JSON.stringify(b.properties.Notes)).toContain("Sam Lee (sam@example.com)");
  });
  it("puts the screenshots on the page and says when one didn't upload", () => {
    const b = taskBody(report(), ["up1", "up2"], 1);
    const images = b.children.filter((c) => c.type === "image");
    expect(images.map((c) => (c as { image: { file_upload: { id: string } } }).image.file_upload.id)).toEqual(["up1", "up2"]);
    expect(JSON.stringify(b.children)).toContain("1 screenshot could not be uploaded");
    expect(taskBody(report(), [], 0).children.some((c) => c.type === "heading_3")).toBe(false);
  });
  it("writes the details as the page, with the page as a link", () => {
    const s = JSON.stringify(taskBody(report(), [], 0).children);
    for (const w of ["Reported by", "When", "How urgent", "Blocking my work", "iPhone · Safari", "390×844"]) expect(s).toContain(w);
    expect(s).toContain('"link":{"url":"https://quotes.example.com/q/rec123"}');
  });
});

describe("details", () => {
  it("names the device and browser, never the whole user agent", () => {
    expect(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(deviceOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Windows · Edge");
    expect(deviceOf(null)).toBeNull();
  });
  it("keeps the page only when it is on the app's own host", () => {
    expect(pageOf("https://quotes.example.com/q/rec123?opt=a", "quotes.example.com")).toBe("https://quotes.example.com/q/rec123?opt=a");
    expect(pageOf("https://evil.example.net/", "quotes.example.com")).toBeNull();
    expect(pageOf("javascript:alert(1)", null)).toBeNull();
    expect(pageOf(42, null)).toBeNull();
  });
});

const SRC = path.resolve(__dirname, "../src");
const WEB = path.resolve(__dirname, "../../web/src");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const all = files(SRC).map((p) => ({ rel: path.relative(SRC, p).split(path.sep).join("/"), text: readFileSync(p, "utf8") }));
const read = (root: string, rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("Notion boundary (Report a bug)", () => {
  it("has exactly one file that talks to Notion, and it alone reads the token", () => {
    expect(all.filter((f) => f.text.includes("api.notion.com")).map((f) => f.rel)).toEqual(["lib/bug/notion.ts"]);
    expect(all.filter((f) => f.text.includes("NOTION_BUG_TOKEN") && !f.rel.startsWith("lib/bug/notion")).map((f) => f.rel)).toEqual([]);
  });
  it("is server-only, POSTs only, and is reached only from the bug route and the header check", () => {
    const n = read(SRC, "lib/bug/notion.ts");
    expect(n.startsWith('import "server-only";')).toBe(true);
    expect(n.match(/\bfetch\(/g)?.length).toBe(1);
    expect(n).toMatch(/method: "POST"/);
    expect(n).not.toMatch(/PATCH|DELETE|"PUT"/);
    const importers = all.filter((f) => /from ["']@\/lib\/bug\/notion["']/.test(f.text)).map((f) => f.rel).sort();
    expect(importers).toEqual(["app/api/bug/route.ts", "components/TopBar.tsx"]);
  });
  it("the route refuses the customer deployment and anyone not on the quoter list, before reading the form", () => {
    const r = read(SRC, "app/api/bug/route.ts");
    const i = (s: string) => r.indexOf(s);
    expect(i("isCustomerDeployment()")).toBeGreaterThan(0);
    expect(i("isCustomerDeployment()")).toBeLessThan(i("isQuoter("));
    expect(i("isQuoter(")).toBeLessThan(i("request.formData()"));
  });
  it("the button shows only to staff, never in Customer view", () => {
    expect(read(SRC, "components/TopBar.tsx")).toMatch(/\{!customer && bugReportsOn\(\) && <ReportBug \/>\}/);
  });
  it("the desk carries the same report and shrink files, and the same Notion file without the server-only line", () => {
    for (const f of ["lib/bug/report.ts", "lib/bug/shrink.ts"]) expect(read(WEB, f), f).toBe(read(SRC, f));
    expect(read(WEB, "lib/bug/notion.ts")).toBe(read(SRC, "lib/bug/notion.ts").replace('import "server-only";\n\n', ""));
  });
});
