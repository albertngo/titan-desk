/**
 * The Performance page's graphs (Albert, 2026-11-10: "for performance; i need graphs"). Plain SVG, drawn on the server:
 * thin bars from a zero baseline, rounded at the data end, a recessive grid, a value on each bar, and a native tooltip
 * (<title>) on every mark. Single-series charts carry no legend (the title names them); the one two-series chart has a
 * legend and its bars are labelled. The tables below stay as the exact view. Colours: RiderBlue and amber, checked with
 * the dataviz validator (CVD ΔE 33.8; amber under 3:1 on white, so every bar is labelled).
 */

import type { PersonPerf } from "@/lib/followup/perf";
import type { PerfWeek } from "@/lib/quotes/performance";

const W = 520;
const BAR = 18;
const GAP = 10;
const LABEL_W = 92;

const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

/** Horizontal bars, one per person. */
export function PersonBars({ title, note, people, value, fmt, max }: { title: string; note: string; people: PersonPerf[]; value: (p: PersonPerf) => number | null; fmt: (n: number) => string; max?: number }) {
  const rows = people.map((p) => ({ name: p.person, v: value(p) }));
  const top = max ?? Math.max(1, ...rows.map((r) => r.v ?? 0));
  const plot = W - LABEL_W - 56;
  const h = rows.length * (BAR + GAP) + GAP;
  return (
    <figure className="pc">
      <figcaption>
        <strong>{title}</strong>
        <span>{note}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={`${title}: ${rows.map((r) => `${r.name} ${r.v === null ? "no data" : fmt(r.v)}`).join(", ")}`}>
        <line x1={LABEL_W} x2={LABEL_W} y1={0} y2={h} className="pc-axis" />
        {rows.map((r, i) => {
          const y = GAP + i * (BAR + GAP);
          const w = r.v === null ? 0 : Math.max(2, (r.v / top) * plot);
          return (
            <g key={r.name}>
              <title>{`${r.name}: ${r.v === null ? "no data yet" : fmt(r.v)}`}</title>
              <rect x={0} y={y - GAP / 2} width={W} height={BAR + GAP} fill="transparent" />
              <text x={LABEL_W - 8} y={y + BAR / 2} className="pc-label" textAnchor="end" dominantBaseline="middle">
                {r.name}
              </text>
              {r.v !== null && <path d={barPath(LABEL_W, y, w, BAR)} className="pc-bar s1" />}
              <text x={LABEL_W + w + 6} y={y + BAR / 2} className="pc-value" dominantBaseline="middle">
                {r.v === null ? "no data" : fmt(r.v)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** A bar rounded only at its data end (the right), square on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h / 2);
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
}

/** A column rounded only at its top. */
function colPath(x: number, base: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  const top = base - h;
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
}

const CH = 180;
const PAD = { l: 36, r: 8, t: 18, b: 28 };

/** Median reply hours by week: one series, columns. */
export function ReplyTrend({ weeks }: { weeks: PerfWeek[] }) {
  const vals = weeks.map((w) => w.medianReply ?? 0);
  const top = niceMax(Math.max(1, ...vals));
  const plotW = W - PAD.l - PAD.r;
  const plotH = CH - PAD.t - PAD.b;
  const slot = plotW / Math.max(1, weeks.length);
  const bw = Math.min(40, slot - 12);
  const y = (v: number) => (v / top) * plotH;
  return (
    <figure className="pc">
      <figcaption>
        <strong>Median reply time by week</strong>
        <span>Hours from a customer&apos;s message to our first human reply. Lower is better.</span>
      </figcaption>
      {weeks.length === 0 ? (
        <p className="pc-empty">No customer messages in the window yet.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${CH}`} role="img" aria-label={`Median reply hours by week: ${weeks.map((w) => `week of ${short(w.start)} ${w.medianReply ?? "none"}`).join(", ")}`}>
          <Grid top={top} unit="h" />
          {weeks.map((w, i) => {
            const x = PAD.l + i * slot + (slot - bw) / 2;
            const h = w.medianReply === null ? 0 : Math.max(2, y(w.medianReply));
            return (
              <g key={w.start}>
                <title>{`Week of ${short(w.start)}: ${w.medianReply === null ? "no replies yet" : `${w.medianReply} h median`} (${w.replies} messages)`}</title>
                <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={plotH} fill="transparent" />
                {w.medianReply !== null && <path d={colPath(x, PAD.t + plotH, bw, h)} className="pc-bar s1" />}
                <text x={x + bw / 2} y={PAD.t + plotH - h - 5} className="pc-value" textAnchor="middle">
                  {w.medianReply === null ? "" : `${w.medianReply}h`}
                </text>
                <text x={x + bw / 2} y={CH - 8} className="pc-label" textAnchor="middle">
                  {short(w.start)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </figure>
  );
}

/** Quotes sent and accepted by week: two series, grouped columns, legend and labels. */
export function OutcomeTrend({ weeks }: { weeks: PerfWeek[] }) {
  const top = niceMax(Math.max(1, ...weeks.flatMap((w) => [w.sent, w.accepted])));
  const plotW = W - PAD.l - PAD.r;
  const plotH = CH - PAD.t - PAD.b;
  const slot = plotW / Math.max(1, weeks.length);
  const bw = Math.min(22, (slot - 16) / 2);
  const y = (v: number) => (v / top) * plotH;
  return (
    <figure className="pc">
      <figcaption>
        <strong>Quotes sent and accepted by week</strong>
        <span>By the week each quote was first sent.</span>
      </figcaption>
      <div className="pc-legend" aria-hidden>
        <span>
          <i className="s1" /> Sent
        </span>
        <span>
          <i className="s2" /> Accepted
        </span>
      </div>
      {weeks.length === 0 ? (
        <p className="pc-empty">No quotes sent in the window yet.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${CH}`} role="img" aria-label={`Quotes by week: ${weeks.map((w) => `week of ${short(w.start)} ${w.sent} sent, ${w.accepted} accepted`).join("; ")}`}>
          <Grid top={top} unit="" />
          {weeks.map((w, i) => {
            const x0 = PAD.l + i * slot + (slot - (bw * 2 + 2)) / 2;
            const hs = w.sent ? Math.max(2, y(w.sent)) : 0;
            const ha = w.accepted ? Math.max(2, y(w.accepted)) : 0;
            return (
              <g key={w.start}>
                <title>{`Week of ${short(w.start)}: ${w.sent} sent, ${w.accepted} accepted`}</title>
                <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={plotH} fill="transparent" />
                {w.sent > 0 && <path d={colPath(x0, PAD.t + plotH, bw, hs)} className="pc-bar s1" />}
                {w.accepted > 0 && <path d={colPath(x0 + bw + 2, PAD.t + plotH, bw, ha)} className="pc-bar s2" />}
                <text x={x0 + bw / 2} y={PAD.t + plotH - hs - 5} className="pc-value" textAnchor="middle">
                  {w.sent || ""}
                </text>
                <text x={x0 + bw * 1.5 + 2} y={PAD.t + plotH - ha - 5} className="pc-value" textAnchor="middle">
                  {w.accepted || ""}
                </text>
                <text x={x0 + bw + 1} y={CH - 8} className="pc-label" textAnchor="middle">
                  {short(w.start)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </figure>
  );
}

/** Lost reasons: one series, horizontal bars, most first. */
export function LostBars({ reasons }: { reasons: Record<string, number> }) {
  const rows = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return null;
  const top = Math.max(1, ...rows.map((r) => r[1]));
  const labelW = 170;
  const plot = W - labelW - 40;
  const h = rows.length * (BAR + GAP) + GAP;
  return (
    <figure className="pc">
      <figcaption>
        <strong>Why we lost</strong>
        <span>Quotes first sent in the window and marked Lost, by GHL reason.</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={`Lost reasons: ${rows.map(([r, n]) => `${r} ${n}`).join(", ")}`}>
        <line x1={labelW} x2={labelW} y1={0} y2={h} className="pc-axis" />
        {rows.map(([r, n], i) => {
          const y = GAP + i * (BAR + GAP);
          const w = Math.max(2, (n / top) * plot);
          return (
            <g key={r}>
              <title>{`${r}: ${n}`}</title>
              <text x={labelW - 8} y={y + BAR / 2} className="pc-label" textAnchor="end" dominantBaseline="middle">
                {r.length > 26 ? `${r.slice(0, 25)}…` : r}
              </text>
              <path d={barPath(labelW, y, w, BAR)} className="pc-bar s1" />
              <text x={labelW + w + 6} y={y + BAR / 2} className="pc-value" dominantBaseline="middle">
                {n}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** A round top for the y axis: 1, 2 or 5 times a power of ten. */
function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v) as number;
}

function Grid({ top, unit }: { top: number; unit: string }) {
  const plotH = CH - PAD.t - PAD.b;
  return (
    <g>
      {[0, 0.5, 1].map((f) => {
        const y = PAD.t + plotH - f * plotH;
        return (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} className={f === 0 ? "pc-axis" : "pc-grid"} />
            <text x={PAD.l - 6} y={y} className="pc-tick" textAnchor="end" dominantBaseline="middle">
              {Math.round(top * f * 10) / 10}
              {unit}
            </text>
          </g>
        );
      })}
    </g>
  );
}
