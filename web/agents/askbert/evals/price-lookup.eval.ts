import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import { onlyReturnedSkus } from "./shared";

export default defineEval({
  async test(t) {
    const turn = await t.send('What\'s the price of Vidar 7.5" AWO Macaroon Character?');
    t.succeeded();
    t.calledTool("query_catalogue");
    t.check(turn.message, includes("ENG-VIDR-0100C"));
    t.check(turn.message, includes("5.79"));
    t.check(turn.message, satisfies<string | undefined>((m) => onlyReturnedSkus(m, turn.toolCalls), "every SKU came from the catalogue")).gate();
  },
});
