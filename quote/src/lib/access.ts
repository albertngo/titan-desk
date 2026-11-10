/**
 * Who may open the quoting app. Being a signed-in staff member is NOT enough: the email must
 * be on QUOTE_ALLOWED_EMAILS (comma-separated, set in this app's Vercel project only).
 *
 * Fails closed: an unset or empty list lets nobody in.
 */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes("@")),
  );
}

export function isQuoter(email: unknown, allow: Set<string>): boolean {
  return typeof email === "string" && allow.has(email.trim().toLowerCase());
}

export const quoterAllowlist = () => parseAllowlist(process.env.QUOTE_ALLOWED_EMAILS);

/**
 * Who may open the Performance page (Albert, 2026-11-10: "for me first"): QUOTE_ADMIN_EMAILS, comma-separated, and
 * on the quoter list too. Fails closed: unset or empty lets nobody see it.
 */
export const adminAllowlist = () => parseAllowlist(process.env.QUOTE_ADMIN_EMAILS);
export const isAdmin = (email: unknown) => isQuoter(email, adminAllowlist()) && isQuoter(email, quoterAllowlist());
