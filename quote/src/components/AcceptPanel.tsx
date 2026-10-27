"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { acceptAction } from "@/app/c/[token]/actions";
import { acceptedTotals, restageAmounts } from "@/lib/calc";
import { money } from "@/lib/format";
import { payWords, type PaymentSchedule } from "@/lib/pricing/schedule";

/**
 * The Accept panel on a customer's quote (Albert, 2026-10-27). The customer picks the option, ticks
 * any add-ons (the total and the deposit follow as they tick), ticks that they have read the Project
 * Expectations and types their name; on the store tablet they also sign. The figures here are for
 * the customer to see: the staff app works them out again from the frozen copy and never takes them
 * from the browser.
 */

export type AcceptOption = {
  index: number;
  name: string;
  subtotal: number;
  hst: number;
  addOns: { key: string; description: string; amount: number; taxed: boolean }[];
  /** The frozen stages' amounts, so a material deposit keeps its dollars when add-ons are ticked. */
  frozen: { amount: number | null }[];
};

export function AcceptPanel({
  token,
  store,
  options,
  schedule,
  terms,
  defaultIndex,
}: {
  token: string;
  /** Opened from the staff app's "Accept with customer": a drawn signature is taken too. */
  store: boolean;
  options: AcceptOption[];
  schedule: PaymentSchedule;
  /** The Project Expectations shown: its Terms Versions row goes back with the Accept, so a newer one since is caught. */
  terms: { id: string; label: string; href: string };
  defaultIndex: number;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(defaultIndex);
  const [ticked, setTicked] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const o = options.find((x) => x.index === index) ?? options[0];

  const totals = useMemo(() => acceptedTotals(o, o.addOns.filter((a) => ticked.includes(a.key))), [o, ticked]);
  const stages = useMemo(() => restageAmounts(schedule, o.frozen, totals.total), [schedule, o, totals.total]);
  const ready = agreed && name.trim().length >= 2 && (!store || signature);

  const accept = () => {
    setError(null);
    start(async () => {
      const r = await acceptAction(token, { optionIndex: o.index, addOns: ticked, name: name.trim(), terms: agreed, termsId: terms.id, signature }, store);
      if (r.ok) router.refresh();
      else setError(r.message);
    });
  };

  return (
    <section className="cq-card cq-accept" aria-labelledby="acc-h">
      <h2 id="acc-h">Accept this quote</h2>
      {options.length > 1 && (
        <fieldset className="acc-opts">
          <legend>Which option?</legend>
          {options.map((x) => (
            <label key={x.index} className={x.index === o.index ? "on" : undefined}>
              <input
                type="radio"
                name="acc-option"
                checked={x.index === o.index}
                onChange={() => {
                  setIndex(x.index);
                  setTicked([]);
                }}
              />
              <span className="nm">
                Option {x.index + 1}: {x.name}
              </span>
              <span className="amt">{money(x.subtotal)} before HST</span>
            </label>
          ))}
        </fieldset>
      )}
      {o.addOns.length > 0 && (
        <fieldset className="acc-adds">
          <legend>Add anything?</legend>
          {o.addOns.map((a) => (
            <label key={a.key}>
              <input type="checkbox" checked={ticked.includes(a.key)} onChange={(e) => setTicked(e.target.checked ? [...ticked, a.key] : ticked.filter((k) => k !== a.key))} />
              <span className="nm">{a.description}</span>
              <span className="amt">+ {money(a.amount)}</span>
            </label>
          ))}
        </fieldset>
      )}
      <dl className="acc-sum">
        <div>
          <dt>Price before HST</dt>
          <dd>{money(totals.subtotal)}</dd>
        </div>
        <div>
          <dt>HST</dt>
          <dd>{totals.hst ? money(totals.hst) : "Not included"}</dd>
        </div>
        <div className="tot">
          <dt>Total</dt>
          <dd>{money(totals.total)}</dd>
        </div>
        {stages.map((s, i) => (
          <div key={i} className={i === 0 ? "dep" : "stage"}>
            <dt>
              {s.label}
              <span className="sub">{[s.when, payWords(s.pay)].filter(Boolean).join(", ")}</span>
            </dt>
            <dd>{money(s.amount)}</dd>
          </div>
        ))}
      </dl>
      <p className="acc-note">Nothing is final until the deposit is in. We send you the details the moment you accept.</p>
      <label className="acc-terms">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          I&apos;ve read and agree to the{" "}
          <a href={terms.href} target="_blank" rel="noreferrer">
            Project Expectations ({terms.label})
          </a>
          .
        </span>
      </label>
      <label className="acc-name">
        Your full name
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
      </label>
      {store && <SignaturePad onChange={setSignature} />}
      {error && (
        <p className="acc-err" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn primary acc-go" disabled={!ready || busy} onClick={accept}>
        {busy ? "Accepting…" : `Accept ${options.length > 1 ? `option ${o.index + 1}` : "this quote"}`}
      </button>
    </section>
  );
}

/**
 * A finger or pen signature (2026-10-27: drawn on the store tablet). Kept as an SVG path of whole
 * numbers in a 1000 × 300 box, the shape src/lib/accept/plan.ts reads back and the PDF draws.
 */
function SignaturePad({ onChange }: { onChange: (path: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const path = useRef<string[]>([]);
  const drawing = useRef(false);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 300)].map((v, i) => Math.max(0, Math.min(i ? 300 : 1000, v))) as [number, number];
  };
  const line = (x: number, y: number, move: boolean) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1f2a37";
    if (move) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  return (
    <div className="acc-sign">
      <span>Sign here</span>
      <canvas
        ref={canvas}
        width={1000}
        height={300}
        aria-label="Signature"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const [x, y] = point(e);
          path.current.push(`M${x} ${y}`);
          line(x, y, true);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const [x, y] = point(e);
          // Keep the path short: a point only once the pen has moved a little.
          const last = path.current.at(-1)?.slice(1).split(" ").map(Number) ?? [x, y];
          if (Math.abs(x - last[0]) + Math.abs(y - last[1]) < 4) return;
          path.current.push(`L${x} ${y}`);
          line(x, y, false);
        }}
        onPointerUp={() => {
          drawing.current = false;
          onChange(path.current.length > 2 ? path.current.join(" ") : null);
        }}
      />
      <button
        type="button"
        className="linkbtn"
        onClick={() => {
          path.current = [];
          const c = canvas.current;
          c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
          onChange(null);
        }}
      >
        Clear
      </button>
    </div>
  );
}
