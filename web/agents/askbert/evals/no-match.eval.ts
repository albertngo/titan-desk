import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import { onlyReturnedSkus } from "./shared";

export default defineEval({
  async test(t) {
    const turn = await t.send("Solid walnut herringbone under $1/sf?");
    t.succeeded();
    t.calledTool("query_catalogue");
    t.check(turn.message, includes(/\bno (products?|matches|match)\b|\bnothing\b|\bnone\b|\bdon.t have\b/i));
    t.check(turn.message, satisfies<string | undefined>((m) => onlyReturnedSkus(m, turn.toolCalls), "does not invent products")).gate();
  },
});
