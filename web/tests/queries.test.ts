import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, activeFilterCount, filtersFromSearchParams, filtersToArgs, filtersToSearchParams } from "../src/lib/db/filters";
import storageImageLoader, { variantFor } from "../src/lib/image-loader";

describe("filters ⇄ URL", () => {
  it("round-trips every field", () => {
    const f = {
      ...EMPTY_FILTERS,
      q: "6in click",
      supplier: ["VIDAR", "GRANDEUR"],
      category: ["LVP"],
      min: 2.5,
      max: 4,
      waterproof: true,
      hide: true,
      undertone: ["Warm"],
      tone_min: 1,
      tone_max: 3,
      style: ["Modern", "Coastal"],
    };
    const params = filtersToSearchParams(f);
    expect(params.getAll("supplier")).toEqual(["VIDAR", "GRANDEUR"]);
    expect(params.get("waterproof")).toBe("1");
    expect(params.get("radiant")).toBeNull();
    expect(filtersFromSearchParams(params)).toEqual(f);
  });

  it("ignores garbage numbers and unknown keys", () => {
    const p = new URLSearchParams("q=oak&min=abc&tone_max=9&bogus=1");
    const f = filtersFromSearchParams(p);
    expect(f.q).toBe("oak");
    expect(f.min).toBeNull();
    expect(f.tone_max).toBeNull(); // out of range → whole parse falls back to defaults
  });

  it("maps to RPC args with nulls for empty lists and page offsets", () => {
    const args = filtersToArgs({ ...EMPTY_FILTERS, q: "x", category: ["LVP"], pet: true, max: 4 }, 2, 30);
    expect(args).toMatchObject({ q: "x", f_category: ["LVP"], f_supplier: null, f_pet: true, f_waterproof: null, f_price_max: 4, lim: 30, off: 60 });
  });

  it("counts active filters", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, supplier: ["A", "B"], hide: true, min: 1 })).toBe(4);
  });
});

describe("image loader", () => {
  it("picks the smallest variant that covers the width", () => {
    expect(variantFor(80)).toBe(200);
    expect(variantFor(200)).toBe(200);
    expect(variantFor(201)).toBe(600);
    expect(variantFor(1200)).toBe(1600);
    expect(variantFor(4000)).toBe(1600);
  });

  it("rewrites the size suffix and keeps the cache-busting version", () => {
    const src = "https://x.supabase.co/storage/v1/object/public/catalogue-images/ENG-VIDR-0042/abc_1600.webp?v=3";
    expect(storageImageLoader({ src, width: 96 })).toBe("https://x.supabase.co/storage/v1/object/public/catalogue-images/ENG-VIDR-0042/abc_200.webp?v=3");
    expect(storageImageLoader({ src, width: 640 })).toMatch(/_1600\.webp\?v=3$/);
    expect(storageImageLoader({ src: "https://elsewhere/x.png", width: 100 })).toBe("https://elsewhere/x.png");
  });
});
