import { billingFile } from "@/lib/billing/doc";
import { billingPdf } from "@/lib/billing/pdf";
import { billingSnapshot } from "@/lib/quotes/billing";

/** Staff only: the project's invoice or receipt as last exported (billingSnapshot checks the quoter). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snap = await billingSnapshot(id);
  if (!snap) return new Response("Not found: export the invoice or receipt first.", { status: 404 });
  return new Response(billingPdf(snap), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${billingFile(snap.kind, snap.number)}"`, "Cache-Control": "private, no-store" },
  });
}
