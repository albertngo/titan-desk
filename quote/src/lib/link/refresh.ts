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

/**
 * The PP number and Notion page of an accepted quote's project (2026-10-27). Make 3710214 makes the
 * Notion project when the opportunity goes to Project Won and writes both back onto the opportunity;
 * the quote copies them the next time it opens. Blanks are filled, never overwritten: a PP number is
 * the project's identity, and a different one on the opportunity is for a person to look at. Only a
 * number that looks like one ("PP-412") and an https link are taken. Notion's page links are
 * notion.so, notion.site or, since 2026, app.notion.com ("https://app.notion.com/p/…").
 *
 * The job's CompanyCam link comes along too (2026-10-27): a quote started in the app, never booked,
 * has none of its own even when the opportunity has one from an earlier booking.
 */
export type ProjectPatch = { projectNumber?: string; notionProjectUrl?: string; companyCamUrl?: string };

const NOTION_PAGE = /^https:\/\/((www|app)\.)?notion\.(so|site|com)\//;
const COMPANYCAM = /^https:\/\/app\.companycam\.com\//;

export function projectPickup(
  copy: { projectNumber: string | null; notionProjectUrl: string | null; companyCamUrl?: string | null },
  live: { projectNumber: string | null; notionUrl: string | null; companyCamUrl?: string | null } | null,
): ProjectPatch {
  if (!live) return {};
  const patch: ProjectPatch = {};
  const pp = t(live.projectNumber)?.toUpperCase().replace(/^PP\s*-?\s*/, "PP-") ?? null;
  if (!t(copy.projectNumber) && pp && /^PP-\d{1,6}$/.test(pp)) patch.projectNumber = pp;
  const url = t(live.notionUrl);
  if (!t(copy.notionProjectUrl) && url && NOTION_PAGE.test(url)) patch.notionProjectUrl = url;
  const cam = t(live.companyCamUrl);
  if (!t(copy.companyCamUrl) && cam && COMPANYCAM.test(cam)) patch.companyCamUrl = cam;
  return patch;
}

