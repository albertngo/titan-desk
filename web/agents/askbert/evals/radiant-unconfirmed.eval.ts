import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";

// LAM-FAWK-0042 has no radiant-heat confirmation in the seed: the answer is "unconfirmed", not "no".
export default defineEval({
  async test(t) {
    const turn = await t.send("Is LAM-FAWK-0042 radiant-heat compatible?");
    t.succeeded();
    t.calledTool("query_catalogue");
    // Any clear "not confirmed" wording counts (first real run said "isn't confirmed … not a no").
    t.check(turn.message, includes(/unconfirmed|not confirmed|isn.t confirmed|not recorded/i)).gate();
    t.check(turn.message, satisfies<string | undefined>((m) => !/\bnot (radiant[- ]heat )?compatible\b|\bis not suitable\b/i.test(m ?? ""),
      "does not claim it is incompatible")).gate();
  },
});
