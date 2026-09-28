import { describe, expect, it } from "vitest";
import { FILTER_NAMES, activeFilters, bindArgs, likePattern, toProduct, toRelaxations, type CatalogueRow } from "../agents/askbert/agent/lib/query";
import { ROW } from "./fixtures/askbert-row";

const BASE = { price_unit: "sf", availability: "any", sort: "relevance", limit: 5 } as const;


describe("askBert search arguments", () => {
  it("binds validated input to the function's named arguments", () => {
    const a = bindArgs({ ...BASE, keyword: "macaroon", price_max: 5, requires: ["waterproof"], suppliers: ["vidar"] });
    expect(a.p_kw).toBe("macaroon");
    expect(a.p_kw_like).toBe("%macaroon%");
    expect(a.p_pmax).toBe(5);
    expect(a.p_req_wp).toBe(true);
    expect(a.p_req_rad).toBe(false);
    expect(a.p_sups).toEqual(["VIDAR"]);
    expect(Object.keys(a).every((k) => k.startsWith("p_"))).toBe(true);
  });

  it("escapes LIKE metacharacters so input stays literal", () => {
    expect(likePattern("50%_off\\x")).toBe("%50\\%\\_off\\\\x%");
    expect(likePattern("Click", "prefix")).toBe("Click%");
  });

  it("caps the row limit at 10 whatever it is given", () => {
    expect(bindArgs({ ...BASE, limit: 500 } as never).p_lim).toBe(10);
  });

  it("names only the filters the model used", () => {
    expect([...activeFilters({ ...BASE, keyword: "oak", price_max: 5 })]).toEqual(["keyword", "price"]);
    expect(toRelaxations({ keyword: 4, price: 0, sku: 99 }, new Set(["keyword", "price"]))).toEqual([{ drop: "keyword", would_match: 4 }]);
    expect(FILTER_NAMES).toHaveLength(16);
  });
});

describe("askBert product output", () => {
  it("maps a row key by key, with staff pricing, and says 'not confirmed' instead of no", () => {
    const p = toProduct(ROW);
    expect(p.cost).toBe(4.79);
    expect(p.promo_cost).toBe(4.29);
    expect(p.rep_cost).toBeNull();
    expect(p.waterproof).toBe("not confirmed");
    expect(p.radiant_heat).toBe("yes");
    expect(p.stock).toBe("not confirmed");
    expect(p.price).toEqual({ amount: 5.79, unit: "sf", on_request: false });
    expect(p.url).toBe("/p/ENG-VIDR-0100C");
    expect(p.salesperson_notes?.length).toBe(300);
  });

  it("ignores anything extra on the row", () => {
    const p = toProduct({ ...ROW, airtable_record_id: "recXYZ" } as CatalogueRow);
    expect(JSON.stringify(p)).not.toMatch(/recXYZ/);
  });

  it("flags archived and discontinued products; shows rep cost only while active", () => {
    expect(toProduct({ ...ROW, archived: true }).status).toBe("archived");
    expect(toProduct({ ...ROW, stock_status: "Discontinued" }).status).toBe("discontinued");
    expect(toProduct({ ...ROW, promo_active: false }).promo_ends).toBeNull();
    expect(toProduct({ ...ROW, price_on_request: true }).price.amount).toBeNull();
    expect(toProduct({ ...ROW, rep_cost_active: true, rep_cost: 3.9, rep_cost_end_date: null }).rep_cost).toEqual({ amount: 3.9, until: null, note: null });
  });
});
