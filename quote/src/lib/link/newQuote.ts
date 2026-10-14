import { displayPhone, normalizeEmail, normalizePhone } from "./identity";
import { isTiming, type Timing } from "./lead";

/**
 * What the New quote screen sends, checked before anything is written. Pure, no I/O.
 *
 * Two ways in (Albert, 2026-10-13/14):
 * - an existing GHL contact, with one of their opportunities or a new one;
 * - a brand-new customer (the one time the app takes customer details), with a new opportunity.
 * Every preliminary asks when they plan to do the project.
 */

export type NewCustomer = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
};

export type NewQuoteRequest = {
  contactId: string | null;
  /** An existing opportunity's id, or null for "create a new opportunity". */
  opportunityId: string | null;
  timing: Timing;
  /** Staff confirmed the contact's address is the site for this quote. */
  addressConfirmed: boolean;
  newCustomer: NewCustomer | null;
  /** Staff saw the GHL matches for this phone or email and confirmed it's a different person. */
  forceNew: boolean;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const GHL_ID = /^[A-Za-z0-9]{6,40}$/;

function text(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t === "" ? null : t.slice(0, max);
}

export function parseNewQuote(raw: unknown): Parsed<NewQuoteRequest> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!isTiming(r.timing)) return { ok: false, message: "Choose when they're planning to do the project." };

  const contactId = text(r.contactId, 40);
  const opportunityId = text(r.opportunityId, 40);
  if (contactId && !GHL_ID.test(contactId)) return { ok: false, message: "That GHL contact id isn't valid." };
  if (opportunityId && !GHL_ID.test(opportunityId)) return { ok: false, message: "That GHL opportunity id isn't valid." };

  if (contactId) {
    return { ok: true, value: { contactId, opportunityId, timing: r.timing, addressConfirmed: r.addressConfirmed === true, newCustomer: null, forceNew: false } };
  }
  if (opportunityId) return { ok: false, message: "Pick the customer before their opportunity." };

  const n = (r.newCustomer && typeof r.newCustomer === "object" ? r.newCustomer : {}) as Record<string, unknown>;
  const firstName = text(n.firstName, 80);
  const lastName = text(n.lastName, 80);
  const phoneRaw = text(n.phone, 40);
  const emailRaw = text(n.email, 120);
  if (!firstName && !lastName) return { ok: false, message: "Type the new customer's name." };
  if (!phoneRaw && !emailRaw) return { ok: false, message: "Add a phone number or an email, so GHL can reach them." };
  if (phoneRaw && !normalizePhone(phoneRaw)) return { ok: false, message: "That phone number doesn't look right. Use 10 digits, e.g. 416-555-0123." };
  if (emailRaw && !normalizeEmail(emailRaw)) return { ok: false, message: "That email doesn't look right." };
  const address = text(n.address);
  const city = text(n.city, 80);
  return {
    ok: true,
    value: {
      contactId: null,
      opportunityId: null,
      timing: r.timing,
      // Typed for this quote by the person creating it, so it's confirmed when present.
      addressConfirmed: Boolean(address),
      newCustomer: { firstName, lastName, phone: phoneRaw ? displayPhone(phoneRaw) : null, email: normalizeEmail(emailRaw), address, city },
      forceNew: r.forceNew === true,
    },
  };
}
