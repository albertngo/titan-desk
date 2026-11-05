import { acceptedWhen, type Acceptance } from "@/lib/accept/plan";
import { termsLabel } from "@/lib/accept/terms";
import { money } from "@/lib/format";
import { payWords } from "@/lib/pricing/schedule";
import { depositAmount, depositParts, depositSteps } from "@/lib/send/plan";

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
  // The deposit may be in two parts (2026-11-05): the material, then the rest of it in store.
  const parts = depositParts(a.stages);
  const needsEtransfer = parts.some((s) => s.pay === "etransfer" || s.pay === null);
  const how = etransfer || !needsEtransfer ? depositSteps(a.stages, { etransfer: etransfer ?? "", quoteNumber }) : [parts.map((s) => payWords(s.pay)).filter(Boolean).join("; ") || "We'll send you how to pay it."];
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
        <span className="v">{money(depositAmount(a.stages))}</span>
        {how.map((x) => (
          <span className="how" key={x}>
            {x}
          </span>
        ))}
      </div>
      <p>Nothing is final until the deposit is in. Once it is, your materials are ordered and your date is locked in. We&apos;ll call you to set your start date.</p>
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
