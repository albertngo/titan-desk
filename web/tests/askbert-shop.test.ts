import { describe, expect, it } from "vitest";
import { toProduct } from "../agents/askbert/agent/lib/query";
import { fromGroup, fromProduct, SHORTCUTS, TYPE_CHIPS } from "../src/lib/askbert-shop";
import type { SearchGroup } from "../src/lib/db/types";
import { ROW } from "./fixtures/askbert-row";

describe("askBert shop tiles", () => {
  it("builds a product tile from the catalogue tool's row: colour as title, line above, promo with its end date", () => {
    const item = fromProduct(toProduct(ROW));
    expect(item).toMatchObject({
      key: "p:ENG-VIDR-0100C",
      title: "Macaroon",
      sku: "ENG-VIDR-0100C",
      price: "$5.79 /sf",
      promo: true,
      promoNote: "Promo to Oct 18",
      flag: null,
      href: "/p/ENG-VIDR-0100C",
    });
    expect(item.line).toContain("Vidar");
    expect(item.facts).toEqual(['7.5" wide']); // not confirmed waterproof, no wear layer, stock unknown
    expect(item.ask).toContain("ENG-VIDR-0100C");
  });

  it("flags archived products and lists only confirmed stock", () => {
    const archived = fromProduct(toProduct({ ...ROW, archived: true, promo_active: false, stock_status: "In stock", waterproof_confirmed: true }));
    expect(archived).toMatchObject({ flag: "Archived", promo: false, promoNote: null });
    expect(archived.facts).toEqual(["Waterproof", '7.5" wide', "In stock"]);
  });

  it("builds one tile per promo collection, linking to its first colour", () => {
    const member = {
      sku: "LAM-PLUX-0009", product_name: 'Purelux Betten Laminate — Banwell (7.72" x 14.3mm)', brand: "Purelux",
      category: "Laminate", supplier: "PURELUX", collection: null, retail_price: 2.99, price_unit: "sf" as const,
      price_on_request: false, promo_active: true, coming_soon: false, stock_status: null,
      hero: { kind: "swatch" as const, w: 1600, h: 1600, blurhash: null, thumb: "t.webp", card: "c.webp", full: "f.webp" },
      width_in: 7.72, thickness_mm: 14.3, wear_layer_mil: null, install_profile: "Click", waterproof: true, box_size_sf: 20,
    };
    const group: SearchGroup = {
      group_key: "PURELUX|Purelux Betten Laminate", line: "Purelux Betten Laminate", brand: "Purelux", supplier: "PURELUX",
      category: "Laminate", product_count: 9, price_min: 2.99, price_max: 3.49, price_unit: "sf", any_promo: true,
      width_in: 7.72, thickness_mm: 14.3, wear_layer_mil: null, install_profile: "Click", waterproof: true,
      members: [member], total_groups: 4, total_products: 30, rank: 0, parsed: {} as SearchGroup["parsed"],
    } as SearchGroup;
    const item = fromGroup(group);
    expect(item).toMatchObject({
      title: "Purelux Betten Laminate",
      image: "c.webp",
      price: "$2.99–$3.49 /sf",
      promo: true,
      href: "/p/LAM-PLUX-0009",
      sku: null,
    });
    expect(item.facts).toEqual(["9 colours", "Waterproof", '7.72" wide']);
  });
});

describe("askBert quick questions", () => {
  it("has unique shortcuts; the ones that need a product leave the box open for it", () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
    for (const s of SHORTCUTS) if (s.mode === "fill") expect(s.prompt.endsWith(" ")).toBe(true);
    expect(SHORTCUTS[0].id).toBe("promo");
  });

  it("asks per product type", () => {
    expect(TYPE_CHIPS.map((t) => t.label)).toContain("Vinyl");
    expect(TYPE_CHIPS[0].prompt).toBe("What vinyl is on promo or in stock right now?");
  });
});
