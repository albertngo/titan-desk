import type { Payment } from "@/lib/billing/doc";

/** Reading a Master Payments Log row (2026-10-30). Pure; the request is in payments.ts. Tested in tests/billing.test.ts. */

/** The page id in a Notion project link (notion.so, notion.site or app.notion.com), dashed; null when there isn't one. */
export function notionPageId(url: string | null | undefined): string | null {
  const hex = (url ?? "").replace(/-/g, "").match(/([0-9a-f]{32})(?![0-9a-f])/i)?.[1];
  return hex ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase() : null;
}

export type Page = { properties?: Record<string, Record<string, unknown>> };

const text = (p: Record<string, unknown> | undefined): string | null => {
  const rich = (p?.rich_text ?? p?.title) as { plain_text?: string }[] | undefined;
  const t = rich?.map((r) => r.plain_text ?? "").join("").trim();
  return t || null;
};

/** One row of the log as a payment. */
export function paymentOf(page: Page): Payment {
  const p = page.properties ?? {};
  const date = (p["Received Date"]?.date as { start?: string } | null)?.start ?? null;
  return {
    date: date ? date.slice(0, 10) : null,
    amount: typeof p.Amount?.number === "number" ? (p.Amount.number as number) : 0,
    method: (p["Form of Payment"]?.select as { name?: string } | null)?.name ?? null,
    reference: text(p["Reference Number"]),
  };
}

