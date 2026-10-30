import "server-only";
import type { Payment } from "@/lib/billing/doc";
import { notionPageId, paymentOf, type Page } from "./rows";

/**
 * The payments on an invoice or receipt (Albert, 2026-10-30), read from Notion's Master Payments Log. The only
 * file that reads QUOTE_NOTION_PAYMENTS_TOKEN: a Notion internal integration with read content only, shared with
 * the Master Payments Log alone, set on the staff deployment only. One request, a query of that log, never a
 * write. Only payments whose **Projects** relation is the quote's Notion project count (never Suggested
 * Project, which is a guess Albert hasn't accepted). Date, amount, form of payment and reference are read;
 * the sender's name, their message and the notes are not.
 */

const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";
/** Master Payments Log's data source. */
const PAYMENTS_LOG = "26d596a4-505f-8073-a0ac-000b2a8d3a0e";

const token = () => process.env.QUOTE_NOTION_PAYMENTS_TOKEN?.trim() || null;

/** Is reading payments set up on this deployment? */
export const paymentsReaderOn = () => token() !== null;

/** Every payment the log links to this project. Throws when Notion can't be read; the caller says so. */
export async function projectPayments(projectUrl: string | null | undefined): Promise<Payment[]> {
  const t = token();
  if (!t) throw new Error("Reading payments isn't set up (QUOTE_NOTION_PAYMENTS_TOKEN).");
  const pageId = notionPageId(projectUrl);
  if (!pageId) throw new Error("This quote has no Notion project yet.");
  const out: Payment[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${API}/data_sources/${PAYMENTS_LOG}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
      body: JSON.stringify({ filter: { property: "Projects", relation: { contains: pageId } }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { results?: Page[]; has_more?: boolean; next_cursor?: string; message?: string };
    if (!res.ok) throw new Error(`Notion ${res.status}: ${json.message ?? "the payments couldn't be read"}`);
    out.push(...(json.results ?? []).map(paymentOf));
    if (!json.has_more || !json.next_cursor) break;
    cursor = json.next_cursor;
  }
  return out;
}
