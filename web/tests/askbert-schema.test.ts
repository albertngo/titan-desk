import { describe, expect, it } from "vitest";
import { toProduct } from "../agents/askbert/agent/lib/query";
import { ROW } from "./fixtures/askbert-row";
import { PRODUCT_KEYS, productOut, queryInput } from "../agents/askbert/agent/lib/schema";

describe("askBert tool schema", () => {
  it("rejects fields the tool does not offer", () => {
    expect(queryInput.safeParse({ keyword: "oak", write: true }).success).toBe(false);
    expect(queryInput.safeParse({ include: ["cost"] }).success).toBe(false);
  });

  it("caps the limit at 10 and fills defaults", () => {
    expect(queryInput.safeParse({ limit: 11 }).success).toBe(false);
    expect(queryInput.parse({})).toMatchObject({ limit: 5, availability: "any", price_unit: "sf", sort: "relevance" });
  });

  it("output rows match the allow-list exactly", () => {
    const p = toProduct(ROW);
    expect(productOut.strict().safeParse(p).success).toBe(true);
    expect(Object.keys(p).sort()).toEqual([...PRODUCT_KEYS].sort());
  });
});
