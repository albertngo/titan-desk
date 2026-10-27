import "server-only";
import { isCustomerDeployment } from "@/lib/mode";
import { deviceOf, isBot, type ActivityKind } from "./track";

/**
 * The customer deployment's half of open tracking (2026-10-27). That deployment holds a read-only
 * Airtable token and never writes, so it reports each open or PDF download to the staff app's
 * /api/activity (QUOTE_STAFF_URL) with the shared QUOTE_ACTIVITY_KEY, and the staff app records it.
 * Only the token, the kind and the device (in words, from the User-Agent) are sent; never the
 * address, the browser string or anything the customer typed. Unset = tracking is off. A report
 * that fails is dropped: tracking never slows or breaks the customer's page.
 */

const TOKEN = /^[A-Za-z0-9]{32}$/;

export async function relayActivity(token: string, kind: ActivityKind, userAgent: string | null): Promise<void> {
  const staff = process.env.QUOTE_STAFF_URL?.trim().replace(/\/+$/, "");
  const key = process.env.QUOTE_ACTIVITY_KEY;
  if (!isCustomerDeployment() || !staff || !/^https:\/\/[^\s/]+$/.test(staff) || !key || !TOKEN.test(token) || isBot(userAgent)) return;
  try {
    await fetch(`${staff}/api/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-quote-key": key },
      body: JSON.stringify({ token, kind, device: deviceOf(userAgent) }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Dropped: an open we didn't count is better than a page that waits.
  }
}
