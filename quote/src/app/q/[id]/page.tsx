import Link from "next/link";
import { notFound } from "next/navigation";
import { Analysis } from "@/components/Analysis";
import { OptionSheet } from "@/components/OptionSheet";
import { TopBar } from "@/components/TopBar";
import { airtableRecordUrl, T } from "@/lib/airtable/fields";
import { requireQuoter } from "@/lib/auth";
import { optionTotals } from "@/lib/calc";
import { money, pct } from "@/lib/format";
import { getQuote } from "@/lib/quotes/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quote" };

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ opt?: string }>;
}) {
  const email = await requireQuoter();
  const { id } = await params;
  const { opt } = await searchParams;
  const quote = await getQuote(id);
  if (!quote) notFound();

  const showAnalysis = opt === "analysis";
  const option = showAnalysis ? null : (quote.options.find((o) => o.id === opt) ?? quote.options[0] ?? null);

  return (
    <div className="wrap">
      <TopBar email={email} />
      <div className="app">
        <div className="apphead">
          <div className="who">
            <h2>{quote.customerName ?? "No customer"}</h2>
            <div className="sub">
              {[quote.siteAddress, quote.siteCity].filter(Boolean).join(", ") || "No site address"}
              {" · "}
              {quote.quoteId ?? "No quote ID"}
              {quote.version !== null && ` v${quote.version}`}
            </div>
          </div>
          {quote.status && <span className="pill">{quote.status}</span>}
          {quote.basis && <span className="pill">{quote.basis}</span>}
          <span className="pill">Discount {pct(quote.discountRate * 100, 0)}</span>
          <span className="pill">HST {quote.showHst ? "on" : "off"}</span>
          <span className="pill ro">Read-only</span>
        </div>

        {quote.options.length > 0 && (
          <nav className="tabs" aria-label="Options">
            {quote.options.map((o) => (
              <Link
                key={o.id}
                className="tab"
                href={`/q/${quote.id}?opt=${o.id}`}
                aria-current={option?.id === o.id ? "page" : undefined}
              >
                {o.name}
                <span className="t-amt">{money(optionTotals(o.lines, quote.discountRate, quote.showHst).total)}</span>
              </Link>
            ))}
            <Link className="tab anal" href={`/q/${quote.id}?opt=analysis`} aria-current={showAnalysis ? "page" : undefined}>
              Analysis
            </Link>
          </nav>
        )}

        {quote.legacyLineCount > 0 && (
          <p className="banner warn">
            {quote.legacyLineCount} line{quote.legacyLineCount === 1 ? " is" : "s are"} in the old A/B/C format and
            belong to no option, so they are not shown. Open the quote in Airtable to see them.
          </p>
        )}

        {showAnalysis ? (
          <Analysis quote={quote} />
        ) : option ? (
          <OptionSheet option={option} discountRate={quote.discountRate} showHst={quote.showHst} />
        ) : (
          <p className="empty">This quote has no options yet.</p>
        )}

        <div className="foot">
          <a href={airtableRecordUrl(T.quotes, quote.id)} target="_blank" rel="noreferrer">Open in Airtable</a>
          {quote.validUntil && <span>Valid until {quote.validUntil}</span>}
          {quote.sentAt && <span>Sent {quote.sentAt}</span>}
          {quote.notes && <span className="note">{quote.notes}</span>}
        </div>
      </div>
    </div>
  );
}
