import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerQuote } from "@/components/CustomerQuote";
import { customerQuote } from "@/lib/quotes/customer";
import { pdfName } from "@/lib/send/copy";

/** A customer's quote, opened from the link in their email or text. Customer deployment only. */

export const dynamic = "force-dynamic";
// The token is the key to the page: never hand it to another site in a Referer header.
// The OpenGraph tags (2026-10-22) draw the preview card iMessage and Android show under the link in a
// text: the logo and a generic line, never the customer, the number or the amount.
export const metadata: Metadata = {
  title: { absolute: "Your quote · Titan Flooring" },
  description: "Open your quote from Titan Flooring.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Your quote from Titan Flooring",
    description: "Open your quote from Titan Flooring.",
    siteName: "Titan Flooring",
    type: "website",
    ...(/^https:\/\//.test(process.env.QUOTE_LOGO_URL?.trim() ?? "") ? { images: [{ url: process.env.QUOTE_LOGO_URL!.trim(), alt: "Titan Flooring" }] } : {}),
  },
};

export default async function CustomerQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await customerQuote(token);
  if (!found) notFound();
  return (
    <CustomerQuote
      copy={found.copy}
      state={found.state}
      pdfHref={`/c/${token}/${pdfName(found.copy)}`}
      newerHref={found.newerToken ? `/c/${found.newerToken}` : null}
    />
  );
}
