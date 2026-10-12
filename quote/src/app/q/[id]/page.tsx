import Link from "next/link";
import { notFound } from "next/navigation";
import { Analysis } from "@/components/Analysis";
import { CustomerCard } from "@/components/CustomerCard";
import { Financials } from "@/components/Financials";
import { OptionSheet } from "@/components/OptionSheet";
import { TopBar } from "@/components/TopBar";
import { airtableRecordUrl, T } from "@/lib/airtable/fields";
import { requireQuoter } from "@/lib/auth";
import { optionTotals, parityDiffs } from "@/lib/calc";
import { money } from "@/lib/format";
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
  const totals = option ? optionTotals(option.lines, quote.discountRate, quote.showHst) : null;
  const airtableUrl = airtableRecordUrl(T.quotes, quote.id);

  return (
    <>
      <TopBar email={email} />
      <div className="page">
        <div className="pagehead">
          <div className="titles">
            <Link href="/" className="crumb">← All quotes</Link>
            <h1>{quote.customerName ?? "No customer"}</h1>
            <p>
              {quote.quoteId ?? "No quote ID"}
              {quote.version !== null && ` · v${quote.version}`}
              {" · "}
              <Link href={`/q/${quote.id}/edit`}>Edit this quote</Link>
            </p>
          </div>
          {quote.status && <span className={`status ${quote.status}`}>{quote.status}</span>}
        </div>

        <div className={`layout${option && totals ? "" : " full"}`}>
          <div className="stack">
            <CustomerCard quote={quote} />

            {quote.legacyLineCount > 0 && (
              <p className="card banner warn">
                {quote.legacyLineCount} line{quote.legacyLineCount === 1 ? " is" : "s are"} in the old A/B/C format and
                belong to no option, so they are not shown. <a href={airtableUrl} target="_blank" rel="noreferrer">Open in Airtable</a> to see them.
              </p>
            )}

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

            {showAnalysis ? (
              <Analysis quote={quote} />
            ) : option && totals ? (
              <OptionSheet
                option={option}
                t={totals}
                discountRate={quote.discountRate}
                showHst={quote.showHst}
                quoteNotes={quote.notes}
                airtableUrl={airtableUrl}
                editHref={`/q/${quote.id}/edit`}
              />
            ) : (
              <section className="card">
                <p className="empty">This quote has no options yet.</p>
              </section>
            )}
          </div>

          {option && totals && (
            <Financials
              lines={option.lines}
              t={totals}
              discountRate={quote.discountRate}
              showHst={quote.showHst}
              agrees={parityDiffs(totals, option.airtable).length === 0}
            />
          )}
        </div>
      </div>
    </>
  );
}
