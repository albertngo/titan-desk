import { SECTIONS, lineFlags, optionTotals, sectionTotals, type OptionTotals } from "@/lib/calc";
import { money, pct } from "@/lib/format";
import type { Quote } from "@/lib/quotes/types";

const METRICS: { key: keyof OptionTotals; label: string; best?: "max" }[] = [
  { key: "subtotal", label: "Subtotal" },
  { key: "cost", label: "Cost" },
  { key: "profit", label: "Profit", best: "max" },
  { key: "marginPct", label: "Margin", best: "max" },
  { key: "total", label: "Total (client pays)" },
];

/** Compares every option on the quote. Information only: nothing here changes an option. */
export function Analysis({ quote }: { quote: Quote }) {
  const opts = quote.options.map((o) => ({
    o,
    t: optionTotals(o.lines, quote.discountRate, quote.showHst),
    s: sectionTotals(o.lines),
    flags: o.lines.reduce((n, l) => n + lineFlags(l).length, 0),
  }));
  if (opts.length < 2)
    return <p className="empty">Analysis compares options. Add a second option to this quote to see it.</p>;

  const sections = [...SECTIONS.filter((s) => s !== "Exclusions"), "Unsorted"].filter((s) =>
    opts.some((x) => (x.s.get(s) ?? 0) !== 0),
  );

  return (
    <div className="an">
      <h3>Options side by side</h3>
      <div className="anwrap">
        <table>
          <thead>
            <tr>
              <th />
              {opts.map(({ o }) => (
                <th key={o.id} className="r">{o.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const vals = opts.map((x) => x.t[m.key]);
              const top = m.best ? Math.max(...vals.map((v) => v ?? -Infinity)) : null;
              return (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  {vals.map((v, i) => (
                    <td key={opts[i].o.id} className={`r${top !== null && v === top ? " best" : ""}`}>
                      {m.key === "marginPct" ? pct(v) : money(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <td>Flags</td>
              {opts.map((x) => (
                <td key={x.o.id} className="r">{x.flags || ""}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Where the options differ</h3>
      <div className="anwrap">
        <table>
          <thead>
            <tr>
              <th>Work</th>
              {opts.map(({ o }) => (
                <th key={o.id} className="r">{o.name}</th>
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
                    <td key={opts[i].o.id} className={`r ${differs ? "diff" : "same"}`}>{money(v)}</td>
                  ))}
                  <td className={differs ? "diff" : "same"}>{differs ? "differs" : "same"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
