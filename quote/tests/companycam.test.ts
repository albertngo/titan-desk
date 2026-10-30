import { describe, expect, it } from "vitest";
import { byDay, projectIdOf, toPhoto, toPhotos, toProject } from "../src/lib/companycam/photos";

// INVENTED photos only: this repo is public.
const uris = (prefix: string, annotated = false) => [
  { type: "original", uri: `https://img.example.com/${prefix}/o.jpg` },
  { type: "web", uri: `https://img.example.com/${prefix}/w.jpg` },
  { type: "thumbnail", uri: `https://img.example.com/${prefix}/t.jpg` },
  ...(annotated
    ? [
        { type: "original_annotation", uri: `https://img.example.com/${prefix}/oa.jpg` },
        { type: "web_annotation", uri: `https://img.example.com/${prefix}/wa.jpg` },
        { type: "thumbnail_annotation", uri: `https://img.example.com/${prefix}/ta.jpg` },
      ]
    : []),
];
const raw = (o: Record<string, unknown> = {}) => ({
  id: 1001,
  creator_name: "Pat Example",
  description: "Main stairs, left side open",
  captured_at: 1793300000,
  created_at: 1793300500,
  processing_status: "processed",
  photo_url: "https://app.companycam.com/photos/1001",
  uris: uris("a"),
  ...o,
});

describe("CompanyCam links", () => {
  it("reads the project id from the link Make writes, and nothing else", () => {
    expect(projectIdOf("https://app.companycam.com/projects/12345678")).toBe("12345678");
    expect(projectIdOf("https://app.companycam.com/projects/12345678/photos?x=1")).toBe("12345678");
    expect(projectIdOf(" https://app.companycam.com/projects/42 ")).toBe("42");
    for (const bad of [null, "", "http://app.companycam.com/projects/1", "https://app.companycam.com/projects/abc", "https://evil.example.com/projects/1", "https://app.companycam.com/projects/1@evil.example.com"]) {
      expect(projectIdOf(bad)).toBeNull();
    }
  });
});

describe("CompanyCam photos", () => {
  it("keeps the time taken, who, the description and three sizes", () => {
    expect(toPhoto(raw())).toEqual({
      id: "1001",
      at: new Date(1793300000 * 1000).toISOString(),
      by: "Pat Example",
      description: "Main stairs, left side open",
      tags: [],
      thumb: "https://img.example.com/a/t.jpg",
      web: "https://img.example.com/a/w.jpg",
      full: "https://img.example.com/a/o.jpg",
      annotated: false,
      pageUrl: "https://app.companycam.com/photos/1001",
    });
  });

  it("shows the marked-up copy when there is one", () => {
    const p = toPhoto(raw({ uris: uris("b", true) }))!;
    expect(p.annotated).toBe(true);
    expect([p.thumb, p.web, p.full]).toEqual(["https://img.example.com/b/ta.jpg", "https://img.example.com/b/wa.jpg", "https://img.example.com/b/oa.jpg"]);
  });

  it("falls back to the upload time, and to no time at all", () => {
    expect(toPhoto(raw({ captured_at: null }))!.at).toBe(new Date(1793300500 * 1000).toISOString());
    expect(toPhoto(raw({ captured_at: null, created_at: null }))!.at).toBeNull();
  });

  it("leaves out a photo with no https picture, a failed one and a duplicate", () => {
    expect(toPhoto(raw({ uris: [{ type: "web", uri: "http://img.example.com/x.jpg" }] }))).toBeNull();
    expect(toPhoto(raw({ processing_status: "processing_error" }))).toBeNull();
    expect(toPhoto(raw({ processing_status: "duplicate" }))).toBeNull();
    expect(toPhoto(null)).toBeNull();
    expect(toPhotos([raw(), "junk", raw({ id: 1002, uris: [] })]).map((p) => p.id)).toEqual(["1001"]);
    expect(toPhotos({ not: "a list" })).toEqual([]);
  });

  it("reads tags when CompanyCam includes them", () => {
    expect(toPhoto(raw({ tags: [{ display_value: "Stairs" }, { value: "measure" }, "Before", {}] }))!.tags).toEqual(["Stairs", "measure", "Before"]);
  });

  it("groups by Toronto day, newest first, undated last, each photo once", () => {
    const at = (iso: string, id: number) => toPhoto(raw({ id, captured_at: Date.parse(iso) / 1000 }))!;
    const undated = toPhoto(raw({ id: 9, captured_at: null, created_at: null }))!;
    // 02:00 UTC on Oct 30 is still Oct 29 in Toronto.
    const photos = [at("2026-10-29T15:00:00Z", 1), undated, at("2026-10-30T02:00:00Z", 2), at("2026-10-30T18:00:00Z", 3), at("2026-10-30T18:00:00Z", 3)];
    const days = byDay(photos, new Date("2026-10-30T20:00:00Z"));
    expect(days.map((d) => [d.day, d.photos.map((p) => p.id)])).toEqual([
      ["2026-10-30", ["3"]],
      ["2026-10-29", ["2", "1"]],
      ["", ["9"]],
    ]);
    expect(days[0].label).toBe("Friday, October 30");
    expect(days[2].label).toBe("Date unknown");
    expect(byDay([at("2025-06-01T15:00:00Z", 4)], new Date("2026-10-30T20:00:00Z"))[0].label).toMatch(/2025/);
  });

  it("reads the project header", () => {
    const url = "https://app.companycam.com/projects/42";
    expect(toProject({ id: 42, name: "Pat Example - 1026 - Q-1000", address: { street_address_1: "1 Example St", city: "Toronto", state: "ON" } }, url)).toEqual({
      id: "42",
      name: "Pat Example - 1026 - Q-1000",
      address: "1 Example St, Toronto, ON",
      url,
    });
    expect(toProject(null, url)).toBeNull();
  });
});
