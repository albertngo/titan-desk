import { SECTIONS, lineFlags, optionTotals, sectionTotals, type OptionTotals } from "@/lib/calc";
import { money, pct } from "@/lib/format";
import type { Quote } from "@/lib/quotes/types";

const METRICS: { key: keyof OptionTotals; label: string; best?: "max"; internal?: true }[] = [
  { key: "subtotal", label: "Subtotal" },
  { key: "cost", label: "Cost", internal: true },
  { key: "profit", label: "Profit", best: "max", internal: true },
  { key: "marginPct", label: "Margin", best: "max", internal: true },
  { key: "total", label: "Total (client pays)" },
];

/** Compares every option on the quote. Information only: nothing here changes an option. Customer view shows prices only. */
export function Analysis({ quote, customer }: { quote: Quote; customer: boolean }) {
  const opts = quote.options.map((o) => ({
    o,
    t: optionTotals(o.lines, quote.discountRate, quote.showHst),
    s: sectionTotals(o.lines),
    flags: o.lines.reduce((n, l) => n + lineFlags(l).length, 0),
  }));
  if (opts.length < 2)
    return (
      <section className="card">
        <p className="empty">Analysis compares options. Add a second option to this quote to see it.</p>
      </section>
    );

  const sections = [...SECTIONS.filter((s) => s !== "Exclusions"), "Unsorted"].filter((s) =>
    opts.some((x) => (x.s.get(s) ?? 0) !== 0),
  );

  return (
    <div className="an">
      <section className="card">
      <div className="card-h">Options side by side</div>
      <div className="tbl-wrap">
        <table className="cmp">
          <thead>
            <tr>
              <th />
              {opts.map(({ o }) => (
                <th key={o.id}>{o.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.filter((m) => !customer || !m.internal).map((m) => {
              const vals = opts.map((x) => x.t[m.key]);
              const top = m.best ? Math.max(...vals.map((v) => v ?? -Infinity)) : null;
              return (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  {vals.map((v, i) => (
                    <td key={opts[i].o.id} className={top !== null && v === top ? "best" : undefined}>
                      {m.key === "marginPct" ? pct(v) : money(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!customer && (
              <tr>
                <td>Flags</td>
                {opts.map((x) => (
                  <td key={x.o.id}>{x.flags || ""}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </section>

      <section className="card">
      <div className="card-h">Where the options differ</div>
      <div className="tbl-wrap">
        <table className="cmp">
          <thead>
            <tr>
              <th>Work</th>
              {opts.map(({ o }) => (
                <th key={o.id}>{o.name}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const vals = opts.map((x) => x.s.get(s) ?? 0);
              const differs = vals.some((v) => Math.abs(v - vals[0]) >= 0.005);
              return (
                <tr key={s}>
                  <td>{s}</td>
                  {vals.map((v, i) => (
                    <td key={opts[i].o.id} className={differs ? "diff" : "same"}>{money(v)}</td>
                  ))}
                  <td className={differs ? "diff" : "same"}>{differs ? "differs" : "same"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </section>
    </div>
  );
}
