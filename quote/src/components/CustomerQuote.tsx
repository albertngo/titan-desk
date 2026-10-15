import { money, rate } from "@/lib/format";
import { longDate, type CopyItem, type CopyOption, type CopyState, type CopyText, type CustomerCopy } from "@/lib/send/copy";

/**
 * The quote as the customer sees it, drawn from the frozen customer copy only. Used by the
 * customer link (/c/<token>, on the customer deployment) and by staff's Preview, so the two
 * can never differ. It has no internal figure to hide: the copy never held one.
 */

const STATE_NOTE: Partial<Record<CopyState, (c: CustomerCopy) => string>> = {
  expired: (c) => `This quote was good until ${longDate(c.validUntil)}. Prices may have changed since; get in touch and we'll confirm them.`,
  closed: () => "This quote is no longer open. Get in touch if you'd like us to look at it again.",
  replaced: () => "We've sent you a newer version of this quote. The one below is kept for your records.",
};

const tel = (s: string) => `tel:${s.replace(/[^\d+]/g, "")}`;

function Line({ l }: { l: CopyItem | CopyText }) {
  if (l.kind === "text") {
    return (
      <li className="cq-li text">
        <span className="d">{l.text}</span>
        {l.note && <span className="sub">{l.note}</span>}
      </li>
    );
  }
  const sub = [l.note, l.wastePct ? `includes ${l.wastePct}% waste allowance` : null, l.minimum ? "minimum charge" : null].filter(Boolean).join(" · ");
  const qty = l.qty !== null ? `${rate(l.qty)}${l.uom ? ` ${l.uom}` : ""}` : null;
  return (
    <li className={`cq-li${l.optional ? " opt" : ""}`}>
      <span className="n" aria-hidden>{l.n ?? ""}</span>
      <span className="d">
        {l.description}
        {sub && <span className="sub">{sub}</span>}
      </span>
      <span className="q">
        {qty}
        {qty && l.unitPrice !== null && <span className="x"> × {money(l.unitPrice)}</span>}
      </span>
      <span className="a">
        {l.optional ? (
          <>
            <span className="tag">Optional</span> {money(l.amount)}
          </>
        ) : (
          money(l.amount)
        )}
      </span>
    </li>
  );
}

function Totals({ o, copy }: { o: CopyOption; copy: CustomerCopy }) {
  const t = o.totals;
  return (
    <div className="cq-totals">
      <dl>
        {t.discount !== 0 && (
          <>
            <div><dt>Subtotal before discount</dt><dd>{money(t.preDiscount)}</dd></div>
            <div className="disc"><dt>Discount ({Math.round(copy.discountRate * 1000) / 10}%)</dt><dd>{money(t.discount)}</dd></div>
          </>
        )}
        <div><dt>Subtotal</dt><dd>{money(t.subtotal)}</dd></div>
        <div><dt>HST{copy.showHst ? " (13%)" : ""}</dt><dd>{copy.showHst ? money(t.hst) : "Not included"}</dd></div>
        <div className="total"><dt>Total</dt><dd>{money(t.total)}</dd></div>
      </dl>
      <div className="cq-pay">
        <h4>Payment schedule</h4>
        <div><span>Deposit (35%)</span><span>{money(t.payment1)}</span></div>
        <div><span>Second payment (35%)</span><span>{money(t.payment2)}</span></div>
        <div><span>Final payment</span><span>{money(t.paymentFinal)}</span></div>
      </div>
    </div>
  );
}

function OptionBlock({ o, i, copy }: { o: CopyOption; i: number | null; copy: CustomerCopy }) {
  return (
    <section className="cq-card cq-opt" id={i ? `option-${i}` : undefined} aria-labelledby={`opt-h-${i ?? 0}`}>
      <header>
        <h2 id={`opt-h-${i ?? 0}`}>
          {i && <span className="cq-num">Option {i}</span>}
          {o.name}
        </h2>
        {o.recommended && i && <span className="cq-rec">Recommended</span>}
        {o.description && <p>{o.description}</p>}
      </header>
      {o.sections.map((s) => (
        <div className="cq-sec" key={s.name}>
          <h3>
            <span>{s.name}</span>
            {s.lines.some((l) => l.kind === "item" && !l.optional) && <span className="st">{money(s.total)}</span>}
          </h3>
          <ul>
            {s.lines.map((l, k) => (
              <Line key={k} l={l} />
            ))}
          </ul>
        </div>
      ))}
      <Totals o={o} copy={copy} />
      {o.exclusions.length > 0 && (
        <div className="cq-excl">
          <h4>Not included</h4>
          <ul>{o.exclusions.map((e, k) => <li key={k}>{e}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

export function CustomerQuote({
  copy,
  state,
  pdfHref,
  newerHref,
  banner,
}: {
  copy: CustomerCopy;
  state: CopyState;
  pdfHref: string;
  newerHref: string | null;
  /** Staff preview only: a line above everything saying what this is. */
  banner?: React.ReactNode;
}) {
  const c = copy.company;
  const several = copy.options.length > 1;
  const note = STATE_NOTE[state]?.(copy);
  const site = [copy.customer.siteAddress, copy.customer.siteCity].filter(Boolean).join(", ");

  return (
    <div className="cq">
      {banner}
      <header className="cq-head">
        <div className="cq-co">
          <div className="cq-logo">{c.name}</div>
          {c.address && <div>{c.address}</div>}
        </div>
        <a className="btn cq-dl" href={pdfHref}>
          Download PDF
        </a>
      </header>

      <main className="cq-main">
        {note && (
          <p className={`cq-state ${state}`} role="status">
            {note}
            {newerHref && (
              <>
                {" "}
                <a href={newerHref}>See the newer quote</a>
              </>
            )}
          </p>
        )}

        <section className="cq-hero">
          <p className="cq-kicker">{copy.basis === "Preliminary" ? "Preliminary quote" : "Quote"} {copy.quoteNumber}{copy.version !== null ? ` · v${copy.version}` : ""}</p>
          <h1>{copy.customer.name ? `Prepared for ${copy.customer.name}` : "Your flooring quote"}</h1>
          {site && <p className="cq-site">{site}</p>}
          <dl className="cq-meta">
            <div><dt>Date</dt><dd>{longDate(copy.sentOn)}</dd></div>
            <div><dt>Good until</dt><dd>{longDate(copy.validUntil)}</dd></div>
          </dl>
          {copy.basis === "Preliminary" && (
            <p className="cq-prelim">This is a preliminary estimate, based on what we know so far. We confirm the final price once we have measured the space.</p>
          )}
        </section>

        {several && (
          <nav className="cq-pick" aria-label="Options">
            {copy.options.map((o, i) => (
              <a key={i} href={`#option-${i + 1}`} className={`cq-card cq-pickc${o.recommended ? " rec" : ""}`}>
                <span className="cq-num">Option {i + 1}{o.recommended && <b> · Recommended</b>}</span>
                <span className="nm">{o.name}</span>
                <span className="tot">{money(o.totals.total)}</span>
                <span className="faint">{copy.showHst ? "incl. HST" : "before HST"}</span>
              </a>
            ))}
          </nav>
        )}

        {copy.options.map((o, i) => (
          <OptionBlock key={i} o={o} i={several ? i + 1 : null} copy={copy} />
        ))}

        <footer className="cq-card cq-contact">
          <div>
            <h2>Questions?</h2>
            <p>Reply to the message this came in, or get in touch directly.</p>
          </div>
          <div className="cq-cta">
            {c.phone && <a className="btn primary" href={tel(c.phone)}>Call {c.phone}</a>}
            {c.email && <a className="btn" href={`mailto:${c.email}?subject=${encodeURIComponent(`Quote ${copy.quoteNumber}`)}`}>Email us</a>}
          </div>
          {(c.website || c.hstNumber) && (
            <p className="faint cq-legal">
              {[c.website, c.hstNumber ? `HST # ${c.hstNumber}` : null].filter(Boolean).join(" · ")}
            </p>
          )}
        </footer>
      </main>
    </div>
  );
}
