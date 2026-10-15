/**
 * Which deployment this is. The same code runs twice (Albert, 2026-10-15; root CLAUDE.md "a public
 * app never shares a deployment with a write token"):
 *
 * - the staff app (titan-desk-quote): sign-in, the Airtable write token, Make, GHL;
 * - the customer deployment (QUOTE_MODE=customer): customer links `/c/<token>` only, holding a
 *   read-only Airtable token and nothing else. Every other path answers 404 there, and the
 *   Airtable client refuses to write.
 */
export const isCustomerDeployment = () => process.env.QUOTE_MODE === "customer";
