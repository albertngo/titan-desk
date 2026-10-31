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
import { acceptedPdfName, isAddition, offersPdf, partKeys, pdfName, pickKey, stagesOf } from "@/lib/send/copy";

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
  // On a change (2026-10-31) only the new work offered can be taken; the project as agreed (its first option) is the base.
  const change = Boolean(copy.change);
  const options: AcceptOption[] = copy.options.flatMap((o, index) =>
    change && !o.offer
      ? []
      : [{ index, name: o.name, subtotal: o.totals.subtotal, hst: o.totals.hst, part: pickKey(o, index), addOns: addOnsOf(copy, index), frozen: stagesOf(o).map((s) => ({ amount: s.amount })) }],
  );
  const first = copy.options[0];
  const base = change && first ? { subtotal: first.totals.subtotal, hst: first.totals.hst, frozen: stagesOf(first).map((s) => ({ amount: s.amount })) } : null;
  // What starts ticked: the recommended option of each Part. With one Part only, the first when none is recommended;
  // new work on a change is never ticked for them.
  const split = partKeys(options).length > 1;
  const defaults = partKeys(options).filter((part) => !isAddition(part)).flatMap((part) => {
    const mine = options.filter((o) => o.part === part);
    const rec = mine.find((o) => copy.options[o.index].recommended);
    return rec ? [rec.index] : !split && !change && mine[0] ? [mine[0].index] : [];
  });
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
              defaultPicks={defaults}
              base={base}
            />
          ) : null
        }
      />
    </>
  );
}
