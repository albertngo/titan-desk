/**
 * POS customers (Albert, 2026-11-23; vault 05_decisions/2026-11-23-quote-pos-customers): a won GHL contact is made a
 * customer in Lightspeed and in Hike. Pure: what is sent, what the quote's "POS Customers" cell holds, and which
 * systems still need doing. Tested in tests/pos.test.ts. The sending is src/lib/quotes/pos.ts.
 *
 * Make's `customer` route searches the POS by email, then phone. A hit is linked and never edited; only a miss is
 * created. It never updates, merges or deletes a customer.
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
