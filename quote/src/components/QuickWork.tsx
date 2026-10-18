"use client";

import { useMemo, useState, useTransition } from "react";
import { searchProductsAction } from "@/app/new/actions";
import { optionTotals } from "@/lib/calc";
import { money } from "@/lib/format";
import { amountUnit, BUILDINGS, buildPreliminary, choiceRate, GROUP_ROWS, parseWork, QUICK_GROUPS, rowTotal, type QuickChoice, type QuickGroup, type QuickProduct } from "@/lib/quick/plan";

export type PickedProduct = Pick<QuickProduct, "recordId" | "sku" | "name" | "rate">;
export type WorkRow = { key: string; group: QuickGroup; choiceId: string; amount: string; product: PickedProduct | null };
export type WorkState = { rows: WorkRow[]; extraCost: string; description: string; building: string };

let n = 0;
const newRow = (group: QuickGroup): WorkRow => ({ key: `r${++n}`, group, choiceId: "", amount: "", product: null });

export function initialWork(choices: QuickChoice[]): WorkState {
  const groups = QUICK_GROUPS.filter((g) => choices.some((c) => c.group === g));
  return { rows: groups.map(newRow), extraCost: "", description: "", building: "" };
}

const toNumber = (s: string) => {
  const v = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** What New quote sends: which choice and how much, never a price. */
export function workInput(w: WorkState) {
  return {
    rows: w.rows.filter((r) => r.choiceId).map((r) => ({ choiceId: r.choiceId, amount: toNumber(r.amount), productId: r.product?.recordId ?? null })),
    extraCost: toNumber(w.extraCost),
    description: w.description,
    building: w.building || null,
  };
}

const UNIT_LABEL = { sqft: "sq ft", "linear ft": "lin ft", pieces: "pcs" } as const;

/** The rate column's text: "$2.50/sq ft", "$300 flat", or both when a choice has both kinds of part. */
function rateText(c: QuickChoice, unit: keyof typeof UNIT_LABEL | null, product: PickedProduct | null): string {
  const { perUnit, flat } = choiceRate(c, product ? { ...product, cost: null } : null);
  const parts: string[] = [];
  if (perUnit !== null) parts.push(`${money(perUnit)}/${unit ? UNIT_LABEL[unit] : "unit"}`);
  if (flat > 0) parts.push(`${money(flat)} flat`);
  return parts.join(" + ") || "No rate";
}

/**
 * The quick form: the preliminary, non-measured quote in a minute. Choices and prices come from
 * Airtable (Quick Quote Choices); the total here is an estimate, the server re-prices on create.
 */
export function QuickWork({ choices, value, onChange }: { choices: QuickChoice[]; value: WorkState; onChange: (w: WorkState) => void }) {
  const byId = useMemo(() => new Map(choices.map((c) => [c.id, c])), [choices]);
  const groups = QUICK_GROUPS.filter((g) => choices.some((c) => c.group === g));
  const missing = QUICK_GROUPS.filter((g) => !groups.includes(g));

  const picked = useMemo(
    () => new Map(value.rows.flatMap((r) => (r.product ? [[r.product.recordId, { ...r.product, cost: null }] as const] : []))),
    [value.rows],
  );
  const estimate = useMemo(() => {
    const { lines } = buildPreliminary(choices, parseWork(workInput(value)), picked);
    return { total: optionTotals(lines, 0, false).preDiscount, lines: lines.length };
  }, [choices, value, picked]);

  const set = (patch: Partial<WorkState>) => onChange({ ...value, ...patch });
  const setRow = (key: string, patch: Partial<WorkRow>) => set({ rows: value.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  const removeRow = (key: string) => set({ rows: value.rows.filter((r) => r.key !== key) });
  const addRow = (g: QuickGroup) => {
    const at = value.rows.map((r) => r.group).lastIndexOf(g);
    const rows = [...value.rows];
    rows.splice(at + 1, 0, newRow(g));
    set({ rows });
  };

  return (
    <div className="qw">
      {groups.map((g) => {
        const rows = value.rows.filter((r) => r.group === g);
        const options = choices.filter((c) => c.group === g);
        return (
          <fieldset key={g} className="qw-group">
            <legend>{g}</legend>
            {rows.map((r, i) => {
              const c = byId.get(r.choiceId);
              const unit = c ? amountUnit(c) : g === "Disposal" ? null : "sqft";
              const total = c ? rowTotal(choices, { choiceId: c.id, amount: toNumber(r.amount), productId: r.product?.recordId ?? null }, picked) : null;
              return (
                <div key={r.key} className="qw-row">
                  <select
                    className="in"
                    aria-label={`${g} ${i + 1}`}
                    value={r.choiceId}
                    onChange={(e) => setRow(r.key, { choiceId: e.target.value, product: null })}
                  >
                    <option value="">{g === "Disposal" ? "None" : "Choose…"}</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                  {unit && (
                    <label className="qw-amt">
                      <input
                        className="in"
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`${g} ${i + 1} amount in ${unit}`}
                        value={r.amount}
                        onChange={(e) => setRow(r.key, { amount: e.target.value })}
                      />
                      <span>{UNIT_LABEL[unit]}</span>
                    </label>
                  )}
                  <span className="qw-price" aria-label={c ? `${g} ${i + 1} rate and total` : undefined}>
                    {c && (
                      <>
                        <span className="qw-rate">{rateText(c, unit, r.product)}</span>
                        <b>{total === null ? "—" : money(total)}</b>
                      </>
                    )}
                  </span>
                  {rows.length > 1 && (
                    <button type="button" className="iconbtn danger qw-x" aria-label={`Remove ${g} ${i + 1}`} onClick={() => removeRow(r.key)}>
                      ✕
                    </button>
                  )}
                  {g === "Material" && c && <ProductPick row={r} standard={c.product} onPick={(p) => setRow(r.key, { product: p })} />}
                </div>
              );
            })}
            {rows.length < GROUP_ROWS[g] && g !== "Disposal" && (
              <button type="button" className="linkbtn qw-add" onClick={() => addRow(g)}>
                + Another {g === "Subfloor prep" ? "subfloor prep" : g.toLowerCase()}
              </button>
            )}
          </fieldset>
        );
      })}

      <fieldset className="qw-group">
        <legend>Anything else</legend>
        <div className="qw-extra">
          <label>
            Building
            <select className="in" value={value.building} onChange={(e) => set({ building: e.target.value })}>
              <option value="">—</option>
              {BUILDINGS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label>
            Additional cost ($)
            <input className="in" inputMode="decimal" placeholder="0" value={value.extraCost} onChange={(e) => set({ extraCost: e.target.value })} />
          </label>
        </div>
        <label className="qw-desc">
          Description of project <span className="faint">(internal, saved on the quote&apos;s notes)</span>
          <textarea className="in area" rows={3} value={value.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
      </fieldset>

      {missing.length > 0 && (
        <p className="note">
          Not on the form yet: {missing.join(", ")}. Set them up in Airtable, in Quick Quote Choices.
        </p>
      )}

      <div className="qw-total" aria-live="polite">
        <span>
          Preliminary estimate
          <span className="faint"> · {estimate.lines} line{estimate.lines === 1 ? "" : "s"}, before discount and HST</span>
        </span>
        <b>{money(estimate.total)}</b>
      </div>
    </div>
  );
}

/** A material row's product: the standard one, or one staff search for by SKU or name. */
function ProductPick({ row, standard, onPick }: { row: WorkRow; standard: QuickProduct | null; onPick: (p: PickedProduct | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PickedProduct[] | null>(null);
  const [searching, start] = useTransition();
  const shown = row.product ?? standard;

  function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 3) return;
    start(async () => setFound(await searchProductsAction(q.trim())));
  }

  return (
    <div className="qw-prod">
      <span className="mt">
        {row.product ? "Chosen" : "Standard"}: {shown ? `${shown.name}${shown.sku ? ` (${shown.sku})` : ""} · ${money(shown.rate)}/sq ft` : "none set"}
      </span>
      <button type="button" className="linkbtn" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Close" : "Choose a specific product"}
      </button>
      {row.product && (
        <button type="button" className="linkbtn" onClick={() => onPick(null)}>
          Back to standard
        </button>
      )}
      {open && (
        <div className="qw-search">
          <div className="qw-search-in">
            <input
              className="in"
              placeholder="SKU or product name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search(e)}
              aria-label="Search the catalogue"
            />
            <button type="button" className="btn small" onClick={() => search()} disabled={searching || q.trim().length < 3}>
              {searching ? "…" : "Search"}
            </button>
          </div>
          {found && found.length === 0 && <p className="faint">Nothing in the catalogue matches.</p>}
          {found && found.length > 0 && (
            <ul className="pick-list">
              {found.map((p) => (
                <li key={p.recordId}>
                  <button
                    type="button"
                    className="pick"
                    onClick={() => {
                      onPick(p);
                      setOpen(false);
                    }}
                  >
                    <span className="nm">{p.name}</span>
                    <span className="mt">
                      {p.sku} · {money(p.rate)}/sq ft
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
