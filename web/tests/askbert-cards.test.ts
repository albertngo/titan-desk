import { describe, expect, it } from "vitest";
import { hitSessionLimit, messageText, referencedProducts, type MessageLike } from "../src/lib/askbert-cards";

const product = (sku: string) => ({ sku, name: sku, url: `/p/${sku}` });
const tool = (skus: string[], extra: Record<string, unknown> = {}) => ({
  type: "dynamic-tool", toolName: "query_catalogue", state: "output-available",
  output: { total_matches: skus.length, products: skus.map(product) }, ...extra,
});
const answer = (parts: MessageLike["parts"]): MessageLike => ({ role: "assistant", parts });

describe("askBert cards", () => {
  it("shows the products the answer names, in the order it names them", () => {
    const m = answer([tool(["A-001", "B-002", "C-003"]), { type: "text", text: "Try **C** — SKU `C-003`, or A — SKU `A-001`." }]);
    expect(referencedProducts(m).map((p) => p.sku)).toEqual(["C-003", "A-001"]);
  });

  it("never makes a card for a SKU the catalogue did not return", () => {
    const m = answer([tool(["A-001"]), { type: "text", text: "Maybe ZZZ-999 or A-001." }]);
    expect(referencedProducts(m).map((p) => p.sku)).toEqual(["A-001"]);
  });

  it("falls back to the first five returned when none are named", () => {
    const m = answer([tool(["A-1", "B-1", "C-1", "D-1", "E-1", "F-1"]), { type: "text", text: "Several options." }]);
    expect(referencedProducts(m)).toHaveLength(5);
  });

  it("ignores partial, failed and other tools' results", () => {
    const m = answer([tool(["A-001"], { partial: true }), tool(["B-002"], { state: "output-error" }), tool(["C-003"], { toolName: "other" })]);
    expect(referencedProducts(m)).toEqual([]);
  });

  it("reads text parts and spots the cost-cap prompt", () => {
    expect(messageText(answer([{ type: "text", text: "a" }, { type: "reasoning", text: "x" }, { type: "text", text: "b" }]))).toBe("ab");
    expect(hitSessionLimit([answer([{ type: "dynamic-tool", state: "approval-requested" }])])).toBe(true);
    expect(hitSessionLimit([answer([tool(["A-1"])])])).toBe(false);
  });
});
