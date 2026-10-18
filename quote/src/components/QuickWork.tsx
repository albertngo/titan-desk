"use client";

import { useMemo, useState, useTransition } from "react";
import { searchProductsAction } from "@/app/new/actions";
import { optionTotals } from "@/lib/calc";
import { money } from "@/lib/format";
import { amountUnit, BUILDINGS, buildPreliminary, GROUP_ROWS, parseWork, QUICK_GROUPS, type QuickChoice, type QuickGroup, type QuickProduct } from "@/lib/quick/plan";
import { METHOD_PHRASE, modifierFor, profileName, STAIR_METHODS, STAIR_ROWS, STAIR_TYPES, type StairMethod, type StairType } from "@/lib/quick/stairs";

export type PickedProduct = Pick<QuickProduct, "recordId" | "sku" | "name" | "rate">;
export type WorkRow = { key: string; group: QuickGroup; choiceId: string; amount: string; product: PickedProduct | null };
/** One staircase on the form: a profile being picked, and the flat price typed for it. */
export type StairRowState = { key: string; type: StairType | ""; method: StairMethod | ""; price: string };
export type WorkState = { rows: WorkRow[]; stairs: StairRowState[]; extraCost: string; description: string; building: string };

let n = 0;
const newRow = (group: QuickGroup): WorkRow => ({ key: `r${++n}`, group, choiceId: "", amount: "", product: null });
const newStair = (): StairRowState => ({ key: `s${++n}`, type: "", method: "", price: "" });

export function initialWork(choices: QuickChoice[]): WorkState {
  const groups = QUICK_GROUPS.filter((g) => choices.some((c) => c.group === g));
  return { rows: groups.map(newRow), stairs: [], extraCost: "", description: "", building: "" };
}

const toNumber = (s: string) => {
  const v = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** What New quote sends: which choice and how much, which staircase and its price, never a card price. */
export function workInput(w: WorkState) {
  return {
    rows: w.rows.filter((r) => r.choiceId).map((r) => ({ choiceId: r.choiceId, amount: toNumber(r.amount), productId: r.product?.recordId ?? null })),
    stairs: w.stairs.filter((s) => s.type && s.method).map((s) => ({ type: s.type, method: s.method, price: toNumber(s.price) })),
    extraCost: toNumber(w.extraCost),
    description: w.description,
    building: w.building || null,
  };
}

/** The running estimate, the same way the server will price it (before discount and HST). */
export function estimateWork(choices: QuickChoice[], value: WorkState): { total: number; lines: number } {
  const picked = new Map(value.rows.flatMap((r) => (r.product ? [[r.product.recordId, { ...r.product, cost: null }] as const] : [])));
  const { lines } = buildPreliminary(choices, parseWork(workInput(value)), picked);
  return { total: optionTotals(lines, 0, false).preDiscount, lines: lines.length };
}

const UNIT_LABEL = { sqft: "sq ft", "linear ft": "lin ft", pieces: "pcs" } as const;
/** Up to this many choices a group shows them as chips, one tap each; more and it is a list. */
const CHIP_LIMIT = 6;
/** Groups open on first view; the rest start folded with their summary line. */
const OPEN_FIRST: readonly QuickGroup[] = ["Install", "Material"];

const clean = (s: string) => s.replace(/[$,\s]/g, "");

/**
 * The quick form: the preliminary, non-measured quote in a minute, laid out for a phone (Albert,
 * 2026-10-18): Flooring, then Stairs, then anything else; each work group folds to one line that
 * says what is in it; short lists are chips; square footage can be copied from Install. Choices
 * and prices come from Airtable (Quick Quote Choices); the server re-prices on create. Stairs are
 * profiles priced flat, by hand (src/lib/quick/stairs.ts).
 */
export function QuickWork({ choices, value, onChange }: { choices: QuickChoice[]; value: WorkState; onChange: (w: WorkState) => void }) {
  const byId = useMemo(() => new Map(choices.map((c) => [c.id, c])), [choices]);
  const groups = QUICK_GROUPS.filter((g) => choices.some((c) => c.group === g));
  const missing = QUICK_GROUPS.filter((g) => !groups.includes(g));

  const set = (patch: Partial<WorkState>) => onChange({ ...value, ...patch });
  const setRow = (key: string, patch: Partial<WorkRow>) => set({ rows: value.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  const removeRow = (key: string) => set({ rows: value.rows.filter((r) => r.key !== key) });
  const addRow = (g: QuickGroup) => {
    const at = value.rows.map((r) => r.group).lastIndexOf(g);
    const rows = [...value.rows];
    rows.splice(at + 1, 0, newRow(g));
    set({ rows });
  };
  const setStair = (key: string, patch: Partial<StairRowState>) => set({ stairs: value.stairs.map((s) => (s.key === key ? { ...s, ...patch } : s)) });

  // The first Install row with a square footage: Remove and Material rows can take it in one tap.
  const installSqft = value.rows.find((r) => r.group === "Install" && r.choiceId && toNumber(r.amount) !== null)?.amount ?? null;

  const rowWords = (r: WorkRow) => {
    const c = byId.get(r.choiceId);
    if (!c) return null;
    const unit = amountUnit(c);
    const amt = toNumber(r.amount);
    return `${c.label}${unit && amt !== null ? ` · ${amt} ${UNIT_LABEL[unit]}` : ""}`;
  };
  const groupSummary = (g: QuickGroup) => value.rows.filter((r) => r.group === g).map(rowWords).filter(Boolean).join(" · ");

  const stairWords = (s: StairRowState) => (s.type && s.method ? `${profileName({ type: s.type, method: s.method })}${toNumber(s.price) !== null ? ` · ${money(toNumber(s.price)!)}` : ""}` : null);
  const stairSummary = value.stairs.map(stairWords).filter(Boolean).join(" · ");

  return (
    <div className="qw">
      <section className="qw-part" aria-labelledby="qw-flooring">
        <h3 className="qw-part-h" id="qw-flooring">Flooring</h3>
        {groups.map((g) => {
          const rows = value.rows.filter((r) => r.group === g);
          const options = choices.filter((c) => c.group === g);
          const summary = groupSummary(g);
          return (
            <details key={g} className="qw-wg" open={OPEN_FIRST.includes(g)}>
              <summary>
                <span className="nm">{g}</span>
                <span className={`qw-wg-sum${summary ? "" : " faint"}`}>{summary || "Nothing yet"}</span>
              </summary>
              <div className="qw-wg-b">
                {rows.map((r, i) => {
                  const c = byId.get(r.choiceId);
                  const unit = c ? amountUnit(c) : g === "Disposal" ? null : "sqft";
                  const copyable = unit === "sqft" && (g === "Remove" || g === "Material") && installSqft !== null && clean(r.amount) !== clean(installSqft);
                  return (
                    <div key={r.key} className="qw-row">
                      <ChoiceField label={`${g} ${i + 1}`} none={g === "Disposal" ? "None" : null} options={options} value={r.choiceId} onChange={(id) => setRow(r.key, { choiceId: id, product: null })} />
                      {unit && (
                        <div className="qw-amt-row">
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
                          {copyable && (
                            <button type="button" className="linkbtn qw-same" onClick={() => setRow(r.key, { amount: installSqft! })}>
                              Same as install ({installSqft})
                            </button>
                          )}
                          {rows.length > 1 && (
                            <button type="button" className="iconbtn danger qw-x" aria-label={`Remove ${g} ${i + 1}`} onClick={() => removeRow(r.key)}>
                              ✕
                            </button>
                          )}
                        </div>
                      )}
                      {!unit && rows.length > 1 && (
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
              </div>
            </details>
          );
        })}
        {missing.length > 0 && (
          <p className="note">
            Not on the form yet: {missing.join(", ")}. Set them up in Airtable, in Quick Quote Choices.
          </p>
        )}
      </section>

      <section className="qw-part" aria-labelledby="qw-stairs">
        <h3 className="qw-part-h" id="qw-stairs">
          Stairs
          <span className={`qw-wg-sum${stairSummary ? "" : " faint"}`}>{stairSummary || "No staircase"}</span>
        </h3>
        {value.stairs.map((s, i) => {
          const profile = s.type && s.method ? { type: s.type, method: s.method } : null;
          return (
            <div key={s.key} className="qw-stair">
              <div className="qw-stair-h">
                <span className="nm">Staircase {i + 1}</span>
                <button type="button" className="iconbtn danger qw-x" aria-label={`Remove staircase ${i + 1}`} onClick={() => set({ stairs: value.stairs.filter((x) => x.key !== s.key) })}>
                  ✕
                </button>
              </div>
              <Chips label={`Staircase ${i + 1} type`} options={STAIR_TYPES} value={s.type} onChange={(v) => setStair(s.key, { type: v as StairType })} />
              <Chips label={`Staircase ${i + 1} method`} options={STAIR_METHODS} value={s.method} onChange={(v) => setStair(s.key, { method: v as StairMethod })} />
              <label className="qw-price">
                <span className="k">Price for this staircase</span>
                <span className="qw-amt">
                  <input className="in" inputMode="decimal" placeholder="0" aria-label={`Staircase ${i + 1} price`} value={s.price} onChange={(e) => setStair(s.key, { price: e.target.value })} />
                  <span>$</span>
                </span>
              </label>
              {profile && (
                <p className="qw-say">
                  <b>{profileName(profile)}</b> {METHOD_PHRASE[profile.method]} {modifierFor(profile.type)}
                </p>
              )}
            </div>
          );
        })}
        {value.stairs.length < STAIR_ROWS && (
          <button type="button" className="linkbtn qw-add" onClick={() => set({ stairs: [...value.stairs, newStair()] })}>
            + {value.stairs.length === 0 ? "Add a staircase" : "Another staircase"}
          </button>
        )}
      </section>

      <section className="qw-part" aria-labelledby="qw-else">
        <h3 className="qw-part-h" id="qw-else">Anything else</h3>
        <div className="qw-field">
          <span className="k">Building</span>
          <Chips label="Building" options={BUILDINGS} value={value.building} onChange={(v) => set({ building: v })} allowNone />
        </div>
        <label className="qw-price">
          <span className="k">Additional cost</span>
          <span className="qw-amt">
            <input className="in" inputMode="decimal" placeholder="0" value={value.extraCost} onChange={(e) => set({ extraCost: e.target.value })} />
            <span>$</span>
          </span>
        </label>
        <label className="qw-desc">
          Description of project <span className="faint">(internal, saved on the quote&apos;s notes)</span>
          <textarea className="in area" rows={3} value={value.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
      </section>
    </div>
  );
}

/** A short list as one-tap chips; a long one as a list. */
function ChoiceField({ label, none, options, value, onChange }: { label: string; none: string | null; options: QuickChoice[]; value: string; onChange: (id: string) => void }) {
  if (options.length <= CHIP_LIMIT) {
    return (
      <div className="qw-chips" role="radiogroup" aria-label={label}>
        {none && (
          <button type="button" className={`qw-chip${value === "" ? " on" : ""}`} role="radio" aria-checked={value === ""} onClick={() => onChange("")}>
            {none}
          </button>
        )}
        {options.map((o) => (
          <button type="button" key={o.id} className={`qw-chip${value === o.id ? " on" : ""}`} role="radio" aria-checked={value === o.id} onClick={() => onChange(value === o.id && !none ? "" : o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <select className="in" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{none ?? "Choose…"}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  );
}

/** Fixed words as chips (stair types and methods, building). Tapping the chosen one again clears it when allowed. */
function Chips({ label, options, value, onChange, allowNone = false }: { label: string; options: readonly string[]; value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  return (
    <div className="qw-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o} className={`qw-chip${value === o ? " on" : ""}`} role="radio" aria-checked={value === o} onClick={() => onChange(value === o && allowNone ? "" : o)}>
          {o}
        </button>
      ))}
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
