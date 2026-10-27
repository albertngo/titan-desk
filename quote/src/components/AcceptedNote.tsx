import { acceptedWhen, depositOf, type Acceptance } from "@/lib/accept/plan";
import { termsHref } from "@/lib/accept/terms";
import { money } from "@/lib/format";
import { payWords } from "@/lib/pricing/schedule";
import { depositHow } from "@/lib/send/plan";

/**
 * The top of an accepted quote's page (2026-10-27): when it was accepted and by whom, the deposit and
 * how to pay it, and what happens next. Drawn from the frozen acceptance record only.
 */
export function AcceptedNote({ a, quoteNumber, etransfer, pdfHref, newerHref = null }: { a: Acceptance; quoteNumber: string; etransfer: string | null; pdfHref: string; newerHref?: string | null }) {
  const deposit = depositOf(a);
  const first = a.name.split(" ")[0];
  return (
    <section className="cq-card cq-accepted" role="status" aria-labelledby="accd-h">
      <p className="cq-kicker">Accepted</p>
      {newerHref && (
        <p className="cq-state replaced">
          We&apos;ve updated this quote since, as we discussed. <a href={newerHref}>See your updated quote</a>
        </p>
      )}
      <h2 id="accd-h">
        Thank you{first ? `, ${first}` : ""}. You accepted {a.option.name} on {acceptedWhen(a.at)}.
      </h2>
      <div className="dep">
        <span className="k">Your deposit</span>
        <span className="v">{money(deposit.amount)}</span>
        <span className="how">{etransfer || deposit.pay === "onsite" ? depositHow(deposit, { etransfer: etransfer ?? "", quoteNumber }) : (payWords(deposit.pay) ?? "We'll send you how to pay it.")}</span>
      </div>
      <p>Nothing is final until the deposit is in. Once it is, your materials are ordered and your date is locked in. We&apos;ll call you to set your start date.</p>
      <p className="links">
        <a href={pdfHref}>Your accepted quote (PDF)</a>
        {" · "}
        <a href={termsHref({ version: a.terms })} target="_blank" rel="noreferrer">
          Project Expectations (version {a.terms})
        </a>
      </p>
    </section>
  );
}
