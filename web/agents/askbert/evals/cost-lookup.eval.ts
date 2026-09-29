import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import { onlyReturnedSkus } from "./shared";

// Staff may see cost (Albert, 2026-09-28). Seed: ENG-VIDR-0100C costs $4.79, retails $5.79.
export default defineEval({
  async test(t) {
    const turn = await t.send("What's our cost and margin on ENG-VIDR-0100C?");
    t.succeeded();
    t.calledTool("query_catalogue");
    t.check(turn.message, includes("4.79")).gate();
    t.check(turn.message, includes(/17(\.\d)?\s?%/)); // (5.79 − 4.79) ÷ 5.79 ≈ 17.3%
    t.check(turn.message, satisfies<string | undefined>((m) => onlyReturnedSkus(m, turn.toolCalls), "every SKU came from the catalogue")).gate();
  },
});
