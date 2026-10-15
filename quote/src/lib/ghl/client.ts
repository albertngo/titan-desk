import "server-only";
import { GHL_LOCATION_ID, OPP_FIELDS } from "./ids";
import type { GhlContact, GhlOpportunity, GhlPipeline, GhlSite } from "./types";

export type { GhlContact, GhlOpportunity, GhlPipeline, GhlSite };

/**
 * The ONLY file in quote/ that talks to GoHighLevel, and the only one that reads
 * QUOTE_GHL_TOKEN (a read-only private integration token: contacts.readonly and
 * opportunities.readonly). Server-only, GET only: tests/boundary.test.ts fails the build if a
 * write verb appears here. Creating contacts and opportunities is Make's job, never this file's.
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
