import Link from "next/link";
import { notFound } from "next/navigation";
import { AcceptedCard, AcceptForCustomer } from "@/components/AcceptStaff";
import { AddressScan } from "@/components/AddressScan";
import { Analysis } from "@/components/Analysis";
import { ConversationDrawer } from "@/components/Conversation";
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
import { previewCopy, sendingReady, sendsFrom, sentLink } from "@/lib/quotes/send";
import { acceptedWhen, addOnsOf } from "@/lib/accept/plan";
import { acceptReadiness } from "@/lib/accept/staff";
import { TERMS } from "@/lib/accept/terms";
import { ghlOpportunityUrl } from "@/lib/ghl/ids";
import { logEntries } from "@/lib/quotes/history";
import { addDays, leadPrice, priceRange, rangeText, torontoToday, VALID_DAYS } from "@/lib/send/copy";
import { optionProblem, sendProblems } from "@/lib/send/plan";

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
  const [ready, link, from] = await Promise.all([sendingReady(), sentLink(quote.customerToken), sendsFrom()]);
  const problems = draft
    ? sendProblems(quote, { base, validUntil: defaultUntil, channels: { email: !!quote.link?.email, sms: !!quote.link?.phone } }, { today, fingerprint: base, skipOptions: true })
    : [];
  // Which options go to the customer (2026-10-24): one tick each on the Send card, with its price before HST and any problem.
  // A preliminary goes as a range unless the sender picks the exact price (2026-10-27): the card shows whichever will go.
  const preliminary = quote.basis === "Preliminary";
  const sendOptions = quote.options.map((o) => {
    const lead = leadPrice(quote, optionTotals(o.lines, quote.discountRate, quote.showHst));
    const r = priceRange(lead.amount);
    const range = preliminary && lead.amount > 0 ? `${rangeText(r.low, r.high)} ${lead.tag}` : null;
    return { id: o.id, name: o.name, price: `${money(lead.amount)} ${lead.tag}`, range, recommended: o.recommended, problem: optionProblem(quote, o) };
  });
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
      preliminary={preliminary}
      from={from}
      options={sendOptions}
    />
  );
  // Acceptance (2026-10-27): on a measured version out with the customer, accept with them or for them;
  // once accepted, what was agreed and where the hand-off to GHL and Notion stands. Staff only.
  const acceptable = !customer && quote.status === "Sent" && quote.basis === "Measured" && !quote.changeNo && !quote.acceptance;
  const [off, sentCopy] = acceptable ? await Promise.all([acceptReadiness(), previewCopy(quote.id)]) : [null, null];
  const acceptCard =
    acceptable && sentCopy ? (
      <AcceptForCustomer
        versionId={quote.id}
        link={link}
        options={sentCopy.options.map((o, index) => ({ index, name: o.name, subtotal: o.totals.subtotal, addOns: addOnsOf(sentCopy, o) }))}
        customerName={[quote.link?.firstName, quote.link?.lastName].filter(Boolean).join(" ") || quote.customerName}
        termsVersion={TERMS?.version ?? null}
        off={off}
      />
    ) : null;
  const acceptedCard =
    !customer && quote.acceptance ? (
      <AcceptedCard
        versionId={quote.id}
        a={quote.acceptance}
        when={acceptedWhen(quote.acceptance.at)}
        projectNumber={quote.link?.projectNumber ?? null}
        links={[
          ...(quote.link?.ghlOpportunityId ? [{ label: "GHL opportunity", href: ghlOpportunityUrl(quote.link.ghlOpportunityId) }] : []),
          ...(quote.link?.notionProjectUrl ? [{ label: "Notion project", href: quote.link.notionProjectUrl }] : []),
          ...(quote.link?.folderUrl ? [{ label: "Job folder", href: quote.link.folderUrl }] : []),
          ...(quote.link?.companyCamUrl ? [{ label: "CompanyCam", href: quote.link.companyCamUrl }] : []),
          ...(link ? [{ label: "Customer's accepted page", href: link }] : []),
        ]}
        changeHref={null}
        current={quote.link?.contractVersionId === quote.id}
      />
    ) : null;

  // Who worked on this version (2026-10-22): newest first, from the append-only Edit Log. Staff only.
  const history = logEntries(quote.editLog);
  const historyCard = customer ? null : (
    <section className="card hist" aria-labelledby="hist-h">
      <div className="card-h" id="hist-h">
        History
        {quote.lastEditedBy && <span className="right faint">last saved by {quote.lastEditedBy}</span>}
      </div>
      <div className="card-b">
        {history.length === 0 ? (
          <p className="faint">No saves recorded yet{quote.createdBy ? ` · created by ${quote.createdBy}` : ""}.</p>
        ) : (
          <details open={history.length <= 3}>
            <summary>{history.length} {history.length === 1 ? "entry" : "entries"}</summary>
            <ul className="hist-l">
              {history.map((h, i) => (
                <li key={i}>
                  <span className="hist-when">{h.when}</span>
                  <span className="hist-who">{h.who}</span>
                  <span className="hist-what">{h.what}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );

  return (
    <>
      <TopBar email={email} />
      {/* The customer's GHL conversation, docked to the right edge: staff only, so Customer view never has it, and never on a quote with no contact. */}
      {!customer && quote.link?.ghlContactId && <ConversationDrawer contactId={quote.link.ghlContactId} />}
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

            {/* Address arrived (2026-10-27): a quote still without an address reads the customer's messages for one. Staff only. */}
            {!customer && quote.link?.ghlContactId && !quote.link.projectNumber && <AddressScan quoteRecordId={quote.link.quoteRecordId} skip={Boolean(quote.siteAddress)} />}

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
              <Analysis quote={quote} customer={customer} />
            ) : option && totals ? (
              <OptionSheet
                option={option}
                t={totals}
                discountRate={quote.discountRate}
                showHst={quote.showHst}
                quoteNotes={quote.notes}
                editHref={`/q/${quote.id}/edit`}
                customer={customer}
                lumpSum={quote.itemised !== true}
              />
            ) : (
              <section className="card">
                <p className="empty">This quote has no options yet.</p>
              </section>
            )}
            {!(option && totals) && acceptedCard}
            {!(option && totals) && acceptCard}
            {!(option && totals) && send}
            {!(option && totals) && historyCard}
          </div>

          {option && totals && (
            <div className="stack">
              {acceptedCard}
              {acceptCard}
              {send}
              <Financials
                schedule={quote.schedule ?? null}
                lines={option.lines}
                t={totals}
                discountRate={quote.discountRate}
                showHst={quote.showHst}
                agrees={parityDiffs(totals, option.airtable).length === 0}
                customer={customer}
              />
              {historyCard}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
