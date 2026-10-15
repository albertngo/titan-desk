import { displayPhone, normalizeEmail, normalizePhone } from "./identity";

/**
 * Keeping a quote's customer copy in step with GHL (Albert, 2026-10-14). Pure, no I/O: the
 * quote page reads GHL when it opens and this decides what, if anything, changes on the copy.
 *
 * - Name, phone and email follow the GHL contact.
 * - An unconfirmed address is only the contact's address, so it follows the contact.
 * - A confirmed address is the site: it follows the opportunity's Project Address.
 * - Once won (a PP number), the address belongs to the Notion project and is left alone.
 * - Nothing is ever blanked: an empty value in GHL keeps what the quote has.
 */

export type CustomerCopy = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  siteAddress: string | null;
  siteCity: string | null;
  addressStatus: string | null;
  projectNumber: string | null;
};

export type LiveContact = { firstName: string | null; lastName: string | null; phone: string | null; email: string | null; address: string | null; city: string | null };
export type LiveSite = { address: string | null; city: string | null };

export type CustomerPatch = Partial<Pick<CustomerCopy, "firstName" | "lastName" | "phone" | "email" | "siteAddress" | "siteCity" | "addressStatus">>;

const t = (v: string | null | undefined) => v?.trim().replace(/\s+/g, " ") || null;
const differs = (a: string | null, b: string | null) => (a ?? "").toLowerCase() !== (b ?? "").toLowerCase();

export function customerRefresh(copy: CustomerCopy, contact: LiveContact | null, site: LiveSite | null): CustomerPatch {
  const patch: CustomerPatch = {};
  if (contact) {
    const first = t(contact.firstName);
    const last = t(contact.lastName);
    if (first && first !== copy.firstName) patch.firstName = first;
    if (last && last !== copy.lastName) patch.lastName = last;
    const phone = normalizePhone(contact.phone);
    if (phone && phone !== normalizePhone(copy.phone)) patch.phone = displayPhone(phone);
    const email = normalizeEmail(contact.email);
    if (email && email !== normalizeEmail(copy.email)) patch.email = email;
  }

  if (t(copy.projectNumber)) return patch;
  const confirmed = copy.addressStatus === "Confirmed";
  const from = confirmed ? site : contact;
  const address = t(from?.address);
  if (!address) return patch;
  const city = t(from?.city);
  if (differs(address, t(copy.siteAddress)) || (city && differs(city, t(copy.siteCity)))) {
    patch.siteAddress = address;
    if (city) patch.siteCity = city;
    if (!confirmed && copy.addressStatus !== "Unconfirmed") patch.addressStatus = "Unconfirmed";
  }
  return patch;
}
