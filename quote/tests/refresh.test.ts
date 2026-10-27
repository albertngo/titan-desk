import { describe, expect, it } from "vitest";
import { customerRefresh, type CustomerCopy, type LiveContact, projectPickup } from "../src/lib/link/refresh";

// INVENTED people and addresses only: this repo is public.
const copy = (o: Partial<CustomerCopy> = {}): CustomerCopy => ({
  firstName: "Jane",
  lastName: "Doe",
  phone: "416-555-0199",
  email: "jane@example.com",
  siteAddress: "1 Old Rd",
  siteCity: "Oldtown",
  addressStatus: "Unconfirmed",
  projectNumber: null,
  ...o,
});
const contact = (o: Partial<LiveContact> = {}): LiveContact => ({
  firstName: "Jane",
  lastName: "Doe",
  phone: "+14165550199",
  email: "JANE@example.com",
  address: "1 Old Rd",
  city: "Oldtown",
  ...o,
});

describe("bringing a quote's customer copy up to date from GHL", () => {
  it("changes nothing when GHL says the same thing, however it is written", () => {
    expect(customerRefresh(copy(), contact({ address: " 1 old rd " }), null)).toEqual({});
  });

  it("follows the contact's name, phone and email", () => {
    expect(customerRefresh(copy(), contact({ firstName: "Janet", phone: "(905) 555-0100", email: "j@example.com" }), null)).toEqual({
      firstName: "Janet",
      phone: "905-555-0100",
      email: "j@example.com",
    });
  });

  it("follows the contact's address while it is unconfirmed", () => {
    expect(customerRefresh(copy(), contact({ address: "12 Example St", city: "Newtown" }), { address: "1 Old Rd", city: "Oldtown" })).toEqual({
      siteAddress: "12 Example St",
      siteCity: "Newtown",
    });
  });

  it("marks an address that arrives later as unconfirmed", () => {
    expect(customerRefresh(copy({ siteAddress: null, siteCity: null, addressStatus: "No address" }), contact({ address: "12 Example St" }), null)).toEqual({
      siteAddress: "12 Example St",
      siteCity: "Oldtown",
      addressStatus: "Unconfirmed",
    });
  });

  it("follows the opportunity, not the contact, once the site is confirmed", () => {
    const c = copy({ addressStatus: "Confirmed" });
    // The customer moved house: the confirmed job site does not move with them.
    expect(customerRefresh(c, contact({ address: "99 Home Ave" }), { address: "1 Old Rd", city: "Oldtown" })).toEqual({});
    expect(customerRefresh(c, contact(), { address: "5 Site Cres", city: null })).toEqual({ siteAddress: "5 Site Cres" });
  });

  it("leaves the address alone once won: the Notion project owns it", () => {
    expect(customerRefresh(copy({ projectNumber: "PP-412" }), contact({ address: "12 Example St", firstName: "Janet" }), null)).toEqual({ firstName: "Janet" });
  });

  it("never blanks a value GHL is missing, and does nothing without GHL", () => {
    expect(customerRefresh(copy(), contact({ firstName: null, phone: null, email: null, address: null, city: null }), null)).toEqual({});
    expect(customerRefresh(copy({ addressStatus: "Confirmed" }), null, null)).toEqual({});
  });
});

describe("an accepted quote picks up its Notion project (2026-10-27)", () => {
  const blank = { projectNumber: null, notionProjectUrl: null };

  it("copies the PP number and the Notion page Make wrote back onto the opportunity", () => {
    expect(projectPickup(blank, { projectNumber: "PP-412", notionUrl: "https://www.notion.so/Titan-Project-abc123" })).toEqual({ projectNumber: "PP-412", notionProjectUrl: "https://www.notion.so/Titan-Project-abc123" });
    expect(projectPickup(blank, { projectNumber: "pp 77", notionUrl: null })).toEqual({ projectNumber: "PP-77" });
    // Notion's 2026 page links (app.notion.com/p/…), once the PP number is already there.
    expect(projectPickup({ projectNumber: "PP-77", notionProjectUrl: null }, { projectNumber: "PP-77", notionUrl: "https://app.notion.com/p/abc123" })).toEqual({ notionProjectUrl: "https://app.notion.com/p/abc123" });
    // The job's CompanyCam link, when the quote has none; never over one it has, never a look-alike.
    expect(projectPickup(blank, { projectNumber: null, notionUrl: null, companyCamUrl: "https://app.companycam.com/projects/123" })).toEqual({ companyCamUrl: "https://app.companycam.com/projects/123" });
    expect(projectPickup({ ...blank, companyCamUrl: "https://app.companycam.com/projects/9" }, { projectNumber: null, notionUrl: null, companyCamUrl: "https://app.companycam.com/projects/123" })).toEqual({});
    expect(projectPickup(blank, { projectNumber: null, notionUrl: "https://app.notion.com.evil.example/p/x", companyCamUrl: "https://evil.example/app.companycam.com/" })).toEqual({});
  });

  it("fills blanks only, and takes only what looks right", () => {
    expect(projectPickup({ projectNumber: "PP-400", notionProjectUrl: null }, { projectNumber: "PP-412", notionUrl: null })).toEqual({});
    expect(projectPickup(blank, { projectNumber: "412", notionUrl: "http://example.com/x" })).toEqual({});
    expect(projectPickup(blank, { projectNumber: "Q-1234", notionUrl: "https://evil.example/notion.so/" })).toEqual({});
    expect(projectPickup(blank, null)).toEqual({});
  });
});
