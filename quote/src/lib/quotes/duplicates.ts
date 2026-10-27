import "server-only";
import { searchContacts, type GhlContact } from "@/lib/ghl/client";
import { normalizePhone, sameCustomer } from "@/lib/link/identity";

/**
 * GHL contacts with the same phone or email as a customer about to be added as new. Used by
 * starting a quote and by creating an opportunity for a quote that needs linking; both callers
 * check the quoter allowlist first.
 */
export async function alreadyInGhl(typed: { phone: string | null; email: string | null }): Promise<GhlContact[]> {
  const queries = [typed.email, normalizePhone(typed.phone)?.slice(-10)].filter((q): q is string => Boolean(q));
  const found = (await Promise.all(queries.map((q) => searchContacts(q, 10)))).flat();
  const unique = new Map(found.filter((c) => sameCustomer(c, typed)).map((c) => [c.id, c]));
  return [...unique.values()];
}
