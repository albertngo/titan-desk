import { previewCopy } from "@/lib/quotes/send";
import { isIsoDate, pdfName } from "@/lib/send/copy";
import { quotePdf } from "@/lib/send/pdf";

/** Staff only: the PDF the customer would get for this version (previewCopy checks the quoter). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const until = sp.get("until");
  const copy = await previewCopy(id, isIsoDate(until) ? until : undefined, sp.get("itemised") === "1");
  if (!copy) return new Response("Not found", { status: 404 });
  return new Response(quotePdf(copy), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdfName(copy)}"`, "Cache-Control": "private, no-store" },
  });
}
