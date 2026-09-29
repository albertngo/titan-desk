import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { onlyReturnedSkus, skusIn } from "./shared";

// Seed products confirmed waterproof at or under $5/sf.
const OK = new Set(["LVP-BIYK-BYKHYDRO7WI", "GRNDSPC-0001", "LAM-FAWK-0042", "LVP-WODN-0033"]);

export default defineEval({
  async test(t) {
    const turn = await t.send("Waterproof options under $5/sqft?");
    t.succeeded();
    t.calledTool("query_catalogue", {
      input: (input) => {
        const i = input as { requires?: string[]; price_max?: number };
        return (i.requires ?? []).includes("waterproof") && i.price_max !== undefined && i.price_max <= 5;
      },
    });
    t.check(turn.message, satisfies<string | undefined>((m) => skusIn(m).some((s) => OK.has(s)), "names at least one qualifying product"));
    t.check(turn.message, satisfies<string | undefined>((m) => skusIn(m).every((s) => OK.has(s)), "names only qualifying products")).gate();
    t.check(turn.message, satisfies<string | undefined>((m) => onlyReturnedSkus(m, turn.toolCalls), "every SKU came from the catalogue")).gate();
  },
});
