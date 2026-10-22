import Link from "next/link";
import {
  DEFAULT_PRIVATE_LABEL,
  PRIVATE_SECTION,
  privateRollup,
  SECTIONS,
  sectionOf,
  costUsed,
  isPriced,
  lineCost,
  lineFlags,
  lineTotal,
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


/**
 * Priced sections in work order; exclusions are not a table section, they go to the notes card.
 * In Customer view the Private section is left out and its total shows as one row in Other (2026-10-22).
 */
function sectionOrder(lines: QuoteLine[], customer: boolean): string[] {
  const present = new Set(lines.filter((l) => isPriced(l) || l.lineType === "Note" || l.lineType === "Section").map(sectionOf));
  present.delete("Exclusions");
  if (customer) {
    present.delete(PRIVATE_SECTION);
    if (privateRollup(lines) > 0) present.add("Other");
  }
  const known: string[] = SECTIONS.filter((s) => present.has(s));
  if (present.has("Unsorted")) known.push("Unsorted");
  return known;
}

function Parity({ option, t }: { option: QuoteOption; t: OptionTotals }) {
  const diffs = parityDiffs(t, option.airtable);
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

/** `lump`: Customer view on a lump-sum quote (2026-10-22): no unit price, no line total. */
function Row({ l, n, customer, lump }: { l: QuoteLine; n: number | undefined; customer: boolean; lump: boolean }) {
  if (!isPriced(l)) {
    return (
      <tr>
        <td className="idx" />
        <td colSpan={lump ? 2 : customer ? 4 : 7}>
          {l.description}
          {l.clientNote && <span className="sub">{l.clientNote}</span>}
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
      <td className="idx">{n ?? ""}</td>
      <td>
        {l.description ?? <span className="note">No description</span>}
        {(l.area || l.clientNote) && <span className="sub">{[l.area, l.clientNote].filter(Boolean).join(" · ")}</span>}
        {!customer && flags.length > 0 && <div>{flags.map((f) => <span key={f} className={`flag ${f}`}>{f}</span>)}</div>}
      </td>
      {!customer && <td className="muted">{l.contractor ?? "—"}</td>}
      <td className="r">
        {rate(l.qty)} <span className="faint">{l.uom ?? ""}</span>
        {l.waste ? <span className="sub">+{Math.round(l.waste * 100)}% waste</span> : null}
      </td>
      {!customer && (
        <td className="r">
          <span className={costOvr || l.manualCost ? "chgd" : "muted"}>{money(cost)}</span>
          {costOvr && <span className="sub">card {money(l.unitCostSnap)}/unit, now {money(costUsed(l))}</span>}
          {!!l.manualCost && <span className="sub">manual line cost</span>}
        </td>
      )}
      {!lump && (
        <td className="r">
          <span className={rateOvr && !customer ? "chgd" : undefined}>{money(priceUsed(l))}</span>
          {rateOvr && !customer && <span className="sub">card {money(l.unitPriceSnap)}</span>}
        </td>
      )}
      {!customer && <td className="r muted">{pct(margin, 0)}</td>}
      {lump ? (
        <td className="r amt">{l.include ? "" : <span className="note">optional · {money(total)}</span>}</td>
      ) : (
        <td className="r amt">{l.include ? money(total) : <span className="note">optional</span>}</td>
      )}
    </tr>
  );
}

export function OptionSheet({
  option,
  t,
  discountRate,
  showHst,
  quoteNotes,
  editHref,
  customer,
  lumpSum,
}: {
  option: QuoteOption;
  t: OptionTotals;
  discountRate: number;
  showHst: boolean;
  quoteNotes: string | null;
  editHref: string;
  /** Customer view: no cost, margin, contractor, card rate, flags or parity check. */
  customer: boolean;
  /** The version is a lump sum: in Customer view, no unit prices, line or section amounts (2026-10-22). */
  lumpSum?: boolean;
}) {
  const lump = customer && lumpSum === true;
  const order = sectionOrder(option.lines, customer);
  const exclusions = option.lines.filter((l) => l.section === "Exclusions" && l.description);
  const nums = new Map<string, number>();
  let i = 0;
  for (const s of order) for (const l of option.lines) if (sectionOf(l) === s && isPriced(l) && l.include) nums.set(l.id, ++i);
  // Customer view: the Private section's total as one numbered row at the end of Other.
  const hidden = customer ? privateRollup(option.lines) : 0;

  return (
    <>
      <section className="card">
        <div className="ohead">
          <div className="oname">
            {option.name}
            {option.recommended && <span className="chip good">Recommended</span>}
            {!customer && option.serviceLevel === "Premium" && <span className="chip premium">Premium</span>}
            {!customer && option.crew && <span className="chip">Crew {option.crew}</span>}
          </div>
          {option.description ? <p className="odesc">{option.description}</p> : <p className="odesc note">No description yet.</p>}
        </div>
        {!customer && <Parity option={option} t={t} />}
        {order.length === 0 ? (
          <p className="empty">This option has no lines yet.</p>
        ) : (
          <div className="tbl-wrap">
            <table className="items">
              <thead>
                <tr>
                  <th className="idx">#</th>
                  <th>Item</th>
                  {!customer && <th>Contractor</th>}
                  <th className="r">Quantity</th>
                  {!customer && <th className="r">Cost</th>}
                  {!lump && <th className="r">Unit price</th>}
                  {!customer && <th className="r">Margin</th>}
                  <th className="r">{lump ? "" : "Line total"}</th>
                </tr>
              </thead>
              <tbody>
                {order.flatMap((s) => {
                  const lines = option.lines.filter((l) => sectionOf(l) === s);
                  const rollup = s === "Other" && hidden > 0 ? hidden : 0;
                  const sum = lines.reduce((a, l) => a + (lineTotal(l) ?? 0), 0) + rollup;
                  return [
                    <tr className="sect" key={`s-${s}`}>
                      <td colSpan={lump ? 3 : customer ? 4 : 7}>
                        {s}
                        {s === PRIVATE_SECTION && <span className="sub"> · not itemised for the customer: one row, “{option.privateLabel ?? DEFAULT_PRIVATE_LABEL}”</span>}
                      </td>
                      <td className="r">{lump ? "" : money(sum)}</td>
                    </tr>,
                    ...lines.map((l) => <Row key={l.id} l={l} n={nums.get(l.id)} customer={customer} lump={lump} />),
                    ...(rollup > 0
                      ? [
                          <tr key="private-rollup">
                            <td className="idx">{i + 1}</td>
                            <td>{option.privateLabel ?? DEFAULT_PRIVATE_LABEL}</td>
                            <td className="r">—</td>
                            {!lump && <td className="r">—</td>}
                            <td className="r">{lump ? "" : <b>{money(rollup)}</b>}</td>
                          </tr>,
                        ]
                      : []),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="duo">
        <section className="card">
          <div className="card-h">Notes</div>
          <div className="card-b notes">
            <div>
              <h3>Exclusions</h3>
              {exclusions.length ? (
                <ul>{exclusions.map((l) => <li key={l.id}>{l.description}</li>)}</ul>
              ) : (
                <p className="faint">None listed.</p>
              )}
            </div>
            <div>
              <h3>Quote notes</h3>
              <p className={quoteNotes ? undefined : "faint"}>{quoteNotes ?? "None."}</p>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-h">Quote overview</div>
          <div className="ov-row bullet"><span className="k">Pre-discount</span><span className="v">{money(t.preDiscount)}</span></div>
          <div className="ov-row bullet"><span className="k">Discount ({pct(discountRate * 100, 0)})</span><span className="v">{money(t.discount)}</span></div>
          <div className="ov-row bullet"><span className="k">Subtotal</span><span className="v">{money(t.subtotal)}</span></div>
          <div className="ov-row bullet"><span className="k">HST{showHst ? " (13%)" : t.hst ? " (materials only)" : " (off)"}</span><span className="v">{money(t.hst)}</span></div>
          <div className="ov-total"><span>Total</span><span className="v">{money(t.total)}</span></div>
        </section>
      </div>

      <div className="actions">
        <Link className="btn" href={editHref}>Edit</Link>
        {!customer && <a className="btn primary" href="#send">Send to customer</a>}
      </div>
    </>
  );
}
