import { acceptedWhen, depositOf, dueNow, picksOf, type Acceptance } from "@/lib/accept/plan";
import { termsLabel } from "@/lib/accept/terms";
import { money } from "@/lib/format";
import { payWords } from "@/lib/pricing/schedule";
import { depositHow, dueWords } from "@/lib/send/plan";

/**
 * The top of an accepted quote's page (2026-10-27): when it was accepted and by whom, the deposit and
 * how to pay it, and what happens next. Drawn from the frozen acceptance record only.
 */
export function AcceptedNote({
  a,
  quoteNumber,
  etransfer,
  pdfHref,
  termsHref,
  newerHref = null,
}: {
  a: Acceptance;
  quoteNumber: string;
  etransfer: string | null;
  pdfHref: string;
  /** The Project Expectations they agreed to; null when that PDF can't be found. */
  termsHref: string | null;
  newerHref?: string | null;
}) {
  const deposit = depositOf(a);
  const first = a.name.split(" ")[0];
  // New work added to a project (2026-10-31): what was added, and only what is due now.
  const due = dueNow(a);
  const added = a.base ? picksOf(a).map((p) => p.name).join(" and ") : null;
  return (
    <section className="cq-card cq-accepted" role="status" aria-labelledby="accd-h">
      <p className="cq-kicker">Accepted</p>
      {newerHref && (
        <p className="cq-state replaced">
          We&apos;ve updated this quote since, as we discussed. <a href={newerHref}>See your updated quote</a>
        </p>
      )}
      <h2 id="accd-h">
        {added ? (
          <>Thank you{first ? `, ${first}` : ""}. You added {added} to your project on {acceptedWhen(a.at)}.</>
        ) : (
          <>Thank you{first ? `, ${first}` : ""}. You accepted {a.option.name} on {acceptedWhen(a.at)}.</>
        )}
      </h2>
      {added && <p>{dueWords(due, (n) => money(n))}</p>}
      <div className="dep">
        <span className="k">{added ? "Due now" : "Your deposit"}</span>
        <span className="v">{money(added ? due.due : deposit.amount)}</span>
        <span className="how">{etransfer || deposit.pay === "onsite" ? depositHow(deposit, { etransfer: etransfer ?? "", quoteNumber }) : (payWords(deposit.pay) ?? "We'll send you how to pay it.")}</span>
      </div>
      <p>
        {added
          ? "Nothing new is ordered until it is in. Your payment schedule below is for the whole project."
          : "Nothing is final until the deposit is in. Once it is, your materials are ordered and your date is locked in. We'll call you to set your start date."}
      </p>
      <p className="links">
        <a href={pdfHref}>Your accepted quote (PDF)</a>
        {termsHref && (
          <>
            {" · "}
            <a href={termsHref} target="_blank" rel="noreferrer">
              Project Expectations ({termsLabel(a.terms)})
            </a>
          </>
        )}
      </p>
    </section>
  );
}
