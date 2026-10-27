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
