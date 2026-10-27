import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AcceptedNote } from "@/components/AcceptedNote";
import { AcceptPanel, type AcceptOption } from "@/components/AcceptPanel";
import { CustomerQuote } from "@/components/CustomerQuote";
import { SeenBeacon } from "@/components/SeenBeacon";
import { acceptedCopy, addOnsOf, notAcceptable } from "@/lib/accept/plan";
import { etransferEmail } from "@/lib/accept/settings";
import { termsHref, termsLabel } from "@/lib/accept/terms";
import { defaultSchedule } from "@/lib/pricing/schedule";
import { acceptConfigured } from "@/lib/quotes/acceptClient";
import { customerQuote } from "@/lib/quotes/customer";
import { acceptedPdfName, offersPdf, pdfName, stagesOf } from "@/lib/send/copy";

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

export default async function CustomerQuotePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ store?: string }> }) {
  const { token } = await params;
  const { store } = await searchParams;
  const found = await customerQuote(token);
  if (!found) notFound();
  const { copy, state, acceptance, terms } = found;
  // The beacon reports the open once the page is in view (2026-10-27); a link preview never runs it.
  const beacon = <SeenBeacon path={`/c/${token}/seen`} />;

  // Accepted (2026-10-27): the page shows what was agreed, the stamped PDF, and the deposit.
  if (state === "accepted" && acceptance) {
    const pdfHref = `/c/${token}/${acceptedPdfName(copy)}?d=1`;
    return (
      <>
        {beacon}
        <CustomerQuote
          copy={acceptedCopy(copy, acceptance)}
          state={state}
          pdfHref={pdfHref}
          newerHref={null}
          note={<AcceptedNote a={acceptance} quoteNumber={copy.quoteNumber} etransfer={etransferEmail()} pdfHref={pdfHref} termsHref={terms ? termsHref(token) : null} newerHref={found.newerToken ? `/c/${found.newerToken}` : null} />}
        />
      </>
    );
  }

  // Open to accept: a measured quote, still good, with Online Acceptance switched on and a Project Expectations PDF.
  const canAccept = acceptConfigured() && Boolean(etransferEmail()) && terms !== null && notAcceptable(copy, state, terms) === null;
  const options: AcceptOption[] = copy.options.map((o, index) => ({
    index,
    name: o.name,
    subtotal: o.totals.subtotal,
    hst: o.totals.hst,
    addOns: addOnsOf(copy, o),
    frozen: stagesOf(o).map((s) => ({ amount: s.amount })),
  }));
  const recommended = copy.options.findIndex((o) => o.recommended);
  return (
    <>
      {beacon}
      <CustomerQuote
        copy={copy}
        state={state}
        pdfHref={offersPdf(copy) ? `/c/${token}/${pdfName(copy)}?d=1` : null}
        newerHref={found.newerToken ? `/c/${found.newerToken}` : null}
        after={
          canAccept && terms ? (
            <AcceptPanel
              token={token}
              store={store === "1"}
              options={options}
              schedule={copy.paymentSchedule ?? defaultSchedule()}
              terms={{ id: terms.id, label: termsLabel(terms.on), href: termsHref(token) }}
              defaultIndex={recommended >= 0 ? recommended : 0}
            />
          ) : null
        }
      />
    </>
  );
}
