import "server-only";
import { listRecords } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { loadContract } from "@/lib/quotes/contract";
import { scopeFromCopy } from "./scope";
import type { Work } from "./work";

/** What the run takes from a week job's quote: its accepted scope, and its CompanyCam project link. */
export type QuoteFacts = { scope: Work | null; camUrl: string | null };

/**
 * For the Project Week run (key-gated, no one signed in): each week job's accepted-quote scope and, since 2026-11-25,
 * the quote's CompanyCam link (Albert: "search from the project quote app as well, if it isnt there"), used when the
 * Titan Projects row has none. Found by the quote whose Notion Project link is that job's page. Reads Airtable only,
 * writes nothing; a job with no quote, or any read that fails, just has nothing here.
 */
export async function quoteScopes(projectPageIds: string[]): Promise<Map<string, QuoteFacts>> {
  const out = new Map<string, QuoteFacts>();
  const hexes = [...new Set(projectPageIds.map((id) => id.replace(/-/g, "").toLowerCase()).filter((h) => /^[0-9a-f]{32}$/.test(h)))];
  if (!hexes.length) return out;
  try {
    const found = await listRecords(T.quotes, {
      fields: [QUOTE.notionProjectUrl, QUOTE.companyCamUrl],
      filterByFormula: `OR(${hexes.map((h) => `FIND('${h}', LOWER(SUBSTITUTE({${QUOTE.notionProjectUrl}}, '-', '')))`).join(", ")})`,
    });
    for (const q of found) {
      const url = String(q.fields[QUOTE.notionProjectUrl] ?? "").replace(/-/g, "").toLowerCase();
      const hex = hexes.find((h) => url.includes(h));
      if (!hex || out.has(hex)) continue;
      const contract = await loadContract(q.id).catch(() => null);
      const scope = contract ? scopeFromCopy(contract.view) : null;
      const cam = String(q.fields[QUOTE.companyCamUrl] ?? "").trim();
      const camUrl = /^https:\/\/app\.companycam\.com\/projects\/\d+/.test(cam) ? cam : null;
      if (scope || camUrl) out.set(hex, { scope, camUrl });
    }
  } catch (e) {
    console.error("project week quote scope", e instanceof Error ? e.message.slice(0, 200) : typeof e);
  }
  return out;
}
