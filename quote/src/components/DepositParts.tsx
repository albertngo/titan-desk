import { payWords, type PayHow } from "@/lib/pricing/schedule";

/**
 * A deposit paid in two parts the same day (Albert, 2026-11-26, option A: "Materials for deposit, paid by e-transfer +
 * Rest of deposit, cash = total... shown together, outlined, and obvious that it is together, but should be paid by
 * different forms"): one outlined Deposit with its total, each part inside with how it is paid. Shown only when the
 * deposit really is two or more parts (`depositSplit()`); a single deposit stays one line.
 */
export type DepositPart = { label: string; note: string; figure: string; pay: PayHow };

const tag = (pay: PayHow) => {
  const w = payWords(pay);
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : null;
};

export function DepositParts({ parts, total }: { parts: DepositPart[]; total: string }) {
  return (
    <div className="cq-dep" role="group" aria-label="Deposit">
      <div className="cq-dep-h">
        <span>
          Deposit
          <span className="sub">Both parts on acceptance, to secure your materials and your dates</span>
        </span>
        <span className="amt">{total}</span>
      </div>
      {parts.map((p, i) => (
        <div key={i} className="cq-dep-p">
          <span className="n">
            <span className="t">
              {p.label}
              {tag(p.pay) && <span className={`cq-how ${p.pay === "etransfer" ? "et" : "cash"}`}>{tag(p.pay)}</span>}
            </span>
            {p.note && <span className="sub">{p.note}</span>}
          </span>
          <span className="amt">{p.figure}</span>
        </div>
      ))}
    </div>
  );
}
