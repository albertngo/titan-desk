import "server-only";
import type { ComponentProps } from "react";
import type { SendQuote } from "@/components/SendQuote";
import { DEFAULT_PRIVATE_LABEL, optionHst, optionTotals, privateRollup } from "@/lib/calc";
import { optionScope } from "@/lib/quotes/scope";
import { fromQuote } from "@/lib/editor/model";
import { money } from "@/lib/format";
import { fingerprint } from "@/lib/quotes/savePlan";
import { lastSentWayFor, previewCopy, sendAsForCard, sendingReady, sendsFrom, sentLink, textsFrom } from "@/lib/quotes/send";
import type { Quote } from "@/lib/quotes/types";
import { addDays, leadPrice, offersPdf, priceRange, rangeText, torontoToday, VALID_DAYS } from "@/lib/send/copy";
import { optionProblem, sendProblems } from "@/lib/send/plan";

/**
 * What the Send card needs, worked out on the server (milestone 4; shared by the quote page and, since 2026-11-06,
 * the editor: Albert, "Send option card WITHIN the 'edit' screen is also available"). The problems are decided by the
 * same check the send runs. `props` is null in Customer view, which never shows the card. `link`, `sendAs` and `base`
 * are returned too, for the quote page's other cards.
 */
export async function sendCardData(quote: Quote, customer: boolean) {
  const today = torontoToday(new Date());
  const base = fingerprint(fromQuote(quote));
  const defaultUntil = quote.validUntil && quote.validUntil >= today ? quote.validUntil : addDays(today, VALID_DAYS);
  const draft = quote.status === "Draft";
  // The way the last version went (Albert, 2026-11-06): the card says it and starts on it, for a draft only.
  const [ready, link, from, textFromNumber, sendAs, lastSent] = await Promise.all([sendingReady(), sentLink(quote.customerToken), sendsFrom(), textsFrom(), sendAsForCard(quote), draft ? lastSentWayFor(quote.link?.quoteRecordId ?? null) : Promise.resolve(null)]);
  const problems = draft
    ? sendProblems(quote, { base, validUntil: defaultUntil, channels: { email: !!quote.link?.email, sms: !!quote.link?.phone } }, { today, fingerprint: base, skipOptions: true })
    : [];
  // Which options go to the customer (2026-10-24): one tick each on the Send card, with its price before HST and any problem.
  // A preliminary goes as a range unless the sender picks the exact price (2026-10-27): the card shows whichever will go.
  const preliminary = quote.basis === "Preliminary";
  const sendOptions = quote.options.map((o) => {
    const lead = leadPrice({ showHst: optionHst(quote, o) }, optionTotals(o.lines, quote.discountRate, optionHst(quote, o)));
    const r = priceRange(lead.amount);
    const range = preliminary && lead.amount > 0 ? `${rangeText(r.low, r.high)} ${lead.tag}` : null;
    // A flooring option's Private section (2026-11-07): the one line a breakdown shows; a stairs option's never shows.
    const stairs = optionScope(o) === "Stairs";
    const privAmount = privateRollup(o.lines);
    const priv = privAmount > 0 ? { label: o.privateLabel?.trim() || DEFAULT_PRIVATE_LABEL, amount: money(privAmount), stairs } : null;
    return { id: o.id, name: o.name, price: `${money(lead.amount)} ${lead.tag}`, range, recommended: o.recommended, notOffered: o.notOffered === true, problem: optionProblem(quote, o), priv };
  });
  // Send again (2026-10-30) says whether their page already offers the PDF: read from the frozen copy, only for a version out with the customer.
  const sentPdf = !customer && quote.status === "Sent" ? offersPdf((await previewCopy(quote.id)) ?? { pdf: false }) : false;
  const props: ComponentProps<typeof SendQuote> | null = customer
    ? null
    : {
        versionId: quote.id,
        label: `${quote.link?.quoteNumber ?? quote.quoteId ?? "this quote"}${quote.version !== null ? ` v${quote.version}` : ""}`,
        status: quote.status,
        base,
        today,
        defaultUntil,
        maxUntil: addDays(today, 365),
        firstName: quote.link?.firstName ?? null,
        email: quote.link?.email ?? null,
        phone: quote.link?.phone ?? null,
        problems,
        ready,
        sent: draft ? null : { sentAt: quote.sentAt, sentBy: quote.sentBy, sentTo: quote.sentTo, validUntil: quote.validUntil, link, activity: quote.activity ?? null, pdf: sentPdf },
        preliminary,
        change: quote.changeNo ?? null,
        from,
        textFrom: textFromNumber,
        sendAs,
        options: sendOptions,
        lastSent,
      };
  return { props, link, sendAs, base };
}
