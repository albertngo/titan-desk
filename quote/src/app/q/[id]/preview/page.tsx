import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerQuote } from "@/components/CustomerQuote";
import { previewCopy } from "@/lib/quotes/send";
import { isIsoDate, offersPdf } from "@/lib/send/copy";
import { parseOptionIds } from "@/lib/send/plan";

/** Staff only: exactly what the customer gets if this version is sent, before it is. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer preview" };

export default async function PreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ until?: string; itemised?: string; options?: string; range?: string; pdf?: string }> }) {
  const { id } = await params;
  const { until, itemised, options, range, pdf: withPdf } = await searchParams;
  // `itemised=1` previews the breakdown; otherwise the lump sum, the default (Albert, 2026-10-22).
  // `range=0` previews a preliminary's exact price instead of its range (2026-10-27).
  // `pdf=1` previews the page with its Download PDF button (2026-10-27); without it the page offers none.
  const copy = await previewCopy(id, isIsoDate(until) ? until : undefined, itemised === "1", parseOptionIds(options ?? null), range !== "0", withPdf === "1");
  if (!copy) notFound();
  const q = [isIsoDate(until) ? `until=${until}` : null, itemised === "1" ? "itemised=1" : null, options ? `options=${encodeURIComponent(options)}` : null, range === "0" ? "range=0" : null].filter(Boolean).join("&");
  const pdf = `/q/${id}/pdf${q ? `?${q}` : ""}`;
  return (
    <CustomerQuote
      copy={copy}
      state="open"
      pdfHref={offersPdf(copy) ? pdf : null}
      newerHref={null}
      banner={
        <p className="cq-preview">
          <b>Preview.</b> This is what the customer sees once the quote is sent. <Link href={`/q/${id}`}>Back to the quote</Link>
        </p>
      }
    />
  );
}
