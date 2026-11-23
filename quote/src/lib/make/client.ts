import "server-only";
import type { GhlRequest } from "@/lib/link/ghlRequest";
import type { GhlMessage } from "@/lib/send/plan";

/**
 * The ONLY file in quote/ that sends anything to Make, and the only reader of
 * QUOTE_MAKE_GHL_HOOK and QUOTE_MAKE_GHL_KEY. It posts one request per new quote to the
 * "Quote app → GHL" scenario, which makes the GHL changes with Make's own GHL connection; the
 * app never holds a GHL write token. Sending a quote (2026-10-15) uses the same scenario's
 * `message` route: one GHL message per request, email or text, whose exact body the app builds
 * in src/lib/send/plan.ts. Since 2026-10-27 the `message` route also carries the open-tracking
 * internal comments (src/lib/quotes/activity.ts), and a `tags` route sets the follow-up tags on send.
 * Since 2026-11-05 a `note` route adds the send's note to the contact's Notes tab.
 *
 * Switched off until both variables are set, and they are set only after the scenario is
 * switched on: a request to a scenario that is off would wait in Make's queue and run later.
 */

export const makeConfigured = () => Boolean(process.env.QUOTE_MAKE_GHL_HOOK && process.env.QUOTE_MAKE_GHL_KEY);

export class MakeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MakeError";
  }
}

const GHL_ID = /^[A-Za-z0-9]{6,40}$/;

async function post(body: Record<string, unknown>): Promise<{ res: Response; text: string; d: Record<string, unknown> }> {
  const url = process.env.QUOTE_MAKE_GHL_HOOK;
  const key = process.env.QUOTE_MAKE_GHL_KEY;
  if (!url || !key) throw new MakeError("The Make step isn't switched on for this deployment.");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text().catch(() => "");
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    // "Accepted" (scenario off, or no route matched) or an error page: not a confirmation.
  }
  return { res, text, d: (data ?? {}) as Record<string, unknown> };
}

/** Returns the contact and opportunity GHL ended up with. Throws MakeError if Make didn't confirm both. */
export async function sendToGhl(req: GhlRequest): Promise<{ contactId: string; opportunityId: string }> {
  const { res, text, d } = await post({ ...req });
  const contactId = typeof d.contactId === "string" ? d.contactId : "";
  const opportunityId = typeof d.opportunityId === "string" ? d.opportunityId : "";
  if (!res.ok || d.ok !== true || !GHL_ID.test(contactId) || !GHL_ID.test(opportunityId)) {
    throw new MakeError(`Make didn't confirm the GHL changes (${res.status}: ${text.slice(0, 120)})`);
  }
  return { contactId, opportunityId };
}

/**
 * Send one email or text to a GHL contact through Make. Returns GHL's message id; throws
 * MakeError unless Make confirms GHL accepted it.
 */
export async function sendMessage(message: GhlMessage): Promise<string> {
  const { res, text, d } = await post({ mode: "message", contactId: message.contactId, messageBody: JSON.stringify(message) });
  const messageId = typeof d.messageId === "string" ? d.messageId : "";
  if (!res.ok || d.ok !== true || !GHL_ID.test(messageId)) {
    throw new MakeError(`Make didn't confirm the ${message.type === "SMS" ? "text" : message.type === "Email" ? "email" : "comment"} (${res.status}: ${text.slice(0, 120)})`);
  }
  return messageId;
}

/**
 * A note on the contact's Notes tab (Albert, 2026-11-05: the send's comment, "the same in the customer notes"),
 * through the scenario's `note` route, whose filter takes only `{"body":"..."}` on one line. Throws MakeError unless
 * Make confirms it with the new note's id.
 */
export async function addContactNote(contactId: string, body: string): Promise<string> {
  if (!GHL_ID.test(contactId)) throw new MakeError("No GHL contact for the note.");
  const { res, text, d } = await post({ mode: "note", contactId, noteBody: JSON.stringify({ body }) });
  const noteId = typeof d.noteId === "string" ? d.noteId : "";
  if (!res.ok || d.ok !== true || !GHL_ID.test(noteId)) throw new MakeError(`Make didn't confirm the note (${res.status}: ${text.slice(0, 120)})`);
  return noteId;
}

/**
 * The follow-up tags on a send (2026-10-27): the same scenario's `tags` route removes the tags in
 * `removeBody` from the contact, then adds the one in `addBody`. Make's filter refuses any tag but
 * the two quote-sent ones (src/lib/ghl/ids.ts). Throws MakeError unless Make confirms both.
 */
export async function setFollowUpTags(contactId: string, bodies: { removeBody: string; addBody: string }): Promise<void> {
  if (!GHL_ID.test(contactId)) throw new MakeError("No GHL contact to tag.");
  const { res, text, d } = await post({ mode: "tags", contactId, ...bodies });
  if (!res.ok || d.ok !== true) throw new MakeError(`Make didn't confirm the follow-up tags (${res.status}: ${text.slice(0, 120)})`);
}

/**
 * The Follow up page (2026-11-07): take both quote-sent tags off, so neither follow-up workflow keeps texting a customer
 * marked lost or postponed. The scenario's `untag` route: DELETE /contacts/<id>/tags, its filter refusing any tag but the
 * two quote-sent ones. Throws MakeError unless Make confirms it.
 */
export async function removeFollowUpTags(contactId: string, removeBody: string): Promise<void> {
  if (!GHL_ID.test(contactId)) throw new MakeError("No GHL contact to untag.");
  const { res, text, d } = await post({ mode: "untag", contactId, removeBody });
  if (!res.ok || d.ok !== true) throw new MakeError(`Make didn't confirm the follow-up tags came off (${res.status}: ${text.slice(0, 120)})`);
}

/**
 * The Follow up page's Lost (2026-11-07): the opportunity's status with GHL's own lost reason, through the scenario's
 * `status` route (PUT /opportunities/<id>/status, the one place GHL takes a lost reason). Throws MakeError unless Make
 * confirms it.
 */
export async function setOpportunityStatus(opportunityId: string, statusBody: string): Promise<void> {
  if (!GHL_ID.test(opportunityId)) throw new MakeError("No GHL opportunity on this quote.");
  const { res, text, d } = await post({ mode: "status", opportunityId, statusBody });
  if (!res.ok || d.ok !== true) throw new MakeError(`Make didn't confirm the opportunity was marked lost (${res.status}: ${text.slice(0, 120)})`);
}

/**
 * POS customers (Albert, 2026-11-23; vault 05_decisions/2026-11-23-quote-pos-customers): a separate scenario,
 * "Quote app → POS customers", on its own hook and key (QUOTE_MAKE_POS_HOOK / QUOTE_MAKE_POS_KEY), so the GHL
 * scenario never holds a POS connection. Its one route, `customer`, searches Lightspeed or Hike by email then phone,
 * links a hit and creates only on a miss; it never updates, merges or deletes. Returns the POS customer id and whether
 * it was created or linked; throws MakeError unless Make confirms one.
 */
export const posConfigured = () => Boolean(process.env.QUOTE_MAKE_POS_HOOK && process.env.QUOTE_MAKE_POS_KEY);

export async function posCustomer(system: "lightspeed" | "hike", customer: Record<string, string>): Promise<{ id: string; how: "created" | "linked" }> {
  const url = process.env.QUOTE_MAKE_POS_HOOK;
  const key = process.env.QUOTE_MAKE_POS_KEY;
  if (!url || !key) throw new MakeError("The POS customers step isn't switched on for this deployment.");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, mode: "customer", system, customerBody: JSON.stringify(customer) }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text().catch(() => "");
  let d: Record<string, unknown> = {};
  try {
    d = (JSON.parse(text) ?? {}) as Record<string, unknown>;
  } catch {
    // not a confirmation
  }
  const id = typeof d.customerId === "string" || typeof d.customerId === "number" ? String(d.customerId) : "";
  const how = d.how === "created" || d.how === "linked" ? d.how : null;
  if (!res.ok || d.ok !== true || !/^[A-Za-z0-9-]{1,64}$/.test(id) || !how) throw new MakeError(`Make didn't confirm the ${system} customer (${res.status}: ${text.slice(0, 120)})`);
  return { id, how };
}

/**
 * The hot-tier follow-up alert (Albert, 2026-11-09: "WhatsApp to staff"), through the same scenario's `alert` route,
 * which sends one WhatsApp. Off until QUOTE_ALERT_TO is set, and that holds the one number every alert goes to
 * (a test number first, as the Tacoma alerts did, until Albert switches each one to its real person). The text names
 * the customer, the score and why; never a message from the conversation. Throws MakeError unless Make confirms it.
 */
export async function sendAlert(alert: { to: string; forEmail: string | null; text: string }): Promise<void> {
  // Since 2026-11-10 the number and the on/off are on the Settings page; the caller passes them.
  const to = alert.to;
  if (!/^\+\d{10,15}$/.test(to)) throw new MakeError("No valid alert number is set (Settings, Alerts).");
  const { res, text, d } = await post({ mode: "alert", to, forEmail: alert.forEmail ?? "", alertBody: JSON.stringify({ text: alert.text }) });
  if (!res.ok || d.ok !== true) throw new MakeError(`Make didn't confirm the alert (${res.status}: ${text.slice(0, 120)})`);
}
