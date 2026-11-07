import "server-only";
import { hasMore, htmlToText, parseMessages, type Message } from "@/lib/conversation/thread";
import { ACCEPT_FIELDS, CONTACT_ORIGIN_FIELD, GHL_LOCATION_ID, LOST_REASONS, OPP_FIELDS } from "./ids";
import type { GhlContact, GhlConversation, GhlOpportunity, GhlPipeline, GhlSite } from "./types";

export type { GhlContact, GhlConversation, GhlOpportunity, GhlPipeline, GhlSite };

/**
 * The ONLY file in quote/ that talks to GoHighLevel, and the only one that reads
 * QUOTE_GHL_TOKEN (a private integration token used read-only: contacts.readonly,
 * opportunities.readonly, conversations.readonly and conversations/message.readonly; whatever
 * else the token holds, this file never uses). Server-only, GET only: tests/boundary.test.ts
 * fails the build if a write verb appears here. Creating contacts and opportunities is Make's
 * job, never this file's, and so would be replying to a customer.
 */

const BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

export class GhlError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "GhlError";
  }
}

/** The token is missing: the app works without GHL lookup until it's set. */
export class GhlNotConfigured extends GhlError {
  constructor() {
    super("GHL lookup isn't set up for this deployment yet (QUOTE_GHL_TOKEN).", null);
    this.name = "GhlNotConfigured";
  }
}

export const ghlConfigured = () => Boolean(process.env.QUOTE_GHL_TOKEN);

async function get(path: string, params: Record<string, string>): Promise<unknown> {
  const token = process.env.QUOTE_GHL_TOKEN;
  if (!token) throw new GhlNotConfigured();
  const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Version: VERSION, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GhlError(`GHL ${res.status} on ${path}: ${body.slice(0, 200)}`, res.status);
  }
  return res.json();
}

const s = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

function toContact(c: Record<string, unknown>): GhlContact {
  return {
    id: String(c.id),
    firstName: s(c.firstName),
    lastName: s(c.lastName),
    name: s(c.contactName) ?? s(c.name),
    email: s(c.email),
    phone: s(c.phone),
    address: s(c.address1),
    city: s(c.city),
    postalCode: s(c.postalCode),
    origin: customValue(c.customFields, CONTACT_ORIGIN_FIELD),
    source: s(c.source),
  };
}

/** Contacts whose name, phone or email matches the query, best first. */
export async function searchContacts(query: string, limit = 8): Promise<GhlContact[]> {
  const data = (await get("/contacts/", { locationId: GHL_LOCATION_ID, query, limit: String(limit) })) as { contacts?: Record<string, unknown>[] };
  return (data.contacts ?? []).filter((c) => typeof c.id === "string").map(toContact);
}

export async function getContact(id: string): Promise<GhlContact | null> {
  if (!/^[A-Za-z0-9]+$/.test(id)) return null;
  try {
    const data = (await get(`/contacts/${id}`, {})) as { contact?: Record<string, unknown> };
    return data.contact ? toContact(data.contact) : null;
  } catch (e) {
    if (e instanceof GhlError && e.status === 404) return null;
    throw e;
  }
}

export async function opportunitiesForContact(contactId: string): Promise<GhlOpportunity[]> {
  if (!/^[A-Za-z0-9]+$/.test(contactId)) return [];
  const data = (await get("/opportunities/search", { location_id: GHL_LOCATION_ID, contact_id: contactId, limit: "20" })) as {
    opportunities?: Record<string, unknown>[];
  };
  return (data.opportunities ?? [])
    .filter((o) => typeof o.id === "string")
    .map((o) => ({
      id: String(o.id),
      name: s(o.name),
      status: s(o.status),
      pipelineId: s(o.pipelineId),
      stageId: s(o.pipelineStageId),
      updatedAt: s(o.updatedAt) ?? s(o.lastStatusChangeAt) ?? s(o.createdAt),
      statusChangedAt: s(o.lastStatusChangeAt) ?? s(o.updatedAt) ?? s(o.createdAt),
      companyCamUrl: customValue(o.customFields, OPP_FIELDS.companyCamUrl),
      siteAddress: customValue(o.customFields, OPP_FIELDS.projectAddress),
      source: s(o.source),
    }));
}

/** A custom field's value; GHL has returned it under each of these names. */
function customValue(fields: unknown, id: string): string | null {
  if (!Array.isArray(fields)) return null;
  const f = (fields as Record<string, unknown>[]).find((x) => x?.id === id);
  return f ? (s(f.fieldValueString) ?? s(f.fieldValue) ?? s(f.value)) : null;
}

/** The site on one opportunity (its Project Address / Project City), or null if GHL has no such opportunity. */
export async function opportunitySite(id: string): Promise<GhlSite | null> {
  if (!/^[A-Za-z0-9]+$/.test(id)) return null;
  try {
    const data = (await get(`/opportunities/${id}`, {})) as { opportunity?: Record<string, unknown> };
    const o = data.opportunity;
    if (!o) return null;
    return { address: customValue(o.customFields, OPP_FIELDS.projectAddress), city: customValue(o.customFields, OPP_FIELDS.projectCity) };
  } catch (e) {
    if (e instanceof GhlError && e.status === 404) return null;
    throw e;
  }
}

/**
 * The Notion project a won opportunity got (2026-10-27): its PP number and page, which Make 3710214
 * writes back onto the opportunity after it makes the project. Null if GHL has no such opportunity.
 */
export async function opportunityProject(id: string): Promise<{ projectNumber: string | null; notionUrl: string | null; companyCamUrl: string | null } | null> {
  if (!/^[A-Za-z0-9]+$/.test(id)) return null;
  try {
    const data = (await get(`/opportunities/${id}`, {})) as { opportunity?: Record<string, unknown> };
    const o = data.opportunity;
    if (!o) return null;
    return {
      projectNumber: customValue(o.customFields, OPP_FIELDS.projectNumber),
      notionUrl: ACCEPT_FIELDS.notionProjectUrl ? customValue(o.customFields, ACCEPT_FIELDS.notionProjectUrl) : null,
      companyCamUrl: customValue(o.customFields, OPP_FIELDS.companyCamUrl),
    };
  } catch (e) {
    if (e instanceof GhlError && e.status === 404) return null;
    throw e;
  }
}

/**
 * The location's users (id, email, name, and the phone number GHL has assigned them here), to tag the person who sent
 * a quote and, since 2026-11-04, to text from their own number. Needs users.readonly on the token.
 */
export async function locationUsers(): Promise<{ id: string; email: string | null; name: string | null; number: string | null }[]> {
  const data = (await get("/users/", { locationId: GHL_LOCATION_ID })) as { users?: Record<string, unknown>[] };
  return (data.users ?? [])
    .filter((u) => typeof u.id === "string" && u.deleted !== true)
    .map((u) => ({ id: String(u.id), email: s(u.email)?.toLowerCase() ?? null, name: s(u.name), number: assignedNumber(u.lcPhone) }));
}

/** The user's GHL (LeadConnector) number in this location: `lcPhone` keyed by location id, or a plain string. Never their personal phone. */
function assignedNumber(lc: unknown): string | null {
  if (typeof lc === "string") return s(lc);
  if (lc && typeof lc === "object") return s((lc as Record<string, unknown>)[GHL_LOCATION_ID]);
  return null;
}

/* ---------- the customer's conversation (Albert, 2026-10-20): read only ---------- */

/** The contact's conversations in GHL (usually one), most recently active first. */
export async function conversationsForContact(contactId: string): Promise<GhlConversation[]> {
  if (!/^[A-Za-z0-9]+$/.test(contactId)) return [];
  const data = (await get("/conversations/search", { locationId: GHL_LOCATION_ID, contactId, limit: "10" })) as {
    conversations?: Record<string, unknown>[];
  };
  return (data.conversations ?? [])
    .filter((c) => typeof c.id === "string")
    .map((c) => ({
      id: String(c.id),
      lastMessageAt: typeof c.lastMessageDate === "number" ? new Date(c.lastMessageDate).toISOString() : (s(c.lastMessageDate) ?? s(c.dateUpdated)),
    }))
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

/** One conversation's latest messages, oldest first, and whether older ones exist past them. */
export async function conversationMessages(conversationId: string, limit = 100): Promise<{ messages: Message[]; more: boolean }> {
  if (!/^[A-Za-z0-9]+$/.test(conversationId)) return { messages: [], more: false };
  const data = await get(`/conversations/${conversationId}/messages`, { limit: String(limit) });
  return { messages: parseMessages(data), more: hasMore(data) };
}

/** The full text of one email, for a message whose list entry carried none. Null when GHL has no such email. */
export async function emailMessage(emailId: string): Promise<{ subject: string | null; body: string | null } | null> {
  if (!/^[A-Za-z0-9_-]+$/.test(emailId)) return null;
  try {
    const data = (await get(`/conversations/messages/email/${emailId}`, {})) as Record<string, unknown>;
    const e = (typeof data.emailMessage === "object" && data.emailMessage !== null ? data.emailMessage : data) as Record<string, unknown>;
    const html = s(e.body);
    return { subject: s(e.subject), body: html ? htmlToText(html) || null : null };
  } catch (e) {
    if (e instanceof GhlError && e.status === 404) return null;
    throw e;
  }
}

let pipelineCache: { at: number; value: GhlPipeline[] } | null = null;

/** Pipeline and stage names, for labelling. Cached for ten minutes per server instance. */
export async function pipelines(): Promise<GhlPipeline[]> {
  if (pipelineCache && Date.now() - pipelineCache.at < 600_000) return pipelineCache.value;
  const data = (await get("/opportunities/pipelines", { locationId: GHL_LOCATION_ID })) as { pipelines?: Record<string, unknown>[] };
  const value = (data.pipelines ?? []).map((p) => ({
    id: String(p.id),
    name: s(p.name) ?? "Pipeline",
    stages: (Array.isArray(p.stages) ? (p.stages as Record<string, unknown>[]) : []).map((st) => ({ id: String(st.id), name: s(st.name) ?? "Stage" })),
  }));
  pipelineCache = { at: Date.now(), value };
  return value;
}

/* ---------- the Follow up page (2026-11-07): read only ---------- */

let lostCache: { at: number; value: { id: string; name: string }[] } | null = null;

/**
 * The location's own lost reasons (GET /opportunities/lost-reason, opportunities.readonly), by name, cached ten minutes;
 * GHL's list as Albert read it from Settings (LOST_REASONS) when the live read fails or comes back empty.
 */
export async function lostReasons(): Promise<{ id: string; name: string }[]> {
  try {
    const live = await liveLostReasons();
    if (live.length) return live;
  } catch (e) {
    console.error("lostReasons live read", e);
  }
  return [...LOST_REASONS];
}

async function liveLostReasons(): Promise<{ id: string; name: string }[]> {
  if (lostCache && Date.now() - lostCache.at < 600_000) return lostCache.value;
  const data = (await get("/opportunities/lost-reason", { locationId: GHL_LOCATION_ID, limit: "100" })) as Record<string, unknown>;
  // GHL's docs name the array lostReasons with id and name; read the other spellings too, so a shape change shows as
  // reasons rather than as an empty list (2026-11-07: an empty read let Lost go out with no reason at all).
  const list = [data.lostReasons, data.lostReason, data.reasons, data.data].find(Array.isArray) as Record<string, unknown>[] | undefined;
  const value = (list ?? [])
    .map((r) => ({ id: s(r.id) ?? s(r._id), name: s(r.name) ?? s(r.title), deleted: r.deleted === true }))
    .filter((r): r is { id: string; name: string; deleted: boolean } => Boolean(r.id && r.name) && !r.deleted)
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  lostCache = { at: Date.now(), value };
  return value;
}

let fieldsCache: { at: number; value: { id: string; name: string }[] } | null = null;

/** The location's opportunity custom fields, cached ten minutes; [] when they can't be read. */
async function opportunityFields(): Promise<{ id: string; name: string }[]> {
  if (fieldsCache && Date.now() - fieldsCache.at < 600_000) return fieldsCache.value;
  let value: { id: string; name: string }[] = [];
  try {
    const data = (await get(`/locations/${GHL_LOCATION_ID}/customFields`, { model: "opportunity" })) as { customFields?: Record<string, unknown>[] };
    value = (data.customFields ?? []).filter((f) => typeof f.id === "string").map((f) => ({ id: String(f.id), name: s(f.name) ?? "" }));
  } catch (e) {
    console.error("opportunityFields", e);
  }
  fieldsCache = { at: Date.now(), value };
  return value;
}

const fieldNamed = async (name: RegExp) => {
  const found = (await opportunityFields()).filter((f) => name.test(f.name));
  return found.length === 1 ? found[0].id : null;
};

/**
 * The id of the opportunity date field "Postponed Until" (made by Albert, 2026-11-07), found by name in the location's
 * opportunity custom fields. Null when it isn't there once, or the token can't read custom fields: the stage still moves.
 */
export const postponedUntilFieldId = () => fieldNamed(/^postponed until$/i);

/** The opportunity text field "Lost Details" (made by Albert, 2026-11-07), where Lost writes its note; null when not found once. */
export const lostDetailsFieldId = () => fieldNamed(/^lost details$/i);

/**
 * The contact's appointments (Albert, 2026-11-07: "showcase whether there has been; or hasnt been an appt yet"), for
 * the Follow up page's visit chip: GET /contacts/{id}/appointments (contacts.readonly). Read only.
 */
export async function contactAppointments(contactId: string): Promise<{ id: string; calendarId: string | null; start: string | null; status: string | null; title: string | null }[]> {
  if (!/^[A-Za-z0-9]+$/.test(contactId)) return [];
  const data = (await get(`/contacts/${contactId}/appointments`, {})) as { events?: Record<string, unknown>[] };
  return (data.events ?? [])
    .filter((e) => typeof e.id === "string" && e.deleted !== true)
    .map((e) => ({ id: String(e.id), calendarId: s(e.calendarId), start: s(e.startTime), status: (s(e.appointmentStatus) ?? s(e.status))?.toLowerCase() ?? null, title: s(e.title) }));
}
