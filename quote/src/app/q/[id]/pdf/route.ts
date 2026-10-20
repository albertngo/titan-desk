import { previewCopy } from "@/lib/quotes/send";
import { isIsoDate, isPricing, pdfName } from "@/lib/send/copy";
import { quotePdf } from "@/lib/send/pdf";

/** Staff only: the PDF the customer would get for this version (previewCopy checks the quoter). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const until = searchParams.get("until");
  const pricing = searchParams.get("pricing");
  const copy = await previewCopy(id, isIsoDate(until) ? until : undefined, isPricing(pricing) ? pricing : undefined);
  if (!copy) return new Response("Not found", { status: 404 });
  return new Response(quotePdf(copy), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdfName(copy)}"`, "Cache-Control": "private, no-store" },
  });
}
