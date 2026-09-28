import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import { onlyReturnedSkus } from "./shared";

export default defineEval({
  async test(t) {
    const turn = await t.send("Can laminate go in a basement?");
    t.succeeded();
    t.check(turn.message, includes("General guidance:"));
    t.check(turn.message, satisfies<string | undefined>((m) => onlyReturnedSkus(m, turn.toolCalls), "any product named came from the catalogue")).gate();
  },
});
