import { changeWords, itemDifference, signedMoney, type CopyChange } from "@/lib/change/diff";
import { money, rate } from "@/lib/format";
import { discountLabel, hstRow, isLump, isSplit, scopeHeading, scopeOf, scopesOf, itemHstNote, leadPrice, longDate, prelimNote, rangeText, stageFigure, stageNote, stagesOf, type CopyItem, type CopyOption, type CopyState, type CopyText, type CustomerCopy } from "@/lib/send/copy";

/**
 * The quote as the customer sees it, drawn from the frozen customer copy only. Used by the
 * customer link (/c/<token>, on the customer deployment) and by staff's Preview, so the two
 * can never differ. It has no internal figure to hide: the copy never held one.
 */

const STATE_NOTE: Partial<Record<CopyState, (c: CustomerCopy) => string>> = {
  expired: (c) => `This quote was good until ${c.validUntil ? longDate(c.validUntil) : "its date"}. Prices may have changed since; get in touch and we'll confirm them.`,
  closed: () => "This quote is no longer open. Get in touch if you'd like us to look at it again.",
  replaced: () => "We've sent you a newer version of this quote. The one below is kept for your records.",
};


function Line({ l }: { l: CopyItem | CopyText }) {
  if (l.kind === "text") {
    return (
      <li className="cq-li text">
        <span className="d">{l.text}</span>
        {l.note && <span className="sub">{l.note}</span>}
      </li>
    );
  }
  const sub = [l.note, l.wastePct ? `includes ${l.wastePct}% waste allowance` : null, l.minimum ? "minimum charge" : null, itemHstNote(l)].filter(Boolean).join(" · ");
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
        {l.optional || l.added ? (
          <>
            <span className="tag">{l.added ? "Added" : "Optional"}</span> {money(l.amount)}
          </>
        ) : l.amount !== null ? (
          money(l.amount)
        ) : null}
      </span>
    </li>
  );
}

function Totals({ o, copy }: { o: CopyOption; copy: CustomerCopy }) {
  const t = o.totals;
  const h = hstRow(copy, t);
  const lead = leadPrice(copy, t);
  const r = o.range;
  // A preliminary's range (Albert, 2026-10-27): no exact figure anywhere, so no discount rows, no HST amount
  // and a payment schedule in shares of the final price.
  if (r) {
    return (
      <div className="cq-totals">
        <dl>
          <div className="total range"><dt>Estimated range <span className="tag">before HST</span></dt><dd>{rangeText(r.low, r.high)}</dd></div>
          <div><dt>{h.label}</dt><dd>{h.amount !== null ? "On the final price" : "Not included"}</dd></div>
          {lead.addsHst && <div className="with"><dt>With HST</dt><dd>{rangeText(r.lowWithHst, r.highWithHst)}</dd></div>}
        </dl>
        <Schedule o={o} title="Payment schedule, on the final price" />
      </div>
    );
  }
  return (
    <div className="cq-totals">
      <dl>
        {/* Lump sum: no breakdown of the price, so no discount rows either; the price is the price. */}
        {!isLump(copy) && t.discount !== 0 && (
          <>
            <div><dt>Subtotal before discount</dt><dd>{money(t.preDiscount)}</dd></div>
            <div className="disc"><dt>{discountLabel(copy)}</dt><dd>{money(t.discount)}</dd></div>
          </>
        )}
        {/* Leads before HST, like the email and the text (Albert, 2026-10-24); the tax and the total with it follow. */}
        <div className="total"><dt>{isLump(copy) ? "Price" : "Subtotal"} <span className="tag">before HST</span></dt><dd>{money(t.subtotal)}</dd></div>
        <div><dt>{h.label}</dt><dd>{h.amount !== null ? money(h.amount) : "Not included"}</dd></div>
        {lead.addsHst && <div className="with"><dt>Total with HST</dt><dd>{money(t.total)}</dd></div>}
      </dl>
      {/* New work offered (2026-10-31) has no schedule of its own: the Accept panel shows the whole project's. */}
      {!o.offer && <Schedule o={o} title={`Payment schedule${lead.addsHst ? ", with HST" : ""}`} />}
    </div>
  );
}

/** The payment schedule as it was frozen (2026-10-27): each stage, when it is due and how it is paid, and its figure. */
function Schedule({ o, title }: { o: CopyOption; title: string }) {
  return (
    <div className="cq-pay">
      <h4>{title}</h4>
      {stagesOf(o).map((s, i) => {
        const note = stageNote(s);
        return (
          <div key={i}>
            <span>
              {s.label}
              {s.amount !== null && s.kind === "share" && s.pct !== null ? ` (${s.pct}%)` : ""}
              {note && <span className="sub">{note}</span>}
            </span>
            <span>{stageFigure(s, money)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A change after acceptance (2026-10-27): what changed, the difference, and the schedule before and after. */
function ChangeBox({ c, o, lump }: { c: CopyChange; o: CopyOption; lump: boolean }) {
  const after = stagesOf(o);
  return (
    <section className="cq-card cq-change" aria-labelledby="chg-h">
      <h2 id="chg-h">What changed since {longDate(c.sinceOn)}</h2>
      {c.items.length > 0 ? (
        <ul>
          {c.items.map((it, i) => {
            const d = lump ? null : itemDifference(it);
            return (
              <li key={i} className={it.kind}>
                <span>{changeWords(it)}</span>
                {d !== null && <span className="amt">{signedMoney(d, money)}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="faint">The scope is the same; the price changed.</p>
      )}
      <dl>
        <div className="diff"><dt>Change, before HST</dt><dd>{signedMoney(c.difference, money)}</dd></div>
        <div><dt>Total was</dt><dd>{money(c.before.total)}</dd></div>
        <div className="now"><dt>Total now</dt><dd>{money(o.totals.total)}</dd></div>
      </dl>
      {c.before.stages.length > 0 && (
        <div className="cq-pay">
          <h4>Payment schedule, before and after</h4>
          {after.map((s, i) => {
            const was = c.before.stages[i]?.amount ?? null;
            const moved = was !== null && s.amount !== null && Math.abs(was - s.amount) > 0.004;
            return (
              <div key={i}>
                <span>{s.label}</span>
                <span>
                  {moved && <s className="was">{money(was)}</s>} {s.amount !== null ? money(s.amount) : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="faint">This updated quote is the record of the change we agreed. The full quote follows.</p>
    </section>
  );
}

function OptionBlock({ o, i, copy }: { o: CopyOption; i: number | null; copy: CustomerCopy }) {
  return (
    <section className="cq-card cq-opt" id={i ? `option-${i}` : undefined} aria-labelledby={`opt-h-${i ?? 0}`}>
      <header>
        <h2 id={`opt-h-${i ?? 0}`}>
          {i && <span className="cq-num">{isSplit(copy) ? `${scopeOf(o)} · ` : ""}Option {i}</span>}
          {o.name}
        </h2>
        {o.recommended && i && <span className="cq-rec">Recommended</span>}
        {o.description && <p>{o.description}</p>}
      </header>
      {o.sections.map((s) => (
        <div className="cq-sec" key={s.name}>
          <h3>
            <span>{s.name}</span>
            {s.total !== null && s.lines.some((l) => l.kind === "item" && !l.optional) && <span className="st">{money(s.total)}</span>}
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
  note: noteSlot,
  after,
}: {
  copy: CustomerCopy;
  state: CopyState;
  /** Null when the sender didn't offer the PDF (2026-10-27): no button at all. */
  pdfHref: string | null;
  newerHref: string | null;
  /** Staff preview only: a line above everything saying what this is. */
  banner?: React.ReactNode;
  /** Above the quote: what an accepted quote's customer does next (2026-10-27). Replaces the state line. */
  note?: React.ReactNode;
  /** Under the options: the Accept panel (2026-10-27). */
  after?: React.ReactNode;
}) {
  const c = copy.company;
  // A change (2026-10-31) may offer new work beside the project as agreed: the project first, the offers after it.
  const shown = copy.options.filter((o) => !o.offer);
  const offered = copy.options.filter((o) => o.offer);
  const several = shown.length > 1;
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
        {pdfHref && (
          <a className="btn cq-dl" href={pdfHref}>
            {state === "accepted" ? "Download accepted PDF" : "Download PDF"}
          </a>
        )}
      </header>

      <main className="cq-main">
        {noteSlot}
        {!noteSlot && note && (
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
          <p className="cq-kicker">{copy.change ? `Updated quote · change ${copy.change.no} ·` : copy.basis === "Preliminary" ? "Preliminary quote" : "Quote"} {copy.quoteNumber}{copy.version !== null ? ` · v${copy.version}` : ""}</p>
          <h1>{copy.customer.name ? `Prepared for ${copy.customer.name}` : "Your flooring quote"}</h1>
          {site && <p className="cq-site">{site}</p>}
          <dl className="cq-meta">
            <div><dt>Date</dt><dd>{longDate(copy.sentOn)}</dd></div>
            {copy.validUntil && <div><dt>Good until</dt><dd>{longDate(copy.validUntil)}</dd></div>}
          </dl>
          {copy.basis === "Preliminary" && (
            <p className="cq-prelim">{prelimNote(copy)}</p>
          )}
          {isLump(copy) && <p className="cq-lump">Priced as one sum for the project. The items below show what it includes.</p>}
        </section>

        {several &&
          !copy.change &&
          // With flooring and stairs options (2026-10-28), one row of cards per scope under its heading.
          (isSplit(copy) ? scopesOf(copy) : [null]).map((scope) => (
          <nav className="cq-pick" aria-label={scope ? scopeHeading(scope, 2) : "Options"} key={scope ?? "all"}>
            {scope && <h2 className="cq-scope">{scopeHeading(scope, copy.options.filter((o) => scopeOf(o) === scope).length)}</h2>}
            {copy.options.map((o, i) => (scope && scopeOf(o) !== scope ? null : (
              <a key={i} href={`#option-${i + 1}`} className={`cq-card cq-pickc${o.recommended ? " rec" : ""}`}>
                <span className="cq-num">Option {i + 1}{o.recommended && <b> · Recommended</b>}</span>
                <span className="nm">{o.name}</span>
                <span className="tot">{o.range ? rangeText(o.range.low, o.range.high) : money(leadPrice(copy, o.totals).amount)}</span>
                <span className="faint">{leadPrice(copy, o.totals).tag}</span>
              </a>
            )))}
          </nav>
          ))}

        {copy.change && copy.options[0] && <ChangeBox c={copy.change} o={copy.options[0]} lump={isLump(copy)} />}

        {shown.map((o, i) => (
          <OptionBlock key={i} o={o} i={several ? i + 1 : null} copy={copy} />
        ))}

        {offered.length > 0 && (
          <section className="cq-offers" aria-labelledby="offers-h">
            <h2 id="offers-h" className="cq-scope">New work you can add</h2>
            <p className="faint">Your project above stays as agreed. Each of these is an addition you can choose; the totals shown are for that work on its own.</p>
            {offered.map((o, i) => (
              <OptionBlock key={i} o={o} i={null} copy={copy} />
            ))}
          </section>
        )}

        {after}

        {/* The "Questions?" card with Call / Email buttons is gone (Albert, 2026-10-24): replies go to the
            message the quote came in. The website stays, as one quiet line. No HST number (Albert,
            2026-10-27: "This is just an estimate, so it's not like a formal invoice"). */}
        {c.website && <footer className="cq-legal">{c.website}</footer>}
      </main>
    </div>
  );
}
