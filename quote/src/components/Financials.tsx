import { lineFlags, stageAmounts, type LineInput, type OptionTotals } from "@/lib/calc";
import { defaultSchedule, payWords, type PaymentSchedule } from "@/lib/pricing/schedule";
import { money, pct } from "@/lib/format";
import { Ring } from "./Ring";

/**
 * Right-hand sidebar for one option: the money, the payment schedule, and the checks.
 * `agrees` is the Airtable parity result; null in the editor, where nothing is saved yet.
 * In Customer view it shows the price only: no profit, cost or checks.
 */
export function Financials({
  lines,
  t,
  discountRate,
  showHst,
  agrees,
  customer,
  schedule = null,
}: {
  /** The version's payment schedule (2026-10-27); null = 35 / 35 / balance. */
  schedule?: PaymentSchedule | null;
  lines: LineInput[];
  t: OptionTotals;
  discountRate: number;
  showHst: boolean;
  agrees: boolean | null;
  customer: boolean;
}) {
  const costShare = t.subtotal > 0 ? (t.cost / t.subtotal) * 100 : null;
  const flags = lines.flatMap(lineFlags);
  const count = (f: string) => flags.filter((x) => x === f).length;

  return (
    <aside className="stack">
      <section className="card">
        <div className="card-h">{customer ? "Price" : "Financials"}</div>
        <div className="fin">
          <div className="txt">
            <div className="k">Subtotal</div>
            <div className="s">After discount, before HST</div>
            <div className="v">{money(t.subtotal)}</div>
          </div>
        </div>
        <div className="fin">
          <div className="txt">
            <div className="k">Discount offered</div>
            <div className="s">{pct(discountRate * 100, 0)} of {money(t.preDiscount)}</div>
            <div className="v">{money(t.discount)}</div>
          </div>
          <Ring pct={discountRate * 100} />
        </div>
        {!customer && (
          <>
            <div className="fin">
              <div className="txt">
                <div className="k">Gross profit</div>
                <div className="s">Margin after the discount</div>
                <div className="v">{money(t.profit)}</div>
              </div>
              <Ring pct={t.marginPct} />
            </div>
            <div className="fin">
              <div className="txt">
                <div className="k">Cost</div>
                <div className="s">Share of the subtotal</div>
                <div className="v">{money(t.cost)}</div>
              </div>
              <Ring pct={costShare} />
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-h">Payment schedule <span className="right">{showHst ? "incl. HST" : t.hst ? "HST on materials" : "HST off"}</span></div>
        {stageAmounts(schedule ?? defaultSchedule(), lines, discountRate, showHst, t.total).map((s, i) => (
          <div className="pay" key={i} title={[s.when, payWords(s.pay)].filter(Boolean).join(", ")}>
            <span>
              {s.label} · {s.pct}%{s.pay === "onsite" ? " · on site" : ""}
            </span>
            <span className={`v${s.amount < 0 ? " bad" : ""}`}>{money(s.amount)}</span>
          </div>
        ))}
      </section>

      {!customer && (
        <section className="card">
          <div className="card-h">Checks</div>
          {agrees !== null && (
            <div className="check"><span className={`dot ${agrees ? "good" : "bad"}`} />{agrees ? "Airtable agrees to the cent" : "Airtable disagrees — see the red bar"}</div>
          )}
          <div className="check"><span className={`dot ${count("OVR") ? "warn" : "good"}`} />{count("OVR")} priced off the card</div>
          <div className="check"><span className={`dot ${count("NOSRC") ? "warn" : "good"}`} />{count("NOSRC")} with no rate source</div>
          <div className="check"><span className={`dot ${count("UNIT") ? "bad" : "good"}`} />{count("UNIT")} costing more than they charge</div>
        </section>
      )}
    </aside>
  );
}
