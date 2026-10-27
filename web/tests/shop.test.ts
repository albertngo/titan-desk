import { describe, expect, it } from "vitest";
import { fromHit } from "../src/lib/shop";
import type { SearchHit } from "../src/lib/db/types";

const hit = (o: Partial<SearchHit> = {}): SearchHit => ({
  sku: "LVP-PLUX-0043", product_name: 'Purelux Journey SPC — Hansel (7.2" x 6.5mm)', brand: "Purelux", category: "LVP",
  supplier: "PURELUX", retail_price: 2.79, price_unit: "sf", price_on_request: false, promo_active: false, coming_soon: false,
  stock_status: null, hero: { kind: "swatch", w: 1600, h: 1600, blurhash: null, thumb: "t.webp", card: "c.webp", full: "f.webp" },
  total_count: 1, rank: 0, parsed: {} as SearchHit["parsed"], collection: null, width_in: 7.2, thickness_mm: 6.5,
  wear_layer_mil: 20, install_profile: "Click", waterproof: true, box_size_sf: 23, ...o,
});

describe("search result tiles", () => {
  it("shows the colour as the title, the line above, the card-size photo and the specs that sell it", () => {
    expect(fromHit(hit())).toMatchObject({
      key: "h:LVP-PLUX-0043", title: "Hansel", line: "Purelux Journey SPC", sku: "LVP-PLUX-0043",
      image: "c.webp", price: "$2.79 /sf", promo: false, promoNote: null, flag: null,
      facts: ["Waterproof", '7.2" wide', "20 mil"], href: "/p/LVP-PLUX-0043",
    });
  });

  it("flags promos, coming-soon and discontinued; lists only confirmed stock", () => {
    expect(fromHit(hit({ promo_active: true })).promoNote).toBe("On promo");
    expect(fromHit(hit({ coming_soon: true })).flag).toBe("Coming soon");
    expect(fromHit(hit({ stock_status: "Discontinued" })).flag).toBe("Discontinued");
    expect(fromHit(hit({ stock_status: "Low stock" })).facts).toContain("Low stock");
    expect(fromHit(hit({ stock_status: "Special order" })).facts).not.toContain("Special order");
  });

  it("falls back to the thumbnail, then to no photo", () => {
    expect(fromHit(hit({ hero: { kind: "swatch", w: null, h: null, blurhash: null, thumb: "t.webp", card: null, full: null } })).image).toBe("t.webp");
    expect(fromHit(hit({ hero: null })).image).toBeNull();
  });
});
