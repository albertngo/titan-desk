/**
 * The deployment settings acceptance reads (no real details live in the repo, which is public).
 * Both deployments set them: the customer deployment shows the deposit details on the accepted page,
 * the staff app puts them in the acceptance email and text.
 */

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** Where an e-transfer deposit goes (Albert, 2026-10-27: the company email). Unset = acceptance is off. */
export function etransferEmail(): string | null {
  const v = process.env.QUOTE_ETRANSFER_EMAIL?.trim().toLowerCase();
  return v && EMAIL.test(v) ? v : null;
}

/** The customer deployment's address, for links and attachments. Unset = acceptance is off on the staff app. */
export function customerUrl(): string | null {
  const u = process.env.QUOTE_CUSTOMER_URL?.trim();
  return u && /^https:\/\/[^\s/]+/.test(u) ? u.replace(/\/+$/, "") : null;
}

/**
 * The staff app's own address (2026-10-28): QUOTE_STAFF_URL when set, else the production domain
 * Vercel gives this project. Never on the customer deployment, where it would be the wrong app.
 */
export function staffUrl(): string | null {
  if (process.env.QUOTE_MODE === "customer") return null;
  const set = process.env.QUOTE_STAFF_URL?.trim();
  if (set && /^https:\/\/[^\s/]+/.test(set)) return set.replace(/\/+$/, "");
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host && /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
}

/**
 * The staff app's page for a version (Albert, 2026-10-28: "the link to it on the quote app's page
 * instead of the deposit link"). GHL's Accepted Quote field carries it, so the Notion project's Quote
 * Link opens the quote with its details, not the customer's accepted page.
 */
export function staffQuoteLink(versionId: string): string | null {
  const base = staffUrl();
  return base && /^rec[A-Za-z0-9]{14}$/.test(versionId) ? `${base}/q/${versionId}` : null;
}
