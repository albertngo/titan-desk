import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerQuote } from "@/components/CustomerQuote";
import { SeenBeacon } from "@/components/SeenBeacon";
import { customerQuote } from "@/lib/quotes/customer";
import { offersPdf, pdfName } from "@/lib/send/copy";

/** A customer's quote, opened from the link in their email or text. Customer deployment only. */

export const dynamic = "force-dynamic";
// The token is the key to the page: never hand it to another site in a Referer header.
// The OpenGraph tags (2026-10-22) draw the preview card iMessage and Android show under the link in a
// text: the logo and a generic line, never the customer, the number or the amount.
const base = process.env.QUOTE_CUSTOMER_URL?.trim();
const logo = process.env.QUOTE_LOGO_URL?.trim();
export const metadata: Metadata = {
  ...(base && /^https:\/\//.test(base) ? { metadataBase: new URL(base) } : {}),
  title: { absolute: "Your quote · Titan Flooring" },
  description: "Open your quote from Titan Flooring.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Your quote from Titan Flooring",
    description: "Open your quote from Titan Flooring.",
    siteName: "Titan Flooring",
    type: "website",
    // The card image ships with the app (public/brand/og.png, 1200×630); QUOTE_LOGO_URL overrides it.
    images: [{ url: logo && /^https:\/\//.test(logo) ? logo : "/brand/og.png", width: 1200, height: 630, alt: "Titan Flooring" }],
  },
};

export default async function CustomerQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await customerQuote(token);
  if (!found) notFound();
  // The beacon reports the open once the page is in view (2026-10-27); a link preview never runs it.
  return (
    <>
      <SeenBeacon path={`/c/${token}/seen`} />
      <CustomerQuote
        copy={found.copy}
        state={found.state}
        pdfHref={offersPdf(found.copy) ? `/c/${token}/${pdfName(found.copy)}?d=1` : null}
        newerHref={found.newerToken ? `/c/${found.newerToken}` : null}
      />
    </>
  );
}
