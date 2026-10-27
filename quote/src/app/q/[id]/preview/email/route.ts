import { previewEmail } from "@/lib/quotes/send";
import { isIsoDate } from "@/lib/send/copy";
import { parseOptionIds } from "@/lib/send/plan";

/**
 * Staff only: the email exactly as GHL would send it for this version today, as a page, so the
 * look can be checked before a send (2026-10-22). Links point at the version's real customer link
 * when it has one; otherwise a placeholder. previewEmail() checks the quoter.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const until = url.searchParams.get("until");
  const html = await previewEmail(id, until && isIsoDate(until) ? until : undefined, url.searchParams.get("itemised") === "1", url.searchParams.get("pdf") === "1", parseOptionIds(url.searchParams.get("options")), url.searchParams.get("range") !== "0");
  if (!html) return new Response("Not found", { status: 404 });
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" },
  });
}
