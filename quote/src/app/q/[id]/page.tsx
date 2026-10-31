import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { AcceptedCard, AcceptForCustomer, ChangeCard, PutOnContract } from "@/components/AcceptStaff";
import { AddressScan } from "@/components/AddressScan";
import { BillingCard } from "@/components/BillingCard";
import { Analysis } from "@/components/Analysis";
import { CompanyCamPhotos } from "@/components/CompanyCamPhotos";
import { ConversationDrawer } from "@/components/Conversation";
import { CustomerCard } from "@/components/CustomerCard";
import { Financials } from "@/components/Financials";
import { LinkJob } from "@/components/LinkJob";
import { OptionSheet } from "@/components/OptionSheet";
import { Rooms } from "@/components/Rooms";
import { SiteSheetTab } from "@/components/SiteSheet";
import { SendQuote } from "@/components/SendQuote";
import { TopBar } from "@/components/TopBar";
import { airtableRecordUrl, T } from "@/lib/airtable/fields";
import { requireQuoter } from "@/lib/auth";
import { optionTotals, parityDiffs } from "@/lib/calc";
import { money } from "@/lib/format";
import { jobChoices } from "@/lib/quotes/link";
import { billingState } from "@/lib/quotes/billing";
import { partKey, scopeGroups } from "@/lib/quotes/scope";
import { loadContract } from "@/lib/quotes/contract";
import { contractParts } from "@/lib/contract/model";
import { fromWords } from "@/lib/quotes/group";
import { getQuote, getRateCard } from "@/lib/quotes/load";
import { sheetReaderOn } from "@/lib/quotes/sitesheet";
import { parseStored } from "@/lib/sitesheet/sheet";
import { refreshFromGhl } from "@/lib/quotes/refresh";
import { loadCompanyCam } from "@/lib/quotes/companycam";
import { customerView } from "@/lib/view";
import { fromQuote } from "@/lib/editor/model";
import { fingerprint } from "@/lib/quotes/savePlan";
import { previewCopy, sendingReady, sendsFrom, sentLink } from "@/lib/quotes/send";
import { acceptedWhen, addOnsOf, picksOf } from "@/lib/accept/plan";
import { acceptReadiness } from "@/lib/accept/staff";
import { termsLabel } from "@/lib/accept/terms";
import { ghlOpportunityUrl } from "@/lib/ghl/ids";
import { logEntries } from "@/lib/quotes/history";
import { addDays, leadPrice, offersPdf, partOf, priceRange, rangeText, torontoToday, VALID_DAYS } from "@/lib/send/copy";
import { optionProblem, sendProblems } from "@/lib/send/plan";
import { parseRooms } from "@/lib/rooms/log";

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
  // The Rooms tab (2026-10-27): staff only, so Customer view never has it.
  const showRooms = opt === "rooms" && !customer;
  // The Site sheet tab (2026-10-28): staff only, like Rooms.
  const showSheet = opt === "sheet" && !customer;
  // The Photos tab (2026-10-30): the job's CompanyCam project, staff only, on a quote that links one.
  const camUrl = quote.link?.companyCamUrl ?? null;
  const showPhotos = opt === "photos" && !customer && Boolean(camUrl);
  const option = showAnalysis || showRooms || showSheet || showPhotos ? null : (quote.options.find((o) => o.id === opt) ?? quote.options[0] ?? null);
  const tabGroups = scopeGroups(quote.options);
  const totals = option ? optionTotals(option.lines, quote.discountRate, quote.showHst) : null;
  const madeFrom = fromWords(quote.changeNo, null);
  const airtableUrl = airtableRecordUrl(T.versions, quote.id);
  // A quote with no GHL opportunity yet (Needs linking): offer the customer's jobs to link it to.
  const unlinked = quote.link && !quote.link.ghlOpportunityId ? quote.link : null;
  // The accepted quote has no Edit (2026-10-30): it changes only through Make a change, as the editor says.
  const agreed = Boolean(quote.acceptance && !quote.acceptance.cancelled);
  // A change that has gone out (Sent, or Superseded by a later change) has no Edit either (2026-10-31): the editor
  // could not save it, so the button only raised "why can't I save?". The newest change is where edits go.
  const locked = agreed || Boolean(quote.changeNo && quote.status !== "Draft");
  // The option tabs mark what the customer took (2026-10-30), one per scope at most.
  // Put on contract (2026-10-30): on a quote with a contract, an option of a Part the contract covers can replace the one there.
  const contractId = quote.link?.contractVersionId ?? null;
  const loadedContract = !customer && contractId && quote.link ? await loadContract(quote.link.quoteRecordId) : null;
  const putOn = loadedContract && contractId && !quote.changeNo ? { versionId: contractId, parts: new Set(contractParts(loadedContract.contract)) } : null;
  const acceptedIds = new Set(agreed && quote.acceptance ? picksOf(quote.acceptance).flatMap((p) => (p.ref ? [p.ref] : [])) : []);
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
    return { id: o.id, name: o.name, price: `${money(lead.amount)} ${lead.tag}`, range, recommended: o.recommended, notOffered: o.notOffered === true, problem: optionProblem(quote, o) };
  });
  // Send again (2026-10-30) says whether their page already offers the PDF: read from the frozen copy, only for a version out with the customer.
  const sentPdf = !customer && quote.status === "Sent" ? offersPdf((await previewCopy(quote.id)) ?? { pdf: false }) : false;
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
      sent={draft ? null : { sentAt: quote.sentAt, sentBy: quote.sentBy, sentTo: quote.sentTo, validUntil: quote.validUntil, link, activity: quote.activity ?? null, pdf: sentPdf }}
      preliminary={preliminary}
      change={quote.changeNo ?? null}
      from={from}
      options={sendOptions}
    />
  );
  // The Rooms log lives on the quote (Quotes → Rooms), so every version shows the same rooms.
  const roomsRaw = quote.link?.rooms ?? "";
  const roomsLog = parseRooms(roomsRaw);
  const roomsSaved = roomsLog.by && roomsLog.at
    ? `Last saved by ${roomsLog.by} · ${new Date(roomsLog.at).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
    : null;

  // The stair site sheet (2026-10-28) lives on the quote too (Quotes → Site Sheet); the card is read only when the tab is open.
  const sheetRaw = quote.link?.siteSheet ?? "";
  const sheetStored = parseStored(sheetRaw);
  const [sheetCard, sheetOn] = showSheet && quote.link ? await Promise.all([getRateCard(), sheetReaderOn()]) : [null, false];
  // CompanyCam is read only when the Photos tab is open, so it never slows a quote opening.
  const camPhotos = showPhotos ? await loadCompanyCam(camUrl) : null;

  // Acceptance (2026-10-27): on a measured version out with the customer, accept with them or for them;
  // once accepted, what was agreed and where the hand-off to GHL and Notion stands. Staff only.
  const acceptable = !customer && quote.status === "Sent" && quote.basis === "Measured" && !quote.changeNo && !quote.acceptance;
  const [acceptGate, sentCopy] = acceptable ? await Promise.all([acceptReadiness(), previewCopy(quote.id)]) : [null, null];
  const acceptCard =
    acceptable && sentCopy ? (
      <AcceptForCustomer
        versionId={quote.id}
        link={link}
        options={sentCopy.options.map((o, index) => ({ index, name: o.name, subtotal: o.totals.subtotal, part: partOf(o), addOns: addOnsOf(sentCopy, index) }))}
        customerName={[quote.link?.firstName, quote.link?.lastName].filter(Boolean).join(" ") || quote.customerName}
        terms={acceptGate?.terms ? { id: acceptGate.terms.id, label: termsLabel(acceptGate.terms.on) } : null}
        off={acceptGate?.off ?? null}
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
        canChange={quote.link?.contractVersionId === quote.id}
        current={quote.link?.contractVersionId === quote.id}
      />
    ) : null;

  // The project's invoice or receipt (2026-10-30): on the contract version only, staff only.
  const billing = !customer && quote.link?.contractVersionId === quote.id && ["Accepted", "Won", "Sent"].includes(quote.status ?? "") ? await billingState(quote.id) : null;
  const billingCard = billing ? <BillingCard versionId={quote.id} s={billing} /> : null;

  const changeCard =
    !customer && quote.changeNo ? (
      <ChangeCard versionId={quote.id} changeNo={quote.changeNo} status={quote.status} sentAt={quote.sentAt} current={quote.link?.contractVersionId === quote.id} />
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
              {/* The label already ends in "v4"; only an unlabelled version needs the number. */}
              {quote.version !== null && !(quote.quoteId ?? "").endsWith(`v${quote.version}`) && ` · v${quote.version}`}
              {madeFrom && ` · ${madeFrom}`}
              {!locked && (
                <>
                  {" · "}
                  <Link href={`/q/${quote.id}/edit`}>Edit this quote</Link>
                </>
              )}
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

            {(quote.options.length > 0 || !customer) && (
              <nav className="tabs" aria-label="Options">
                {tabGroups.groups.map((g, i) => (
                  <Fragment key={g.scope}>
                    {i > 0 && <span className="tab-sep" aria-hidden />}
                    {tabGroups.split && <span className="tab-scope">{g.scope}</span>}
                    {g.options.map((o) => (
                      <Link
                        key={o.id}
                        className={["tab", acceptedIds.has(o.id) ? "accepted" : "", o.notOffered ? "off" : ""].filter(Boolean).join(" ")}
                        href={`/q/${quote.id}?opt=${o.id}`}
                        aria-current={option?.id === o.id ? "page" : undefined}
                        title={o.notOffered ? "Not offered: never sent to the customer" : undefined}
                      >
                        {acceptedIds.has(o.id) && <span className="t-acc">✓ Accepted</span>}
                        {o.notOffered && <span className="t-off">Not offered</span>}
                        {o.part && <span className="t-part">{o.part}</span>}
                        <span className="t-name">{o.name}</span>
                        <span className="t-amt">{money(optionTotals(o.lines, quote.discountRate, quote.showHst).total)}</span>
                      </Link>
                    ))}
                  </Fragment>
                ))}
                {quote.options.length > 0 && !customer && <span className="tab-sep" aria-hidden />}
                {!customer && (
                  <Link className="tab rooms" href={`/q/${quote.id}?opt=rooms`} aria-current={showRooms ? "page" : undefined}>
                    Rooms
                    {roomsLog.rooms.length > 0 && <span className="t-amt">{roomsLog.rooms.length}</span>}
                  </Link>
                )}
                {!customer && (
                  <Link className="tab sheet" href={`/q/${quote.id}?opt=sheet`} aria-current={showSheet ? "page" : undefined}>
                    Site sheet
                    {sheetStored && <span className="t-amt">{sheetStored.checked ? "checked" : "to check"}</span>}
                  </Link>
                )}
                {!customer && camUrl && (
                  <Link className="tab photos" href={`/q/${quote.id}?opt=photos`} aria-current={showPhotos ? "page" : undefined}>
                    Photos
                  </Link>
                )}
                {quote.options.length > 0 && (
                  <Link className="tab anal" href={`/q/${quote.id}?opt=analysis`} aria-current={showAnalysis ? "page" : undefined}>
                    Analysis
                  </Link>
                )}
              </nav>
            )}

            {showPhotos && camPhotos && camUrl ? (
              <CompanyCamPhotos result={camPhotos} linkUrl={camUrl} />
            ) : showSheet ? (
              quote.link && sheetCard ? (
                <SiteSheetTab
                  quoteRecordId={quote.link.quoteRecordId}
                  versionId={quote.id}
                  raw={sheetRaw}
                  photos={quote.link.siteSheetPhotos ?? []}
                  initial={fromQuote(quote)}
                  base={base}
                  card={sheetCard}
                  enabled={sheetOn}
                />
              ) : (
                <section className="card">
                  <p className="empty">This version isn&apos;t attached to a quote in Airtable, so there is nowhere to keep a site sheet.</p>
                </section>
              )
            ) : showRooms ? (
              quote.link ? (
                <Rooms quoteRecordId={quote.link.quoteRecordId} quoteNumber={quote.link.quoteNumber} raw={roomsRaw} savedLabel={roomsSaved} />
              ) : (
                <section className="card">
                  <p className="empty">This version isn&apos;t attached to a quote in Airtable, so there is nowhere to keep rooms.</p>
                </section>
              )
            ) : showAnalysis ? (
              <Analysis quote={quote} customer={customer} />
            ) : option && totals ? (
              <>
              {!customer && option.notOffered && <p className="no-offer-banner" role="note"><b>Not offered.</b> This option stays on the quote but is never sent to the customer. Untick Not offered in the editor to send it.</p>}
              {putOn && !acceptedIds.has(option.id) && putOn.parts.has(partKey(option)) && (
                <PutOnContract contractVersionId={putOn.versionId} optionId={option.id} part={partKey(option)} />
              )}
              <OptionSheet
                option={option}
                t={totals}
                discountRate={quote.discountRate}
                showHst={quote.showHst}
                quoteNotes={quote.notes}
                editHref={locked ? null : `/q/${quote.id}/edit`}
                customer={customer}
                lumpSum={quote.itemised !== true}
                sendable={draft}
              />
              </>
            ) : (
              <section className="card">
                <p className="empty">This quote has no options yet.</p>
              </section>
            )}
            {!(option && totals) && changeCard}
            {!(option && totals) && acceptedCard}
            {!(option && totals) && billingCard}
            {!(option && totals) && acceptCard}
            {!(option && totals) && send}
            {!(option && totals) && historyCard}
          </div>

          {option && totals && (
            <div className="stack">
              {changeCard}
              {acceptedCard}
              {billingCard}
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
