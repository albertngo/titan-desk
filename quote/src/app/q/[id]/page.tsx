import Link from "next/link";
import { notFound } from "next/navigation";
import { Analysis } from "@/components/Analysis";
import { Conversation } from "@/components/Conversation";
import { CustomerCard } from "@/components/CustomerCard";
import { Financials } from "@/components/Financials";
import { LinkJob } from "@/components/LinkJob";
import { OptionSheet } from "@/components/OptionSheet";
import { SendQuote } from "@/components/SendQuote";
import { TopBar } from "@/components/TopBar";
import { airtableRecordUrl, T } from "@/lib/airtable/fields";
import { requireQuoter } from "@/lib/auth";
import { optionTotals, parityDiffs } from "@/lib/calc";
import { money } from "@/lib/format";
import { jobChoices } from "@/lib/quotes/link";
import { getQuote } from "@/lib/quotes/load";
import { refreshFromGhl } from "@/lib/quotes/refresh";
import { customerView } from "@/lib/view";
import { fromQuote } from "@/lib/editor/model";
import { fingerprint } from "@/lib/quotes/savePlan";
import { sendingReady, sentLink } from "@/lib/quotes/send";
import { addDays, torontoToday, VALID_DAYS } from "@/lib/send/copy";
import { sendProblems } from "@/lib/send/plan";

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
  const loaded = await getQuote(id);
  if (!loaded) notFound();
  const [quote, customer] = await Promise.all([refreshFromGhl(loaded), customerView()]);

  const showAnalysis = opt === "analysis";
  const option = showAnalysis ? null : (quote.options.find((o) => o.id === opt) ?? quote.options[0] ?? null);
  const totals = option ? optionTotals(option.lines, quote.discountRate, quote.showHst) : null;
  const airtableUrl = airtableRecordUrl(T.versions, quote.id);
  // A quote with no GHL opportunity yet (Needs linking): offer the customer's jobs to link it to.
  const unlinked = quote.link && !quote.link.ghlOpportunityId ? quote.link : null;
  const jobs = unlinked ? await jobChoices(unlinked.quoteRecordId) : null;

  // Sending (milestone 4): what would stop it, decided by the same check the send runs.
  const today = torontoToday(new Date());
  const base = fingerprint(fromQuote(quote));
  const defaultUntil = quote.validUntil && quote.validUntil >= today ? quote.validUntil : addDays(today, VALID_DAYS);
  const draft = quote.status === "Draft";
  const [ready, link] = await Promise.all([sendingReady(), sentLink(quote.customerToken)]);
  const problems = draft
    ? sendProblems(quote, { base, validUntil: defaultUntil, channels: { email: !!quote.link?.email, sms: !!quote.link?.phone } }, { today, fingerprint: base })
    : [];
  const send = customer ? null : (
    <SendQuote
      versionId={quote.id}
      label={`${quote.link?.quoteNumber ?? quote.quoteId ?? "this quote"}${quote.version !== null ? ` v${quote.version}` : ""}`}
      status={quote.status}
      base={base}
      today={today}
      defaultUntil={defaultUntil}
      maxUntil={addDays(today, 365)}
      firstName={quote.link?.firstName ?? null}
      email={quote.link?.email ?? null}
      phone={quote.link?.phone ?? null}
      problems={problems}
      ready={ready}
      sent={draft ? null : { sentAt: quote.sentAt, sentBy: quote.sentBy, sentTo: quote.sentTo, validUntil: quote.validUntil, link }}
    />
  );

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
            {unlinked && jobs && <LinkJob quoteRecordId={unlinked.quoteRecordId} quoteNumber={unlinked.quoteNumber} jobs={jobs} />}

            <CustomerCard quote={quote} />

            {/* The customer's GHL conversation: staff only, so Customer view never has it, and never on a quote with no contact. */}
            {!customer && quote.link?.ghlContactId && <Conversation contactId={quote.link.ghlContactId} />}

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
              <Analysis quote={quote} customer={customer} />
            ) : option && totals ? (
              <OptionSheet
                option={option}
                t={totals}
                discountRate={quote.discountRate}
                showHst={quote.showHst}
                quoteNotes={quote.notes}
                airtableUrl={airtableUrl}
                editHref={`/q/${quote.id}/edit`}
                customer={customer}
              />
            ) : (
              <section className="card">
                <p className="empty">This quote has no options yet.</p>
              </section>
            )}
            {!(option && totals) && send}
          </div>

          {option && totals && (
            <div className="stack">
              {send}
              <Financials
                lines={option.lines}
                t={totals}
                discountRate={quote.discountRate}
                showHst={quote.showHst}
                agrees={parityDiffs(totals, option.airtable).length === 0}
                customer={customer}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
