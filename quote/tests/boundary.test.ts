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
const WRITERS = ["lib/quotes/start.ts", "lib/quotes/save.ts", "lib/quotes/refresh.ts", "lib/quotes/records.ts", "lib/quotes/booking.ts", "lib/quotes/link.ts", "lib/quotes/send.ts"];
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
    // Two requests in the whole file: get() and write(). A third fetch would bypass the table check.
    expect(client.match(/\bfetch\(/g)?.length).toBe(2);
  });

  it("writes to the four quote tables only, never the catalogue, Rate Card or Stair Items", () => {
    expect([...WRITABLE_TABLES].sort()).toEqual([T.quotes, T.versions, T.options, T.lines].sort());
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

  it("keeps the client, the loaders and the auth check server-only", () => {
    for (const rel of [CLIENT, GHL, "lib/quotes/load.ts", "lib/quotes/start.ts", "lib/quotes/save.ts", "lib/quotes/refresh.ts", "lib/quotes/records.ts", "lib/quotes/booking.ts", "lib/quotes/link.ts", "lib/quotes/send.ts", "lib/quotes/customer.ts", "lib/quotes/conversation.ts", "lib/auth.ts"]) {
      expect(all.find((f) => f.rel === rel)!.text).toMatch(/^import "server-only";/m);
    }
  });

  it("never imports Airtable code into a browser component", () => {
    const leaks = all
      .filter((f) => /^["']use client["'];?/m.test(f.text))
      .filter((f) => /^import (?!type )[^;]*from ["']@\/lib\/(airtable|quotes\/load|quotes\/start|quotes\/save|quotes\/refresh|quotes\/records|quotes\/booking|quotes\/link|quotes\/send|quotes\/customer|quotes\/conversation|ghl\/client|make\/client|auth)/m.test(f.text))
      .map((f) => f.rel);
    expect(leaks).toEqual([]);
  });

  it("never exposes an Airtable setting to the browser", () => {
    expect(all.filter((f) => /NEXT_PUBLIC_[A-Z_]*(AIRTABLE|GHL|MAKE)/.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("checks the quoter allowlist in both the proxy and every loader", () => {
    expect(all.find((f) => f.rel === "proxy.ts")!.text).toContain("isQuoter(");
    for (const rel of ["lib/quotes/load.ts", "lib/quotes/start.ts", "lib/quotes/save.ts", "lib/quotes/refresh.ts", "lib/quotes/link.ts", "lib/quotes/send.ts", "lib/quotes/conversation.ts"]) {
      const text = all.find((f) => f.rel === rel)!.text;
      const exported = text.match(/export async function \w+/g) ?? [];
      const guarded = text.match(/export async function \w+[^{]*\{\s*(const \w+ = )?await requireQuoter\(\);/g) ?? [];
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

  it("is the only path the staff app lets through without a sign-in, besides signing in", () => {
    const proxy = all.find((f) => f.rel === "proxy.ts")!.text;
    expect(proxy).toContain('matcher: ["/((?!_next/|favicon\\\\.ico|robots\\\\.txt).*)"]');
    expect(proxy).toContain("const OPEN_ON_STAFF = /^\\/(login|auth\\/|denied|api\\/booking)/;");
    expect(all.filter((f) => f.rel.startsWith("app/api/")).map((f) => f.rel)).toEqual([ROUTE]);
  });

  it("keeps the shared quote helpers away from pages and actions", () => {
    const importers = all.filter((f) => /from ["']\.\/records["']|from ["']@\/lib\/quotes\/records["']/.test(f.text)).map((f) => f.rel).sort();
    expect(importers).toEqual([BOOKING, "lib/quotes/link.ts", "lib/quotes/start.ts"]);
    expect(all.filter((f) => /from ["']@\/lib\/quotes\/booking["']/.test(f.text)).map((f) => f.rel)).toEqual([ROUTE]);
  });
});

describe("GHL boundary", () => {
  it("has exactly one file that talks to GHL, and it alone reads the token", () => {
    expect(all.filter((f) => code(f.text).includes("leadconnectorhq.com")).map((f) => f.rel)).toEqual([GHL]);
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
    expect(all.find((f) => f.rel === "app/q/[id]/page.tsx")!.text).toMatch(/\{!customer && quote\.link\?\.ghlContactId && <Conversation/);
    expect(all.find((f) => f.rel === "app/new/page.tsx")!.text).toMatch(/conversation=\{!customer\}/);
    const importers = all.filter((f) => /from ["'](@\/app\/actions\/conversation|@\/lib\/quotes\/conversation|@\/components\/Conversation|\.\/Conversation)["']/.test(f.text)).map((f) => f.rel).sort();
    expect(importers).toEqual(["app/actions/conversation.ts", "app/q/[id]/page.tsx", "components/Conversation.tsx", "components/NewQuote.tsx"]);
  });
});

describe("Make boundary", () => {
  it("has exactly one file that sends to Make, and it alone reads the hook and key", () => {
    expect(all.filter((f) => /QUOTE_MAKE_GHL_(HOOK|KEY)/.test(code(f.text))).map((f) => f.rel)).toEqual(["lib/make/client.ts"]);
    expect(all.filter((f) => /hook\.[a-z0-9]+\.make\.com|make\.com\//.test(code(f.text))).map((f) => f.rel)).toEqual([]);
  });

  it("is server-only and only reached from starting, booking, linking and sending a quote", () => {
    expect(all.find((f) => f.rel === "lib/make/client.ts")!.text).toMatch(/^import "server-only";/m);
    const callers = all.filter((f) => f.rel !== "lib/make/client.ts" && /from ["']@\/lib\/make\/client["']/.test(f.text)).map((f) => f.rel);
    expect(callers.sort()).toEqual(["lib/quotes/booking.ts", "lib/quotes/link.ts", "lib/quotes/send.ts", "lib/quotes/start.ts"]);
  });
});

describe("customer links (no sign-in, customer deployment only)", () => {
  const LOADER = "lib/quotes/customer.ts";
  const text = () => code(all.find((f) => f.rel === LOADER)!.text);

  it("answers only on the customer deployment and only for a well-formed token, before touching Airtable", () => {
    const exported = text().match(/export async function \w+/g) ?? [];
    const guarded = text().match(/export async function \w+\(token: string\)[^{]*\{\s*if \(!isCustomerDeployment\(\) \|\| !isToken\(token\)\) return null;/g) ?? [];
    expect(exported.length).toBe(1);
    expect(guarded.length).toBe(1);
  });

  it("reads only: no write, no sign-in code, and it returns the frozen copy, not live lines", () => {
    expect(text()).not.toMatch(/\b(createRecords?|updateRecords?)\(/);
    expect(text()).not.toMatch(/requireQuoter|@\/lib\/auth|getQuote|VERSION\.(lines|options|notes)|T\.(lines|options)/);
    expect(text()).toMatch(/parseCopy\(/);
  });

  it("is reached from the customer pages only, and they reach nothing else that reads Airtable", () => {
    const importers = all.filter((f) => /from ["']@\/lib\/quotes\/customer["']/.test(f.text)).map((f) => f.rel).sort();
    expect(importers).toEqual(["app/c/[token]/[file]/route.ts", "app/c/[token]/page.tsx"]);
    for (const f of all.filter((x) => x.rel.startsWith("app/c/"))) {
      const lib = [...f.text.matchAll(/from ["']@\/lib\/([^"']+)["']/g)].map((m) => m[1]);
      expect(lib.every((l) => ["quotes/customer", "send/copy", "send/pdf"].includes(l))).toBe(true);
    }
  });

  it("the proxy serves customer links only on the customer deployment, and 404s them on the staff app", () => {
    const proxy = code(all.find((f) => f.rel === "proxy.ts")!.text);
    expect(proxy).toMatch(/export async function proxy\(request: NextRequest\) \{\s*const path = request\.nextUrl\.pathname;\s*if \(isCustomerDeployment\(\)\) return CUSTOMER_PAGES\.test\(path\) \? NextResponse\.next\(\) : notFound\(\);\s*if \(path\.startsWith\("\/c\/"\)\) return notFound\(\);/);
  });
});
