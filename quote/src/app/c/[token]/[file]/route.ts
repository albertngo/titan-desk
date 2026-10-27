import { after } from "next/server";
import { relayActivity } from "@/lib/activity/relay";
import { customerQuote } from "@/lib/quotes/customer";
import { offersPdf, pdfName } from "@/lib/send/copy";
import { quotePdf } from "@/lib/send/pdf";

/**
 * The quote's PDF, at a link ending in its file name: the customer's Download button, there only
 * when the sender offered the PDF (2026-10-27). Customer deployment only. Only the page's button
 * asks with ?d=1, so only it counts as a download (2026-10-27); a bare fetch of the address does not.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; file: string }> }) {
  const { token, file } = await params;
  const found = await customerQuote(token);
  // A quote sent without the PDF (2026-10-27) has no file to download, whoever has the address.
  if (!found || !offersPdf(found.copy) || file !== pdfName(found.copy)) return new Response("Not found", { status: 404 });
  if (new URL(req.url).searchParams.get("d") === "1") {
    const ua = req.headers.get("user-agent");
    after(() => relayActivity(token, "pdf", ua));
  }
  return new Response(quotePdf(found.copy), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfName(found.copy)}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}
