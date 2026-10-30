import { after } from "next/server";
import { acceptedCopy, acceptedWhen } from "@/lib/accept/plan";
import { isAirtableFile, TERMS_PDF } from "@/lib/accept/terms";
import { relayActivity } from "@/lib/activity/relay";
import { BILLING_FILE, billingFile } from "@/lib/billing/doc";
import { billingPdf } from "@/lib/billing/pdf";
import { customerBilling, customerQuote } from "@/lib/quotes/customer";
import { acceptedPdfName, offersPdf, pdfName } from "@/lib/send/copy";
import { quotePdf } from "@/lib/send/pdf";

/**
 * The quote's PDF, at a link ending in its file name: the customer's Download button, there only
 * when the sender offered the PDF (2026-10-27). Customer deployment only. Only the page's button
 * asks with ?d=1, so only it counts as a download (2026-10-27); a bare fetch of the address does not.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; file: string }> }) {
  const { token, file } = await params;
  // The project's invoice or receipt (2026-10-30): drawn from the snapshot staff last exported, at its own file name only.
  if (BILLING_FILE.test(file)) {
    const snap = await customerBilling(token);
    if (!snap || file !== billingFile(snap.kind, snap.number)) return new Response("Not found", { status: 404 });
    return pdfResponse(billingPdf(snap), file);
  }
  const found = await customerQuote(token);
  if (!found) return new Response("Not found", { status: 404 });
  if (file === TERMS_PDF) return projectExpectations(found.terms?.pdfUrl ?? null);
  // An accepted quote (2026-10-27) also has its stamped PDF, the one the acceptance email attaches. It is the
  // record of what was agreed, so it is always there, whether or not the quote's own PDF was offered.
  const a = found.acceptance;
  const accepted = a && file === acceptedPdfName(found.copy);
  // A quote sent without the PDF (2026-10-27) has no file to download, whoever has the address.
  if (!accepted && (!offersPdf(found.copy) || file !== pdfName(found.copy))) return new Response("Not found", { status: 404 });
  if (new URL(req.url).searchParams.get("d") === "1") {
    const ua = req.headers.get("user-agent");
    after(() => relayActivity(token, "pdf", ua));
  }
  const bytes = accepted ? quotePdf(acceptedCopy(found.copy, a), { acceptance: a, when: acceptedWhen(a.at) }) : quotePdf(found.copy);
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}

function pdfResponse(bytes: Uint8Array<ArrayBuffer>, file: string): Response {
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}

/**
 * The Project Expectations (2026-10-27): the version this link agreed to once accepted, otherwise
 * today's while acceptance is on (the loader decides which). Its PDF is an Airtable attachment whose
 * address expires within hours, so it is fetched fresh and passed through, never linked to directly.
 */
async function projectExpectations(url: string | null): Promise<Response> {
  if (!url || !isAirtableFile(url)) return new Response("Not found", { status: 404 });
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res?.ok || !res.body) return new Response("The Project Expectations can't be opened right now. Try again in a minute.", { status: 502 });
  return new Response(res.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${TERMS_PDF}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}
