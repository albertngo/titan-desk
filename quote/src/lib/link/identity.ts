/**
 * Customer identity: how a phone, an email and a name are compared and shown. Pure, no I/O.
 *
 * Matching never uses a name (two Jane Smiths are two customers); it uses the GHL ids, then a
 * normalised phone, then a normalised email. Names are only ever displayed.
 */

/** North American numbers become +1XXXXXXXXXX; other numbers written with a leading + keep it. Anything else is not a phone. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** 416-555-0123 for North American numbers, the normalised form otherwise. */
export function displayPhone(raw: string | null | undefined): string | null {
  const p = normalizePhone(raw);
  if (!p) return raw?.trim() || null;
  return p.startsWith("+1") ? `${p.slice(2, 5)}-${p.slice(5, 8)}-${p.slice(8)}` : p;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = raw?.trim().toLowerCase();
  return e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

/** Quote numbers come from the Airtable autonumber: Seq 1 is Q-1001. Mirrors the Quote Number formula. */
export const QUOTE_NUMBER_OFFSET = 1000;
export const quoteNumber = (seq: number) => `Q-${QUOTE_NUMBER_OFFSET + seq}`;
export const versionLabel = (quoteNo: string, version: number) => `${quoteNo} v${version}`;

export type NameParts = {
  first?: string | null;
  last?: string | null;
  customerName?: string | null;
  phone?: string | null;
  /** When the quote was created: its month is in the name, so the name never changes. */
  createdAt: string | Date;
  quoteNumber: string;
  projectNumber?: string | null;
};

const clean = (s: string | null | undefined) => s?.trim() || null;

/** "1026" for October 2026, in Toronto time: the MMYY staff already use on folders. */
export function monthYear(at: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "2-digit", year: "2-digit" }).formatToParts(new Date(at));
  const part = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
  return `${part("month")}${part("year")}`;
}

/**
 * The one name every folder, CompanyCam project and GHL opportunity carries:
 * "Jane Smith - 1026 - Q-1234", with " - PP-412" once won. First name first (Albert,
 * 2026-10-14); the month the quote was created, not the city, which customers type loosely
 * (Albert, 2026-10-15). Phone stands in for an unknown name. Mirrors the Display Name formula
 * on the Quotes table; change both together.
 */
export function displayName(p: NameParts): string {
  const who = [clean(p.first), clean(p.last)].filter(Boolean).join(" ") || clean(p.customerName) || clean(p.phone);
  const pp = clean(p.projectNumber);
  return `${who ? `${who} - ` : ""}${monthYear(p.createdAt)} - ${p.quoteNumber}${pp ? ` - ${pp}` : ""}`;
}

/**
 * Whether a GHL contact is the person someone is about to add as new: the same phone or the
 * same email. A name match alone never counts (two Jane Smiths are two customers).
 */
export function sameCustomer(contact: { phone: string | null; email: string | null }, typed: { phone: string | null; email: string | null }): boolean {
  const p = normalizePhone(typed.phone);
  const e = normalizeEmail(typed.email);
  return (p !== null && normalizePhone(contact.phone) === p) || (e !== null && normalizeEmail(contact.email) === e);
}
