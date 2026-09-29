import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// ENG-VIDR-0100R is Discontinued in the seed: askBert still answers, and flags it.
export default defineEval({
  async test(t) {
    const turn = await t.send("Price on Vidar Macaroon Rustic?");
    t.succeeded();
    t.calledTool("query_catalogue");
    t.check(turn.message, includes("ENG-VIDR-0100R"));
    t.check(turn.message, includes(/discontinued/i)).gate();
  },
});
