import { ghlContactUrl } from "@/lib/ghl/ids";
import { pct } from "@/lib/format";
import type { Quote } from "@/lib/quotes/types";

const ADDRESS_CHIP: Record<string, string> = { Confirmed: "good", Unconfirmed: "warn", "No address": "warn" };

/** The quote's customer, its links to GHL and the job files, and its terms. */
export function CustomerCard({ quote }: { quote: Quote }) {
  const l = quote.link;
  const quoteLabel = [l?.quoteNumber ?? quote.quoteId, quote.version !== null ? `v${quote.version}` : null].filter(Boolean).join(" · ") || null;
  const rows: [string, string | null][] = [
    ["Customer", quote.customerName],
    ["Site address", quote.siteAddress],
    ["City", quote.siteCity],
    ["Phone", l?.phone ?? null],
    ["Email", l?.email ?? null],
    ["Quote", quoteLabel],
    ["Project", l?.projectNumber ?? null],
    ["Timing", l?.projectTiming ?? null],
    ["Valid until", quote.validUntil],
    ["Sent", quote.sentAt],
  ];
  const links: [string, string | null][] = [
    ["GHL contact", l?.ghlContactId ? ghlContactUrl(l.ghlContactId) : null],
    ["Folder", l?.folderUrl ?? null],
    ["CompanyCam", l?.companyCamUrl ?? null],
    ["Notion project", l?.notionProjectUrl ?? null],
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
        {l && (
          <div className="chips">
            <span className="lbl">Links</span>
            {l.linkStatus && <span className={`chip ${l.linkStatus === "Linked" ? "good" : "bad"}`}>{l.linkStatus}</span>}
            {l.addressStatus && <span className={`chip ${ADDRESS_CHIP[l.addressStatus] ?? ""}`}>{l.addressStatus === "No address" ? "No address yet" : `Address ${l.addressStatus.toLowerCase()}`}</span>}
            {links.map(([k, href]) =>
              href ? (
                <a key={k} className="chip accent" href={href} target="_blank" rel="noreferrer">
                  {k} ↗
                </a>
              ) : (
                <span key={k} className="chip faint" title={`No ${k} yet`}>
                  {k}
                </span>
              ),
            )}
          </div>
        )}
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
