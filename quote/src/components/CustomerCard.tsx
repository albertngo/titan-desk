import { pct } from "@/lib/format";
import type { Quote } from "@/lib/quotes/types";

/** The quote's customer and terms, laid out as label / value pairs. */
export function CustomerCard({ quote }: { quote: Quote }) {
  const rows: [string, string | null][] = [
    ["Customer", quote.customerName],
    ["Site address", quote.siteAddress],
    ["City", quote.siteCity],
    ["Quote", [quote.quoteId, quote.version !== null ? `v${quote.version}` : null].filter(Boolean).join(" · ") || null],
    ["Valid until", quote.validUntil],
    ["Sent", quote.sentAt],
  ];
  return (
    <section className="card">
      <div className="card-h">Customer information</div>
      <div className="card-b">
        <div className="fields">
          {rows.map(([k, v]) => (
            <div className="field" key={k}>
              <span className="k">{k}</span>
              <span className="v">{v ?? <span className="faint">—</span>}</span>
            </div>
          ))}
        </div>
        <div className="chips">
          <span className="lbl">Terms</span>
          {quote.basis && <span className={`chip ${quote.basis === "Measured" ? "good" : "warn"}`}>{quote.basis}</span>}
          <span className="chip accent">Discount {pct(quote.discountRate * 100, 0)}</span>
          <span className="chip">HST {quote.showHst ? "on" : "off"}</span>
          <span className="chip">{quote.options.length} option{quote.options.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </section>
  );
}
