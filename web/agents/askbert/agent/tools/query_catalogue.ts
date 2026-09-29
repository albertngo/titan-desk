import type { SessionContext } from "eve/context";
import { defineTool } from "eve/tools";
import { ACCESS_TOKEN_ATTR } from "../lib/auth";
import { relaxationCounts, searchCatalogue } from "../lib/db";
import { activeFilters, bindArgs, toProduct, toRelaxations } from "../lib/query";
import { queryInput, type QueryOutput } from "../lib/schema";

/** Postgres "query_canceled" (statement timeout). */
const TIMEOUT = "57014";

/**
 * The signed-in staff member's access token, from verified route auth. Under `eve dev` /
 * `eve eval` only (EVE_DEV=1), a local test user's token may stand in, since local runs have
 * no browser session.
 */
function accessToken(ctx: SessionContext): string | null {
  const t = ctx.session.auth.current?.attributes[ACCESS_TOKEN_ATTR];
  if (typeof t === "string" && t) return t;
  if (process.env.EVE_DEV === "1" && process.env.ASKBERT_DEV_ACCESS_TOKEN) return process.env.ASKBERT_DEV_ACCESS_TOKEN;
  return null;
}

export default defineTool({
  description:
    "Search Titan Flooring's product catalogue (every product, including archived and discontinued ones, which are flagged). "
    + "Returns up to 10 products with retail price, cost and other staff pricing, dates, stock, notes and the specs that answer "
    + "suitability questions. Suitability fields are \"yes\" only when the catalogue confirms them; \"not confirmed\" means "
    + "unknown, not no. When nothing matches, `relaxations` says how many products each dropped filter would let through.",
  inputSchema: queryInput,
  // No outputSchema: eve requires a JSON-Schema-capable (Zod 4) schema there, and the app is on
  // Zod 3. The return type below is the contract; tests check it against lib/schema.ts.
  label: {
    start: (input) => (input.keyword ? `Searching the catalogue for “${input.keyword}”` : "Searching the catalogue"),
  },
  async execute(input, ctx): Promise<QueryOutput> {
    const token = accessToken(ctx);
    if (!token) return { total_matches: 0, products: [], error: "unavailable" };
    const args = bindArgs(input);
    try {
      const rows = await searchCatalogue(token, args, ctx.abortSignal);
      if (rows.length > 0) {
        return { total_matches: Number(rows[0].total_matches), products: rows.map(toProduct) };
      }
      const counts = await relaxationCounts(token, args, ctx.abortSignal);
      return { total_matches: 0, products: [], relaxations: toRelaxations(counts, activeFilters(input)) };
    } catch (e) {
      const code = (e as { code?: string }).code;
      console.error("query_catalogue failed", code ?? "", (e as Error).message);
      return { total_matches: 0, products: [], error: code === TIMEOUT ? "timeout" : "unavailable" };
    }
  },
});
