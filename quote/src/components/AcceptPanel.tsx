"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { acceptAction } from "@/app/c/[token]/actions";
import { acceptedTotals, restageAmounts } from "@/lib/calc";
import { money } from "@/lib/format";
import { payWords, type PaymentSchedule } from "@/lib/pricing/schedule";
import type { Scope } from "@/lib/quotes/types";

/**
 * The Accept panel on a customer's quote (Albert, 2026-10-27). The customer picks the option, ticks
 * any add-ons (the total and the deposit follow as they tick), ticks that they have read the Project
 * Expectations and types their name; on the store tablet they also sign. With flooring and stairs
 * options on one quote (2026-10-28) they pick one of each, or just one of them, and the two make one
 * total and one deposit. The figures here are for
 * the customer to see: the staff app works them out again from the frozen copy and never takes them
 * from the browser.
 */

export type AcceptOption = {
  index: number;
  name: string;
  subtotal: number;
  hst: number;
  scope: Scope;
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
  defaultPicks,
}: {
  token: string;
  /** Opened from the staff app's "Accept with customer": a drawn signature is taken too. */
  store: boolean;
  options: AcceptOption[];
  schedule: PaymentSchedule;
  /** The Project Expectations shown: its Terms Versions row goes back with the Accept, so a newer one since is caught. */
  terms: { id: string; label: string; href: string };
  /** What starts chosen: an option index per scope. */
  defaultPicks: number[];
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<number[]>(defaultPicks);
  const [ticked, setTicked] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const scopes = (["Flooring", "Stairs"] as Scope[]).filter((sc) => options.some((x) => x.scope === sc));
  const split = scopes.length > 1;
  const chosen = useMemo(() => options.filter((x) => picks.includes(x.index)), [options, picks]);
  const addOns = chosen.flatMap((x) => x.addOns);

  const totals = useMemo(() => {
    const sent = { subtotal: chosen.reduce((a, x) => a + x.subtotal, 0), hst: chosen.reduce((a, x) => a + x.hst, 0) };
    return acceptedTotals(sent, addOns.filter((a) => ticked.includes(a.key)));
  }, [chosen, addOns, ticked]);
  const frozen = useMemo(() => (chosen[0]?.frozen ?? []).map((st, i) => ({ amount: st.amount === null ? null : chosen.reduce((a, x) => a + (x.frozen[i]?.amount ?? 0), 0) })), [chosen]);
  const stages = useMemo(() => restageAmounts(schedule, frozen, totals.total), [schedule, frozen, totals.total]);
  const ready = chosen.length > 0 && agreed && name.trim().length >= 2 && (!store || signature);
  /** Choose `index` for its scope (null = none of that scope), dropping the add-ons of what it replaces. */
  const choose = (scope: Scope, index: number | null) => {
    const others = options.filter((x) => x.scope !== scope && picks.includes(x.index)).map((x) => x.index);
    const next = index === null ? others : [...others, index];
    setPicks(next);
    setTicked(ticked.filter((k) => next.some((i) => k.startsWith(`${i}.`))));
  };

  const accept = () => {
    setError(null);
    start(async () => {
      const r = await acceptAction(token, { optionIndexes: picks, addOns: ticked, name: name.trim(), terms: agreed, termsId: terms.id, signature }, store);
      if (r.ok) router.refresh();
      else setError(r.message);
    });
  };

  return (
    <section className="cq-card cq-accept" aria-labelledby="acc-h">
      <h2 id="acc-h">Accept this quote</h2>
      {scopes.map((scope) => {
        const mine = options.filter((x) => x.scope === scope);
        if (!split && mine.length < 2) return null;
        const current = mine.find((x) => picks.includes(x.index))?.index ?? null;
        return (
          <fieldset className="acc-opts" key={scope}>
            <legend>{split ? `Which ${scope.toLowerCase()} option?` : "Which option?"}</legend>
            {mine.map((x) => (
              <label key={x.index} className={x.index === current ? "on" : undefined}>
                <input type="radio" name={`acc-option-${scope}`} checked={x.index === current} onChange={() => choose(scope, x.index)} />
                <span className="nm">
                  Option {x.index + 1}: {x.name}
                </span>
                <span className="amt">{money(x.subtotal)} before HST</span>
              </label>
            ))}
            {split && (
              <label className={current === null ? "on" : undefined}>
                <input type="radio" name={`acc-option-${scope}`} checked={current === null} onChange={() => choose(scope, null)} />
                <span className="nm">No {scope.toLowerCase()} for now</span>
              </label>
            )}
          </fieldset>
        );
      })}
      {addOns.length > 0 && (
        <fieldset className="acc-adds">
          <legend>Add anything?</legend>
          {addOns.map((a) => (
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
        {busy ? "Accepting…" : chosen.length === 0 ? "Choose an option" : options.length > 1 ? `Accept ${chosen.length > 1 ? "options" : "option"} ${chosen.map((x) => x.index + 1).join(" and ")}` : "Accept this quote"}
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
