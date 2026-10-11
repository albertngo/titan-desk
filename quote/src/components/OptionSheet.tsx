import {
  SECTIONS,
  costUsed,
  isPriced,
  lineCost,
  lineFlags,
  lineTotal,
  optionTotals,
  parityDiffs,
  priceUsed,
  type OptionTotals,
} from "@/lib/calc";
import { money, pct, rate } from "@/lib/format";
import type { QuoteLine, QuoteOption } from "@/lib/quotes/types";

const LABEL: Record<keyof OptionTotals, string> = {
  preDiscount: "Pre-discount",
  discount: "Discount",
  subtotal: "Subtotal",
  cost: "Cost",
  profit: "Profit",
  marginPct: "Margin",
  hst: "HST",
  total: "Total",
  payment1: "Payment 1",
  payment2: "Payment 2",
  paymentFinal: "Final payment",
};

function sectionOrder(lines: QuoteLine[]): string[] {
  const present = new Set(lines.map((l) => l.section ?? "Unsorted"));
  const known: string[] = SECTIONS.filter((s) => present.has(s) && s !== "Exclusions");
  if (present.has("Unsorted")) known.push("Unsorted");
  if (present.has("Exclusions")) known.push("Exclusions");
  return known;
}

/** Item numbers for priced, included lines only — exclusions and optional lines stay unnumbered. */
function numbering(lines: QuoteLine[], order: string[]): Map<string, number> {
  const n = new Map<string, number>();
  let i = 0;
  for (const s of order)
    for (const l of lines)
      if ((l.section ?? "Unsorted") === s && isPriced(l) && l.include) n.set(l.id, ++i);
  return n;
}

function Parity({ option, app }: { option: QuoteOption; app: OptionTotals }) {
  const diffs = parityDiffs(app, option.airtable);
  const lineDiffs = option.lines.filter(
    (l) =>
      isPriced(l) &&
      (Math.abs((lineTotal(l) ?? 0) - (l.airtableTotal ?? 0)) >= 0.005 ||
        Math.abs((lineCost(l) ?? 0) - (l.airtableCost ?? 0)) >= 0.005),
  );
  if (diffs.length === 0 && lineDiffs.length === 0)
    return <p className="banner ok">Airtable agrees with every figure on this option, to the cent.</p>;
  return (
    <div className="banner bad">
      <b>The app and Airtable disagree.</b> Trust neither until this is explained.
      <table>
        <tbody>
          {diffs.map((d) => (
            <tr key={d.key}>
              <td>{LABEL[d.key]}</td>
              <td>app {d.key === "marginPct" ? pct(d.app) : money(d.app)}</td>
              <td>Airtable {d.key === "marginPct" ? pct(d.airtable) : money(d.airtable)}</td>
            </tr>
          ))}
          {lineDiffs.map((l) => (
            <tr key={l.id}>
              <td>{l.description ?? "Line"}</td>
              <td>app {money(lineTotal(l))} / {money(lineCost(l))}</td>
              <td>Airtable {money(l.airtableTotal)} / {money(l.airtableCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ l, n }: { l: QuoteLine; n: number | undefined }) {
  if (!isPriced(l)) {
    return (
      <tr>
        <td className="gut" />
        <td colSpan={10}>
          {l.description}
          {l.clientNote && <span className="note"> — {l.clientNote}</span>}
        </td>
      </tr>
    );
  }
  const total = lineTotal(l);
  const cost = lineCost(l);
  const flags = lineFlags(l);
  const rateOvr = !!l.unitPrice && !!l.unitPriceSnap && l.unitPrice !== l.unitPriceSnap;
  const costOvr = !!l.costOverride && !!l.unitCostSnap && l.costOverride !== l.unitCostSnap;
  const margin = total && total > 0 && cost !== null ? ((total - cost) / total) * 100 : null;
  return (
    <tr className={l.include ? undefined : "off"}>
      <td className="gut">{n ?? ""}</td>
      <td>
        {l.description ?? <span className="note">No description</span>}
        {l.clientNote && <span className="note"> — {l.clientNote}</span>}
      </td>
      <td className="dim">{l.contractor}</td>
      <td className="dim">{l.area}</td>
      <td className="n">{rate(l.qty)}{l.waste ? <span className="card">+{Math.round(l.waste * 100)}% waste</span> : null}</td>
      <td className="dim">{l.uom}</td>
      <td className={`n${rateOvr ? " chgd" : ""}`}>
        {rate(priceUsed(l))}
        {rateOvr && <span className="card">card {rate(l.unitPriceSnap)}</span>}
      </td>
      <td className="n amt">{l.include ? money(total) : <span className="note">optional</span>}</td>
      <td className={`n dim${costOvr || l.manualCost ? " chgd" : ""}`}>
        {money(cost)}
        {costOvr && <span className="card">card {rate(l.unitCostSnap)}/unit, now {rate(costUsed(l))}</span>}
        {!!l.manualCost && <span className="card">manual line cost</span>}
      </td>
      <td className="n dim">{pct(margin, 0)}</td>
      <td>{flags.map((f) => <span key={f} className="fl">{f}</span>)}</td>
    </tr>
  );
}

export function OptionSheet({ option, discountRate, showHst }: { option: QuoteOption; discountRate: number; showHst: boolean }) {
  const t = optionTotals(option.lines, discountRate, showHst);
  const order = sectionOrder(option.lines);
  const nums = numbering(option.lines, order);
  const flagCount = option.lines.reduce((s, l) => s + lineFlags(l).length, 0);

  return (
    <>
      <div className="ohead">
        <div className="oname">
          {option.name}
          {option.recommended && <span className="pill ok">Recommended</span>}
          {flagCount > 0 && <span className="pill">{flagCount} flag{flagCount === 1 ? "" : "s"}</span>}
        </div>
        {option.description ? <p className="odesc">{option.description}</p> : <p className="odesc note">No description yet.</p>}
      </div>
      <Parity option={option} app={t} />

      {order.length === 0 && <p className="empty">This option has no lines yet.</p>}
      {order.map((s) => {
        const lines = option.lines.filter((l) => (l.section ?? "Unsorted") === s);
        const sum = lines.reduce((a, l) => a + (lineTotal(l) ?? 0), 0);
        return (
          <section className="sec" key={s}>
            <div className="sechd">
              <span className="secname">{s}</span>
              <span className="seccount">{lines.length} line{lines.length === 1 ? "" : "s"}</span>
              {s !== "Exclusions" && <span className="secsum">{money(sum)}</span>}
            </div>
            <div className="gwrap">
              <table className="g">
                {s !== "Exclusions" && (
                  <thead>
                    <tr>
                      <th className="gut">#</th>
                      <th>Description</th>
                      <th>Contractor</th>
                      <th>Area</th>
                      <th className="r">Qty</th>
                      <th>UoM</th>
                      <th className="r">Rate</th>
                      <th className="r">Total</th>
                      <th className="r">Cost</th>
                      <th className="r">Margin</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                )}
                <tbody>
                  {lines.map((l) => (
                    <Row key={l.id} l={l} n={nums.get(l.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <div className="tot">
        <div className="tcell"><div className="k">Pre-discount</div><div className="v">{money(t.preDiscount)}</div></div>
        <div className="tcell"><div className="k">Discount {pct(discountRate * 100, 0)}</div><div className="v">{money(t.discount)}</div></div>
        <div className="tcell"><div className="k">Subtotal</div><div className="v">{money(t.subtotal)}</div></div>
        <div className="tcell"><div className="k">Cost</div><div className="v">{money(t.cost)}</div></div>
        <div className="tcell"><div className="k">Profit</div><div className="v">{money(t.profit)}</div></div>
        <div className="tcell"><div className="k">Margin</div><div className="v">{pct(t.marginPct)}</div></div>
        <div className="tcell"><div className="k">HST{showHst ? "" : " (off)"}</div><div className="v">{money(t.hst)}</div></div>
        <div className="tcell big"><div className="k">Total</div><div className="v">{money(t.total)}</div></div>
      </div>
      <div className="tot">
        <div className="tcell"><div className="k">Payment 1 · 35%</div><div className="v">{money(t.payment1)}</div></div>
        <div className="tcell"><div className="k">Payment 2 · 35%</div><div className="v">{money(t.payment2)}</div></div>
        <div className="tcell"><div className="k">Final payment</div><div className="v">{money(t.paymentFinal)}</div></div>
      </div>
    </>
  );
}
