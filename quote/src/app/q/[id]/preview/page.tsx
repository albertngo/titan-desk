import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerQuote } from "@/components/CustomerQuote";
import { previewCopy } from "@/lib/quotes/send";
import { isIsoDate, isPricing } from "@/lib/send/copy";

/** Staff only: exactly what the customer gets if this version is sent, before it is. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer preview" };

export default async function PreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ until?: string; pricing?: string }> }) {
  const { id } = await params;
  const { until, pricing } = await searchParams;
  const copy = await previewCopy(id, isIsoDate(until) ? until : undefined, isPricing(pricing) ? pricing : undefined);
  if (!copy) notFound();
  const q = new URLSearchParams();
  if (isIsoDate(until)) q.set("until", until);
  if (isPricing(pricing)) q.set("pricing", pricing);
  const pdf = `/q/${id}/pdf${q.size ? `?${q}` : ""}`;
  return (
    <CustomerQuote
      copy={copy}
      state="open"
      pdfHref={pdf}
      newerHref={null}
      banner={
        <p className="cq-preview">
          <b>Preview.</b> This is what the customer sees once the quote is sent. <Link href={`/q/${id}`}>Back to the quote</Link>
        </p>
      }
    />
  );
}
