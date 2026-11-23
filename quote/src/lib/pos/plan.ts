/**
 * POS customers (Albert, 2026-11-23; vault 05_decisions/2026-11-23-quote-pos-customers): a won GHL contact is made a
 * customer in Lightspeed and in Hike. Pure: what is sent, what the quote's "POS Customers" cell holds, and which
 * systems still need doing. Tested in tests/pos.test.ts. The sending is src/lib/quotes/pos.ts.
 *
 * The matching happens here, not in Make (2026-11-23): Make only passes on a Lightspeed search, a page of Hike's customer
 * list (Hike has no search; Albert chose to scan every customer, vault 05_decisions/2026-11-23-hike-customer-scan), and
 * a create. A hit is linked and never edited; only a miss is created, and a create never carries an id, so Hike's
 * createOrUpdate can only create.
 */

export const SYSTEMS = ["lightspeed", "hike"] as const;
export type PosSystem = (typeof SYSTEMS)[number];
export const SYSTEM_NAME: Record<PosSystem, string> = { lightspeed: "Lightspeed", hike: "Hike" };

export type PosCustomer = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  note: string;
};

export type PosEntry = { id: string; how: "created" | "linked"; at: string };
export type PosState = Partial<Record<PosSystem, PosEntry>>;

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** What Make gets for one customer. Null when there is nothing to find or create them by. */
export function buildCustomer(q: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode?: string | null;
  contactId: string;
  quoteNumber: string | null;
}): PosCustomer | null {
  const email = clean(q.email).toLowerCase();
  const digits = clean(q.phone).replace(/\D/g, "");
  const phone = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : digits ? `+${digits}` : "";
  if (!email && !phone) return null;
  if (!clean(q.firstName) && !clean(q.lastName)) return null;
  const note = [`GHL contact ${q.contactId}`, q.quoteNumber ? `Quote ${q.quoteNumber}` : null].filter(Boolean).join(" · ");
  return {
    firstName: clean(q.firstName),
    lastName: clean(q.lastName),
    email,
    phone,
    address: clean(q.address),
    city: clean(q.city),
    postalCode: clean(q.postalCode).toUpperCase(),
    note,
  };
}

export function parseState(raw: unknown): PosState {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: PosState = {};
    for (const s of SYSTEMS) {
      const e = o?.[s] as Partial<PosEntry> | undefined;
      if (e && typeof e.id === "string" && e.id && (e.how === "created" || e.how === "linked")) out[s] = { id: e.id, how: e.how, at: String(e.at ?? "") };
    }
    return out;
  } catch {
    return {};
  }
}

export const serializeState = (s: PosState) => JSON.stringify(s);

/** The systems that are switched on and that this quote has no customer in yet. */
export const todo = (state: PosState, on: Record<PosSystem, boolean>): PosSystem[] => SYSTEMS.filter((s) => on[s] && !state[s]);

/** A GHL contact counts as won when any of its opportunities is won. */
export const isWonContact = (opps: { status: string | null }[]) => opps.some((o) => (o.status ?? "").toLowerCase() === "won");

/** The quote's log line for one run. */
export function logWords(results: { system: PosSystem; ok: boolean; how?: "created" | "linked"; message?: string }[]): string {
  return `POS customers: ${results
    .map((r) => `${SYSTEM_NAME[r.system]} ${r.ok ? (r.how === "created" ? "created" : "linked to an existing customer") : `failed (${r.message ?? "error"})`}`)
    .join("; ")}`;
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();
type Row = Record<string, unknown>;

/** Does a POS customer row match by email, or by phone (last 10 digits)? */
export function sameCustomer(row: Row, c: PosCustomer): boolean {
  const email = lower(row.email);
  if (c.email && email && email === c.email) return true;
  const want = digits(c.phone);
  if (want.length < 10) return false;
  return [row.phone, row.mobile].some((p) => digits(p).length >= 10 && digits(p).slice(-10) === want.slice(-10));
}

/** The query strings for Lightspeed's customer search, email first, then phone. */
export function lightspeedQueries(c: PosCustomer): string[] {
  const out: string[] = [];
  if (c.email) out.push(`email=${encodeURIComponent(c.email)}`);
  const d = digits(c.phone);
  if (d.length >= 10) out.push(`phone=${encodeURIComponent(c.phone)}`, `mobile=${encodeURIComponent(c.phone)}`);
  return out;
}

const idOf = (v: unknown): string | null => (typeof v === "string" || typeof v === "number") && String(v) ? String(v) : null;

/** The id of the first row that really matches (a search can be loose), or null. */
export function firstMatch(rows: unknown, c: PosCustomer): string | null {
  if (!Array.isArray(rows)) return null;
  for (const r of rows) if (r && typeof r === "object" && sameCustomer(r as Row, c)) return idOf((r as Row).id);
  return null;
}

/** Lightspeed X-Series POST /api/2.0/customers. No id, ever. */
export function lightspeedBody(c: PosCustomer): Record<string, string> {
  const b: Record<string, string> = { first_name: c.firstName, last_name: c.lastName, note: c.note };
  if (c.email) b.email = c.email;
  if (c.phone) b.phone = c.phone;
  if (c.address) b.physical_address_1 = c.address;
  if (c.city) b.physical_city = c.city;
  if (c.postalCode) b.physical_postcode = c.postalCode;
  if (c.address) {
    b.physical_state = "ON";
    b.physical_country_id = "CA";
  }
  return b;
}

/** Hike POST /api/v1/customers/createOrUpdate. No id, ever, so it can only create. */
export function hikeBody(c: PosCustomer): Record<string, unknown> {
  const b: Record<string, unknown> = { first_name: c.firstName, last_name: c.lastName, notes: c.note };
  if (c.email) b.email = c.email;
  if (c.phone) b.phone = c.phone;
  if (c.address) b.billing_address = { address1: c.address, city: c.city, state: "Ontario", country_code: "ca", country_name: "Canada", postcode: c.postalCode };
  return b;
}

/** The new customer's id in whatever shape the POS answered. */
export function createdId(data: unknown): string | null {
  const d = (data ?? {}) as Row;
  return idOf(d.id) ?? idOf((d.data as Row | undefined)?.id) ?? idOf((d.result as Row | undefined)?.id);
}
