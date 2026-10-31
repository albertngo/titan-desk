import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RATE_TABLE, STAIR_TABLE, T, WRITABLE_TABLES } from "../src/lib/airtable/fields";

/**
 * Structural rules for the quoting app, checked on the source text so a mistake fails CI
 * before it can ever deploy. See quote/CLAUDE.md.
 */

const SRC = path.resolve(__dirname, "../src");
const CLIENT = "lib/airtable/client.ts";
const GHL = "lib/ghl/client.ts";
/** The only files allowed to create or update Airtable records. Adding one is a reviewed decision. */
const WRITERS = ["lib/quotes/start.ts", "lib/quotes/save.ts", "lib/quotes/refresh.ts", "lib/quotes/records.ts", "lib/quotes/booking.ts", "lib/quotes/link.ts", "lib/quotes/send.ts", "lib/quotes/rooms.ts", "lib/quotes/address.ts", "lib/quotes/activity.ts", "lib/accept/record.ts", "lib/quotes/sitesheet.ts", "lib/quotes/billing.ts"];
const CATALOGUE = "tblfLXD3zkSdNQGbS";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const all = files(SRC).map((p) => ({ rel: path.relative(SRC, p).split(path.sep).join("/"), text: readFileSync(p, "utf8") }));
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("Airtable boundary", () => {
  it("has exactly one file that talks to Airtable", () => {
    const callers = all.filter((f) => code(f.text).includes("api.airtable.com")).map((f) => f.rel);
    expect(callers).toEqual([CLIENT]);
  });

  it("reads the Airtable token in that file only", () => {
    const readers = all.filter((f) => code(f.text).includes("QUOTE_AIRTABLE_TOKEN")).map((f) => f.rel);
    expect(readers).toEqual([CLIENT]);
  });

  it("never deletes or replaces: the Airtable client knows GET, POST and PATCH only", () => {
    const client = code(all.find((f) => f.rel === CLIENT)!.text);
    for (const verb of ["PUT", "DELETE"]) expect(client).not.toMatch(new RegExp(`["'\`]${verb}["'\`]`));
    // Every write goes through write(), which refuses any table outside WRITABLE_TABLES.
    expect(client).toMatch(/if \(!WRITABLE_TABLES\.includes\(table\)\) throw/);
    // The customer deployment never writes, whatever its token allows.
    expect(client).toMatch(/if \(isCustomerDeployment\(\)\) throw/);
    // Three requests in the whole file: get(), write() and, since 2026-10-28, uploadAttachment() (the site
    // sheet's photos), which runs the same table and deployment checks first. A fourth would bypass them.
    expect(client.match(/\bfetch\(/g)?.length).toBe(3);
    expect(client).toMatch(/export async function uploadAttachment\([^)]*\)[^{]*\{\s*if \(!WRITABLE_TABLES\.includes\(table\)\) throw[^\n]*\n\s*if \(isCustomerDeployment\(\)\) throw/);
    // Airtable's upload host is named in the client only.
    expect(all.filter((f) => code(f.text).includes("content.airtable.com")).map((f) => f.rel)).toEqual([CLIENT]);
  });

  it("writes to the four quote tables and Invoices / Receipts (2026-10-30) only, never the catalogue, Rate Card or Stair Items", () => {
    expect([...WRITABLE_TABLES].sort()).toEqual([T.quotes, T.versions, T.options, T.lines, T.invoices, T.receipts].sort());
    for (const t of [RATE_TABLE, STAIR_TABLE, CATALOGUE]) expect(WRITABLE_TABLES).not.toContain(t);
  });

  it("creates and updates records from the allowed files only", () => {
    const writers = all
      .filter((f) => f.rel !== CLIENT && /\b(createRecords?|updateRecords?)\(/.test(code(f.text)))
      .map((f) => f.rel)
      .sort();
    expect(writers.every((w) => WRITERS.includes(w))).toBe(true);
    expect(writers).toContain("lib/quotes/save.ts");
  });

  it("writes the contract (Quotes → Contract, 2026-10-30) from acceptance and a sent change only", () => {
    const writes = all.filter((f) => /\[QUOTE\.contract\]:/.test(code(f.text))).map((f) => f.rel).sort();
    expect(writes).toEqual(["lib/accept/record.ts", "lib/quotes/send.ts"]);
    expect(all.filter((f) => /serializeContract\(/.test(code(f.text)) && !f.rel.startsWith("lib/contract/")).map((f) => f.rel).sort()).toEqual(writes);
  });

  it("keeps the client, the loaders and the auth check server-only", () => {
    for (const rel of [CLIENT, GHL, "lib/quotes/load.ts", "lib/quotes/start.ts", "lib/quotes/save.ts", "lib/quotes/refresh.ts", "lib/quotes/records.ts", "lib/quotes/booking.ts", "lib/quotes/link.ts", "lib/quotes/send.ts", "lib/quotes/rooms.ts", "lib/quotes/customer.ts", "lib/quotes/conversation.ts", "lib/quotes/address.ts", "lib/quotes/activity.ts", "lib/activity/relay.ts", "lib/quotes/acceptClient.ts", "lib/accept/record.ts", "lib/accept/accept.ts", "lib/accept/staff.ts", "lib/accept/live.ts", "lib/quotes/sitesheet.ts", "lib/anthropic/client.ts", "lib/quotes/billing.ts", "lib/notion/payments.ts", "lib/companycam/client.ts", "lib/quotes/companycam.ts", "lib/auth.ts"]) {
      expect(all.find((f) => f.rel === rel)!.text).toMatch(/^import "server-only";/m);
    }
  });

  it("never imports Airtable code into a browser component", () => {
    const leaks = all
      .filter((f) => /^["']use client["'];?/m.test(f.text))
      .filter((f) => /^import (?!type )[^;]*from ["']@\/lib\/(airtable|quotes\/load|quotes\/start|quotes\/save|quotes\/refresh|quotes\/records|quotes\/booking|quotes\/link|quotes\/send|quotes\/rooms|quotes\/customer|quotes\/conversation|quotes\/address|quotes\/activity|activity\/relay|quotes\/acceptClient|accept\/record|accept\/accept|accept\/staff|accept\/live|quotes\/sitesheet|quotes\/billing|quotes\/companycam|companycam\/client|notion\/payments|anthropic\/client|ghl\/client|make\/client|auth)/m.test(f.text))
      .map((f) => f.rel);
    expect(leaks).toEqual([]);
  });

  it("never exposes an Airtable setting to the browser", () => {
    expect(all.filter((f) => /NEXT_PUBLIC_[A-Z_]*(AIRTABLE|GHL|MAKE|ANTHROPIC|NOTION|COMPANYCAM)/.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("checks the quoter allowlist in both the proxy and every loader", () => {
    expect(all.find((f) => f.rel === "proxy.ts")!.text).toContain("isQuoter(");
    for (const rel of ["lib/quotes/load.ts", "lib/quotes/start.ts", "lib/quotes/save.ts", "lib/quotes/refresh.ts", "lib/quotes/link.ts", "lib/quotes/send.ts", "lib/quotes/rooms.ts", "lib/quotes/conversation.ts", "lib/quotes/address.ts", "lib/quotes/sitesheet.ts", "lib/quotes/billing.ts", "lib/quotes/companycam.ts"]) {
      const text = all.find((f) => f.rel === rel)!.text;
      const exported = text.match(/export async function \w+/g) ?? [];
      const guarded = text.match(/export async function \w+[^{]*\{\s*(const \w+ = )?await requireQuoter(Person)?\(\);/g) ?? [];
      expect(exported.length).toBeGreaterThan(0);
      expect(guarded.length).toBe(exported.length);
    }
  });
});

describe("booking step (Make, no sign-in)", () => {
  const BOOKING = "lib/quotes/booking.ts";
  const ROUTE = "app/api/booking/route.ts";

  it("checks the shared key before anything else, in the route and in every function it calls", () => {
    const route = code(all.find((f) => f.rel === ROUTE)!.text);
    expect(route).toMatch(/export async function POST\(req: Request\) \{\s*const key = req\.headers\.get\("x-quote-key"\);\s*if \(!bookingKeyOk\(key\)\) return/);
    const text = code(all.find((f) => f.rel === BOOKING)!.text);
    const exported = text.match(/export async function \w+/g) ?? [];
    const guarded = text.match(/export async function \w+[^{]*\{\s*if \(!bookingKeyOk\(key\)\) return/g) ?? [];
    expect(exported.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(exported.length);
    // A missing key turns the step off; it never opens it.
    expect(text).toMatch(/if \(!want \|\| !given\) return false;/);
  });

  it("is one of the three paths the staff app lets through without a sign-in, besides signing in", () => {
    const proxy = all.find((f) => f.rel === "proxy.ts")!.text;
    expect(proxy).toContain('matcher: ["/((?!_next/|brand/|favicon\\\\.ico|robots\\\\.txt).*)"]');
    expect(proxy).toContain("const OPEN_ON_STAFF = /^\\/(login|auth\\/|denied|api\\/booking|api\\/activity|api\\/accept)/;");
    // Open tracking and acceptance (2026-10-27) are the other two key-gated routes; see their own blocks below.
    // Report a bug and Upload site sheet (2026-10-28) are the API routes that are NOT open: the proxy signs people in first.
    expect(all.filter((f) => f.rel.startsWith("app/api/")).map((f) => f.rel).sort()).toEqual(["app/api/accept/route.ts", "app/api/activity/route.ts", ROUTE, "app/api/bug/route.ts", "app/api/sitesheet/route.ts"]);
  });

  it("keeps the shared quote helpers away from pages and actions", () => {
    const importers = all.filter((f) => /from ["']\.\/records["']|from ["']@\/lib\/quotes\/records["']/.test(f.text)).map((f) => f.rel).sort();
    expect(importers).toEqual([BOOKING, "lib/quotes/link.ts", "lib/quotes/start.ts"]);
    expect(all.filter((f) => /from ["']@\/lib\/quotes\/booking["']/.test(f.text)).map((f) => f.rel)).toEqual([ROUTE]);
  });
});

describe("Claude boundary (2026-10-28: reading the stair site sheet)", () => {
  const CLAUDE = "lib/anthropic/client.ts";
  it("has exactly one file that talks to Claude, and it alone reads the key", () => {
    expect(all.filter((f) => code(f.text).includes("api.anthropic.com")).map((f) => f.rel)).toEqual([CLAUDE]);
    expect(all.filter((f) => code(f.text).includes("QUOTE_ANTHROPIC_KEY")).map((f) => f.rel)).toEqual([CLAUDE]);
    expect(code(all.find((f) => f.rel === CLAUDE)!.text).match(/\bfetch\(/g)?.length).toBe(1);
  });

  it("is reached only from the site sheet writer, which writes the Quotes table only", () => {
    expect(all.filter((f) => /from ["']@\/lib\/anthropic\/client["']/.test(f.text)).map((f) => f.rel)).toEqual(["lib/quotes/sitesheet.ts"]);
    const text = code(all.find((f) => f.rel === "lib/quotes/sitesheet.ts")!.text);
    for (const m of text.matchAll(/\b(?:updateRecord|uploadAttachment)\((T\.\w+)/g)) expect(m[1]).toBe("T.quotes");
    expect(text).not.toMatch(/\bcreateRecords?\(|updateRecords\(/);
    expect(all.filter((f) => /from ["']@\/lib\/quotes\/sitesheet["']/.test(f.text)).map((f) => f.rel).sort()).toEqual(["app/api/sitesheet/route.ts", "app/q/[id]/actions.ts", "app/q/[id]/page.tsx"]);
  });

  it("never runs on the customer deployment: the route answers 404 there and the client refuses", () => {
    expect(code(all.find((f) => f.rel === "app/api/sitesheet/route.ts")!.text)).toMatch(/export async function POST\(request: NextRequest\) \{\s*if \(isCustomerDeployment\(\)\) return/);
    expect(code(all.find((f) => f.rel === CLAUDE)!.text)).toMatch(/if \(!key \|\| isCustomerDeployment\(\)\) throw/);
  });
});

describe("CompanyCam boundary (2026-10-30: the job's photos on the quote page)", () => {
  const CAM = "lib/companycam/client.ts";
  const LOADER = "lib/quotes/companycam.ts";

  it("has exactly one file that talks to CompanyCam, and it alone reads the token", () => {
    expect(all.filter((f) => code(f.text).includes("api.companycam.com")).map((f) => f.rel)).toEqual([CAM]);
    expect(all.filter((f) => code(f.text).includes("QUOTE_COMPANYCAM_TOKEN")).map((f) => f.rel).sort()).toEqual([CAM]);
  });

  it("only reads: GET, one request, never on the customer deployment", () => {
    const client = code(all.find((f) => f.rel === CAM)!.text);
    for (const verb of ["POST", "PATCH", "PUT", "DELETE"]) expect(client).not.toMatch(new RegExp(`["'\`]${verb}["'\`]`));
    expect(client).toMatch(/method: "GET"/);
    expect(client.match(/\bfetch\(/g)?.length).toBe(1);
    expect(client).toMatch(/if \(!token \|\| isCustomerDeployment\(\)\) throw/);
  });

  it("is read live and stored nowhere, reached only from the loader, and the loader only from the quote page", () => {
    expect(all.filter((f) => /from ["']@\/lib\/companycam\/client["']/.test(f.text)).map((f) => f.rel)).toEqual([LOADER]);
    const loader = code(all.find((f) => f.rel === LOADER)!.text);
    expect(loader).not.toMatch(/airtable|createRecord|updateRecord|make\/client|sendToGhl/);
    expect(all.filter((f) => /^import (?!type )[^;]*from ["']@\/lib\/quotes\/companycam["']/m.test(f.text)).map((f) => f.rel)).toEqual(["app/q/[id]/page.tsx"]);
    // Staff only: the tab is never drawn in Customer view.
    expect(all.find((f) => f.rel === "app/q/[id]/page.tsx")!.text).toMatch(/const showPhotos = opt === "photos" && !customer/);
  });
});

describe("GHL boundary", () => {
  it("has exactly one file that talks to GHL, and it alone reads the token", () => {
    // lib/ghl/ids.ts may spell the host once, for the public booking page a preliminary's email links
    // (2026-10-23): a constant, no request. The client is still the only file that fetches from it.
    expect(all.filter((f) => code(f.text).includes("leadconnectorhq.com")).map((f) => f.rel).sort()).toEqual([GHL, "lib/ghl/ids.ts"].sort());
    const ids = code(all.find((f) => f.rel === "lib/ghl/ids.ts")!.text);
    expect(ids).not.toMatch(/\bfetch\(|import .* from/);
    expect(ids).toMatch(/widget\/booking\//);
    expect(all.filter((f) => code(f.text).includes("QUOTE_GHL_TOKEN")).map((f) => f.rel)).toEqual([GHL]);
  });

  it("only reads: no write verb in the GHL client", () => {
    const client = code(all.find((f) => f.rel === GHL)!.text);
    for (const verb of ["POST", "PATCH", "PUT", "DELETE"]) expect(client).not.toMatch(new RegExp(`["'\`]${verb}["'\`]`));
    // One request function, GET, and every call goes through it.
    expect(client).toMatch(/method: "GET"/);
    expect(client.match(/\bfetch\(/g)?.length).toBe(1);
  });

  it("the conversation is read live, stored nowhere, and shown only to a quoter on the staff app", () => {
    const loader = code(all.find((f) => f.rel === "lib/quotes/conversation.ts")!.text);
    // Never written to Airtable: the loader knows no Airtable function at all.
    expect(loader).not.toMatch(/airtable|createRecord|updateRecord/);
    // Only the conversation reads: no contact search, no opportunity change.
    expect(loader).not.toMatch(/make\/client|sendToGhl/);
    // The pages leave it out in Customer view, and the customer pages never import it.
    for (const page of ["app/q/[id]/page.tsx", "app/q/[id]/edit/page.tsx"]) {
      expect(all.find((f) => f.rel === page)!.text).toMatch(/\{!customer && quote\.link\?\.ghlContactId && <ConversationDrawer/);
    }
    expect(all.find((f) => f.rel === "app/new/page.tsx")!.text).toMatch(/conversation=\{!customer\}/);
    const importers = all.filter((f) => /from ["'](@\/app\/actions\/conversation|@\/lib\/quotes\/conversation|@\/components\/Conversation|\.\/Conversation)["']/.test(f.text)).map((f) => f.rel).sort();
    expect(importers).toEqual(["app/actions/conversation.ts", "app/q/[id]/edit/page.tsx", "app/q/[id]/page.tsx", "components/Conversation.tsx", "components/NewQuote.tsx"]);
  });
});

describe("Make boundary", () => {
  it("has exactly one file that sends to Make, and it alone reads the hook and key", () => {
    expect(all.filter((f) => /QUOTE_MAKE_GHL_(HOOK|KEY)/.test(code(f.text))).map((f) => f.rel)).toEqual(["lib/make/client.ts"]);
    expect(all.filter((f) => /hook\.[a-z0-9]+\.make\.com|make\.com\//.test(code(f.text))).map((f) => f.rel)).toEqual([]);
  });

  it("is server-only and only reached from starting, booking, linking, sending and tracking a quote, Address arrived, and acceptance", () => {
    expect(all.find((f) => f.rel === "lib/make/client.ts")!.text).toMatch(/^import "server-only";/m);
    const callers = all.filter((f) => f.rel !== "lib/make/client.ts" && /from ["']@\/lib\/make\/client["']/.test(f.text)).map((f) => f.rel);
    expect(callers.sort()).toEqual(["lib/accept/record.ts", "lib/quotes/activity.ts", "lib/quotes/address.ts", "lib/quotes/billing.ts", "lib/quotes/booking.ts", "lib/quotes/link.ts", "lib/quotes/send.ts", "lib/quotes/start.ts"]);
  });

  it("Address arrived fills only the contact in GHL and only the Quotes table in Airtable", () => {
    const text = code(all.find((f) => f.rel === "lib/quotes/address.ts")!.text);
    // Its one GHL request puts the street on the contact; the opportunity gets a site only from Confirm address.
    expect(text.match(/sendToGhl\(/g)?.length).toBe(1);
    expect(text).toMatch(/sendToGhl\(\s*buildContactAddress\(/);
    expect(text).not.toMatch(/buildLinkJob|buildGhlRequest|buildBookingOpportunity|sendMessage/);
    const writes = text.match(/\b(createRecords?|updateRecords?)\([^,]+/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const call of writes) expect(call).toMatch(/\(T\.quotes$/);
    expect(text).not.toMatch(/\bcreateRecords?\(/);
  });
});

describe("customer links (no sign-in, customer deployment only)", () => {
  const LOADER = "lib/quotes/customer.ts";
  const text = () => code(all.find((f) => f.rel === LOADER)!.text);

  it("answers only on the customer deployment and only for a well-formed token, before touching Airtable", () => {
    const exported = text().match(/export async function \w+/g) ?? [];
    const guarded = text().match(/export async function \w+\(token: string\)[^{]*\{\s*if \(!isCustomerDeployment\(\) \|\| !isToken\(token\)\) return null;/g) ?? [];
    // customerQuote and, since 2026-10-30, customerBilling (the invoice or receipt snapshot).
    expect(exported.length).toBe(2);
    expect(guarded.length).toBe(2);
  });

  it("reads only: no write, no sign-in code, and it returns the frozen copy, not live lines", () => {
    expect(text()).not.toMatch(/\b(createRecords?|updateRecords?)\(/);
    expect(text()).not.toMatch(/requireQuoter|@\/lib\/auth|getQuote|VERSION\.(lines|options|notes)|T\.(lines|options)/);
    expect(text()).toMatch(/parseCopy\(/);
  });

  it("is reached from the customer pages only, and they reach nothing else that reads Airtable", () => {
    const importers = all.filter((f) => /from ["']@\/lib\/quotes\/customer["']/.test(f.text)).map((f) => f.rel).sort();
    expect(importers).toEqual(["app/c/[token]/[file]/route.ts", "app/c/[token]/page.tsx"]);
    // Acceptance (2026-10-27) adds pure rules and settings, and the one keyed client to the staff app; nothing that reads Airtable.
    const allowed = ["quotes/customer", "send/copy", "send/pdf", "activity/relay", "accept/plan", "accept/terms", "accept/settings", "pricing/schedule", "quotes/acceptClient", "billing/doc", "billing/pdf"];
    for (const f of all.filter((x) => x.rel.startsWith("app/c/"))) {
      const lib = [...f.text.matchAll(/from ["']@\/lib\/([^"']+)["']/g)].map((m) => m[1]);
      expect(lib.filter((l) => !allowed.includes(l))).toEqual([]);
    }
  });

  it("the proxy serves customer links only on the customer deployment, and 404s them on the staff app", () => {
    const proxy = code(all.find((f) => f.rel === "proxy.ts")!.text);
    expect(proxy).toMatch(/export async function proxy\(request: NextRequest\) \{\s*const path = request\.nextUrl\.pathname;\s*if \(isCustomerDeployment\(\)\) return CUSTOMER_PAGES\.test\(path\) \? NextResponse\.next\(\) : notFound\(\);\s*if \(path\.startsWith\("\/c\/"\)\) return notFound\(\);/);
  });
});

describe("acceptance (2026-10-27): the one write path from a customer link", () => {
  const ROUTE = "app/api/accept/route.ts";
  const ACCEPT = "lib/accept/accept.ts";
  const STAFF = "lib/accept/staff.ts";
  const CLIENTSIDE = "lib/quotes/acceptClient.ts";
  const text = (rel: string) => code(all.find((f) => f.rel === rel)!.text);
  const importers = (mod: string) => all.filter((f) => new RegExp(`from ["']@/lib/${mod}["']|from ["']\\./${mod.split("/").pop()}["']`).test(f.text)).map((f) => f.rel).sort();

  it("checks the shared key before anything else, in the route and in every function it calls", () => {
    expect(text(ROUTE)).toMatch(/export async function POST\(req: Request\) \{\s*const key = req\.headers\.get\("x-quote-key"\);\s*if \(!acceptKeyOk\(key\)\) return/);
    const exported = text(ACCEPT).match(/export async function \w+/g) ?? [];
    const guarded = text(ACCEPT).match(/export async function \w+[^{]*\{\s*if \(!acceptKeyOk\(key\)\) return/g) ?? [];
    expect(exported.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(exported.length);
    // A missing key turns acceptance off; it never opens it.
    expect(text(ACCEPT)).toMatch(/if \(!want \|\| !given\) return false;/);
  });

  it("the staff side checks the signed-in quoter first in every export", () => {
    const exported = text(STAFF).match(/export async function \w+/g) ?? [];
    const guarded = text(STAFF).match(/export async function \w+[^{]*\{\s*(const \w+ = )?await requireQuoter(Person)?\(\);/g) ?? [];
    expect(exported.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(exported.length);
  });

  it("the writes are reached only through the keyed step and the signed-in staff side", () => {
    expect(importers("accept/record")).toEqual([ACCEPT, STAFF]);
    expect(importers("accept/accept")).toEqual([ROUTE]);
    expect(importers("accept/staff")).toEqual(["app/q/[id]/actions.ts", "app/q/[id]/page.tsx"]);
    // Nothing the request says about money is used: the acceptance is built from the frozen copy.
    expect(text(ACCEPT)).toMatch(/buildAcceptance\(target\.copy, input,/);
  });

  it("the customer deployment holds only the key: one reader, no Airtable, reached only from the customer page's action", () => {
    expect(all.filter((f) => /QUOTE_ACCEPT_KEY/.test(code(f.text))).map((f) => f.rel).sort()).toEqual([ACCEPT, CLIENTSIDE]);
    expect(text(CLIENTSIDE)).not.toMatch(/airtable|createRecord|updateRecord|make\/client/);
    expect(text(CLIENTSIDE)).toMatch(/isCustomerDeployment\(\)/);
    expect(importers("quotes/acceptClient")).toEqual(["app/c/[token]/actions.ts", "app/c/[token]/page.tsx"]);
  });

  it("the switch and the Project Expectations are read in one file, which never writes, and fail closed", () => {
    const live = text("lib/accept/live.ts");
    expect(live).not.toMatch(/\b(createRecords?|updateRecords?)\(/);
    expect(all.filter((f) => /SETTINGS\.onlineAcceptance|TERMS\.pdf/.test(code(f.text))).map((f) => f.rel)).toEqual(["lib/accept/live.ts"]);
    expect(importers("accept/live").sort()).toEqual(["lib/accept/record.ts", "lib/quotes/customer.ts", "lib/quotes/send.ts"]);
    // Anything that can't be read reads as off.
    expect(live).toMatch(/acceptanceSwitchedOn\(\): Promise<boolean> \{\s*return remembered\([\s\S]*?,\s*false,\s*\);/);
    // Neither is ever written: Quote Settings and Terms Versions are not quote tables.
    expect(WRITABLE_TABLES).not.toContain("tbl87nxBec8uKta8V");
    expect(WRITABLE_TABLES).not.toContain("tblYN4djj4SmQWvkJ");
  });

  it("the Project Expectations PDF is served by the customer's link, fetched only from Airtable's file host", () => {
    const route = text("app/c/[token]/[file]/route.ts");
    expect(route).toMatch(/if \(file === TERMS_PDF\) return projectExpectations\(found\.terms\?\.pdfUrl \?\? null\);/);
    expect(route).toMatch(/if \(!url \|\| !isAirtableFile\(url\)\) return new Response\("Not found", \{ status: 404 \}\);/);
    expect(route.match(/\bfetch\(/g)?.length).toBe(1);
  });

  it("the customer loader still only reads, and returns the frozen acceptance with the frozen copy", () => {
    const loader = text("lib/quotes/customer.ts");
    expect(loader).not.toMatch(/\b(createRecords?|updateRecords?)\(/);
    expect(loader).toMatch(/parseAcceptance\(/);
  });
});

describe("open tracking (2026-10-27: no sign-in, key-gated, the customer deployment still never writes)", () => {
  const ROUTE = "app/api/activity/route.ts";
  const TRACK = "lib/quotes/activity.ts";
  const RELAY = "lib/activity/relay.ts";

  it("checks the shared key before anything else, in the route and in every function it calls", () => {
    const route = code(all.find((f) => f.rel === ROUTE)!.text);
    expect(route).toMatch(/export async function POST\(req: Request\) \{\s*const key = req\.headers\.get\("x-quote-key"\);\s*if \(!activityKeyOk\(key\)\) return/);
    const text = code(all.find((f) => f.rel === TRACK)!.text);
    const exported = text.match(/export async function \w+/g) ?? [];
    const guarded = text.match(/export async function \w+[^{]*\{\s*if \(!activityKeyOk\(key\)\) return/g) ?? [];
    expect(exported.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(exported.length);
    // A missing key turns tracking off; it never opens it.
    expect(text).toMatch(/if \(!want \|\| !given\) return false;/);
    expect(all.filter((f) => /from ["']@\/lib\/quotes\/activity["']/.test(f.text)).map((f) => f.rel)).toEqual([ROUTE]);
  });

  it("writes only the tracking fields on Quote Versions, and posts only internal comments", () => {
    const text = code(all.find((f) => f.rel === TRACK)!.text);
    expect(text).not.toMatch(/createRecords?\(|updateRecords\(/);
    for (const m of text.matchAll(/updateRecord\(T\.(\w+)/g)) expect(m[1]).toBe("versions");
    const written = [...text.matchAll(/\[VERSION\.(\w+)\]:/g)].map((m) => m[1]);
    const tracking = ["openedCount", "firstOpenedAt", "lastOpenedAt", "pdfDownloads", "activityLog", "firstOpenNotedAt", "summaryNotedAt"];
    expect(written.every((w) => tracking.includes(w))).toBe(true);
    expect(text.match(/sendMessage\(\{ type: "(\w+)"/g)).toEqual(['sendMessage({ type: "InternalComment"']);
    expect(text).not.toMatch(/setFollowUpTags|sendToGhl/);
  });

  it("the customer deployment only reports: the relay reads no Airtable and runs only there", () => {
    const relay = code(all.find((f) => f.rel === RELAY)!.text);
    expect(relay).not.toMatch(/airtable|createRecord|updateRecord|make\/client|ghl\/client/);
    expect(relay).toMatch(/if \(!isCustomerDeployment\(\) \|\|/);
    // The staff app's address is read on the customer deployment by the relay and, since 2026-10-27, by the accept client;
    // since 2026-10-28 also by accept/settings, on the staff app only, for the Notion project's Quote Link.
    expect(all.filter((f) => /QUOTE_STAFF_URL/.test(code(f.text))).map((f) => f.rel).sort()).toEqual(["lib/accept/settings.ts", "lib/quotes/acceptClient.ts", RELAY].sort());
    expect(all.filter((f) => /QUOTE_ACTIVITY_KEY/.test(code(f.text))).map((f) => f.rel).sort()).toEqual([RELAY, TRACK].sort());
    const importers = all.filter((f) => /from ["']@\/lib\/activity\/relay["']/.test(f.text)).map((f) => f.rel).sort();
    expect(importers).toEqual(["app/c/[token]/[file]/route.ts", "app/c/[token]/seen/route.ts"]);
  });

  it("staff opening a customer link from the Send card are never counted", () => {
    expect(all.find((f) => f.rel === "components/SendQuote.tsx")!.text).toContain("href={`${link}#staff`}");
    expect(all.find((f) => f.rel === "components/SeenBeacon.tsx")!.text).toMatch(/if \(window\.location\.hash === "#staff"\) return;/);
  });
});

describe("the PDF on the customer's page (2026-10-27: only when the sender offered it, never in the email)", () => {
  it("the page shows no button and the file answers 404 unless the copy offers it", () => {
    expect(all.find((f) => f.rel === "app/c/[token]/page.tsx")!.text).toMatch(/pdfHref=\{offersPdf\(copy\) \?/);
    // The stamped accepted PDF (2026-10-27) is the record of what was agreed: served whatever the tick, and only on an accepted link.
    expect(code(all.find((f) => f.rel === "app/c/[token]/[file]/route.ts")!.text)).toMatch(/if \(!accepted && \(!offersPdf\(found\.copy\) \|\|/);
  });

  it("the email never carries an attachment, except the acceptance email (Albert, 2026-10-27: \"attach for acceptance only\")", () => {
    const plan = code(all.find((f) => f.rel === "lib/send/plan.ts")!.text);
    const fns = plan.split(/\nexport function /).slice(1);
    const attaching = fns.filter((f) => /attachments\s*[:}]|\{ attachments \}/.test(f)).map((f) => f.match(/^\w+/)![0]);
    // And the invoice or receipt email (Albert, 2026-10-30: attach the PDF).
    expect(attaching.sort()).toEqual(["acceptedEmailMessage", "billingEmailMessage"]);
  });
});

describe("Notion payments (2026-10-30: read-only, for invoices and receipts)", () => {
  const READER = "lib/notion/payments.ts";
  it("one file reads the payments token, and it only queries the Master Payments Log", () => {
    expect(all.filter((f) => code(f.text).includes("QUOTE_NOTION_PAYMENTS_TOKEN")).map((f) => f.rel)).toEqual([READER]);
    expect(all.filter((f) => code(f.text).includes("api.notion.com")).map((f) => f.rel).sort()).toEqual(["lib/bug/notion.ts", READER].sort());
    const text = code(all.find((f) => f.rel === READER)!.text);
    expect(text.match(/\bfetch\(/g)?.length).toBe(1);
    expect(text).toMatch(/fetch\(`\$\{API\}\/data_sources\/\$\{PAYMENTS_LOG\}\/query`/);
    expect(text).not.toMatch(/\/pages|PATCH|DELETE/);
  });

  it("is reached only from the invoice and receipt writer", () => {
    expect(all.filter((f) => /from ["']@\/lib\/notion\/payments["']/.test(f.text)).map((f) => f.rel)).toEqual(["lib/quotes/billing.ts"]);
  });

  it("the billing writer writes Invoices, Receipts and the version's history only", () => {
    const text = code(all.find((f) => f.rel === "lib/quotes/billing.ts")!.text);
    for (const m of text.matchAll(/\b(?:createRecord|updateRecord)\(([^,]+)/g)) expect(["TABLE[c.kind]", "TABLE[r.snap.kind]", "T.versions"]).toContain(m[1].trim());
    for (const m of text.matchAll(/updateRecord\(T\.versions[^)]*authorFields/g)) expect(m[0]).toContain("authorFields");
    expect(text).not.toMatch(/createRecords|updateRecords\(/);
  });
});
