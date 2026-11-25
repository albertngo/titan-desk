import "server-only";
import { listRecords } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { loadContract } from "@/lib/quotes/contract";
import { scopeFromCopy } from "./scope";

/**
 * For the Project Week run (key-gated, no one signed in): each week job's accepted-quote scope, found by the quote whose
 * Notion Project link is that job's page. Reads Airtable only, writes nothing; a job with no accepted quote, or any
 * read that fails, just has no scope.
 */
export async function quoteScopes(projectPageIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const hexes = [...new Set(projectPageIds.map((id) => id.replace(/-/g, "").toLowerCase()).filter((h) => /^[0-9a-f]{32}$/.test(h)))];
  if (!hexes.length) return out;
  try {
    const found = await listRecords(T.quotes, {
      fields: [QUOTE.notionProjectUrl],
      filterByFormula: `OR(${hexes.map((h) => `FIND('${h}', LOWER(SUBSTITUTE({${QUOTE.notionProjectUrl}}, '-', '')))`).join(", ")})`,
    });
    for (const q of found) {
      const url = String(q.fields[QUOTE.notionProjectUrl] ?? "").replace(/-/g, "").toLowerCase();
      const hex = hexes.find((h) => url.includes(h));
      if (!hex || out.has(hex)) continue;
      const contract = await loadContract(q.id).catch(() => null);
      const scope = contract ? scopeFromCopy(contract.view) : null;
      if (scope) out.set(hex, scope);
    }
  } catch (e) {
    console.error("project week quote scope", e instanceof Error ? e.message.slice(0, 200) : typeof e);
  }
  return out;
}
