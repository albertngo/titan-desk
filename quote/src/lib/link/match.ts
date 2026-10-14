import { normalizeEmail, normalizePhone } from "./identity";

/**
 * Finding which quote a GHL contact or opportunity belongs to, and merging what each side
 * knows. Pure, no I/O. Every caller uses this: the New quote screen, the booking step in Make
 * (through the app), and Address arrived.
 *
 * Rules (Albert, 2026-10-13/14):
 * - Keys in order of strength: opportunity id, contact id, phone, email. Never a name.
 * - The first key that finds anything decides. Two hits on that key is "ambiguous" and a
 *   person picks; it never falls through to a weaker key to break the tie.
 * - A quote already tied to a DIFFERENT opportunity (or contact) than the one asked about is
 *   never a match on a weaker key. A returning customer's new opportunity must not be glued
 *   onto their old quote just because the phone number is the same.
 * - Merging fills blanks only. Two different values are reported, never overwritten.
 */

export type QuoteKeys = {
  id: string;
  opportunityId: string | null;
  contactId: string | null;
  phone: string | null;
  email: string | null;
};

export type Probe = {
  opportunityId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type MatchKey = "opportunity" | "contact" | "phone" | "email";

export type MatchResult =
  | { kind: "one"; id: string; by: MatchKey }
  | { kind: "ambiguous"; ids: string[]; by: MatchKey }
  | { kind: "none" };

const id = (s: string | null | undefined) => s?.trim() || null;

export function matchQuote(quotes: QuoteKeys[], probe: Probe): MatchResult {
  const opp = id(probe.opportunityId);
  const contact = id(probe.contactId);
  const phone = normalizePhone(probe.phone);
  const email = normalizeEmail(probe.email);

  // A quote tied elsewhere can't be this one, whatever its phone says.
  const compatible = (q: QuoteKeys, upTo: MatchKey) => {
    if (upTo !== "opportunity" && opp && q.opportunityId && q.opportunityId !== opp) return false;
    if ((upTo === "phone" || upTo === "email") && contact && q.contactId && q.contactId !== contact) return false;
    return true;
  };

  const levels: [MatchKey, string | null, (q: QuoteKeys) => boolean][] = [
    ["opportunity", opp, (q) => q.opportunityId === opp],
    ["contact", contact, (q) => q.contactId === contact],
    ["phone", phone, (q) => normalizePhone(q.phone) === phone],
    ["email", email, (q) => normalizeEmail(q.email) === email],
  ];

  for (const [by, value, eq] of levels) {
    if (!value) continue;
    const hits = quotes.filter((q) => compatible(q, by) && eq(q));
    if (hits.length === 1) return { kind: "one", id: hits[0].id, by };
    if (hits.length > 1) return { kind: "ambiguous", ids: hits.map((q) => q.id), by };
  }
  return { kind: "none" };
}

export type Conflict<K extends string> = { field: K; current: string; incoming: string };

const blank = (v: string | null | undefined) => !v || v.trim() === "";
const same = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * What to write so `current` gains everything `incoming` knows, without overwriting anything.
 * Blank fields are filled; fields that differ come back as conflicts for a person.
 */
export function fillBlanks<K extends string>(
  current: Partial<Record<K, string | null>>,
  incoming: Partial<Record<K, string | null>>,
): { patch: Partial<Record<K, string>>; conflicts: Conflict<K>[] } {
  const patch: Partial<Record<K, string>> = {};
  const conflicts: Conflict<K>[] = [];
  for (const field of Object.keys(incoming) as K[]) {
    const inc = incoming[field];
    if (blank(inc)) continue;
    const cur = current[field];
    if (blank(cur)) patch[field] = inc!.trim();
    else if (!same(cur!, inc!)) conflicts.push({ field, current: cur!.trim(), incoming: inc!.trim() });
  }
  return { patch, conflicts };
}
