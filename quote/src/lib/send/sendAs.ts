/**
 * Send as someone else (Albert, 2026-11-04: "give ALBERT an option to select who I want it sent out from? Only Albert
 * has the option to"). Pure rules, no I/O: who may choose, who can be chosen, and checking a choice on the server.
 *
 * Only an address in SEND_AS_PICKERS may choose. The choices are the people allowed into the app (QUOTE_ALLOWED_EMAILS)
 * on the company's own email domain, since GHL sends only from a domain it has verified; each one's name comes from
 * their GHL user. Choosing someone sends as them in every way the customer sees: their email address, their GHL
 * number for the text, and their first name signing it. The person who pressed Send is still the one in the Edit Log.
 */

/** The one sign-in that may send as someone else. */
export const SEND_AS_PICKERS: readonly string[] = ["albert@titanfloors.ca"];

export type SendAsChoice = { email: string; name: string | null };

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
const domainOf = (e: string) => norm(e).split("@")[1] ?? "";

export const canPickSender = (email: string | null | undefined): boolean => SEND_AS_PICKERS.includes(norm(email));

/**
 * The people who can be chosen: the app's allowlist on the company's domain (all of it when no company address is set),
 * named from their GHL user, the person signed in first and the rest by address.
 */
export function sendAsChoices(me: string, allow: Iterable<string>, companyEmail: string | null, users: { email: string | null; name: string | null }[]): SendAsChoice[] {
  const domain = companyEmail ? domainOf(companyEmail) : "";
  const self = norm(me);
  const emails = [...new Set([...allow].map(norm))].filter((e) => e.includes("@") && (!domain || domainOf(e) === domain));
  if (self && !emails.includes(self)) emails.push(self);
  return emails
    .sort((a, b) => (a === self ? -1 : b === self ? 1 : a.localeCompare(b)))
    .map((email) => ({ email, name: users.find((u) => u.email === email)?.name ?? null }));
}

/**
 * Who a send goes out as. No choice, or the person themselves: them. Anyone else only when the person signed in may
 * choose and the address is one of the choices; otherwise the send is refused, never quietly sent as them.
 */
export function resolveSender<P extends { email: string; name: string | null }>(person: P, asEmail: unknown, choices: SendAsChoice[]): { ok: true; sender: { email: string; name: string | null }; as: boolean } | { ok: false; message: string } {
  const want = typeof asEmail === "string" ? norm(asEmail) : "";
  if (!want || want === norm(person.email)) return { ok: true, sender: person, as: false };
  if (!canPickSender(person.email)) return { ok: false, message: "Only Albert can send a quote as someone else." };
  const choice = choices.find((c) => c.email === want);
  if (!choice) return { ok: false, message: "That person can't send quotes from the app. Pick someone on the list." };
  return { ok: true, sender: { email: choice.email, name: choice.name }, as: true };
}
