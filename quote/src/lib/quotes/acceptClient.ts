import "server-only";
import { isCustomerDeployment } from "@/lib/mode";
import { isToken } from "@/lib/send/plan";

/**
 * The customer deployment's one way to record anything (Albert, 2026-10-27): when a customer taps
 * Accept, its server posts their choices to the staff app's /api/accept with QUOTE_ACCEPT_KEY, and
 * the staff app checks everything against the frozen copy and does every write. This deployment
 * still holds no write token; this file is the only reader of the key on this side, never imports
 * the Airtable client, and is reached only from src/app/c/ (tests/boundary.test.ts).
 */

/** The staff app's address and the shared key; both unset = online acceptance is off. */
function target(): { url: string; key: string } | null {
  const url = process.env.QUOTE_STAFF_URL?.trim().replace(/\/+$/, "");
  const key = process.env.QUOTE_ACCEPT_KEY;
  return isCustomerDeployment() && url && /^https:\/\/[^\s/]+/.test(url) && key ? { url, key } : null;
}

export const acceptConfigured = () => target() !== null;

export type SendAcceptResult = { ok: true } | { ok: false; message: string };

export async function sendAcceptance(token: string, input: unknown, ctx: { store: boolean; userAgent: string | null }): Promise<SendAcceptResult> {
  const t = target();
  if (!t) return { ok: false, message: "Online acceptance isn't switched on yet. Reply to the message this link came in, or call us." };
  if (!isToken(token)) return { ok: false, message: "This link isn't right." };
  try {
    const res = await fetch(`${t.url}/api/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-quote-key": t.key },
      body: JSON.stringify({ token, input, store: ctx.store, userAgent: ctx.userAgent }),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    return d.ok === true ? { ok: true } : { ok: false, message: d.message ?? "Your acceptance didn't go through. Please try again, or call us." };
  } catch {
    return { ok: false, message: "Your acceptance didn't go through. Please try again, or call us." };
  }
}
