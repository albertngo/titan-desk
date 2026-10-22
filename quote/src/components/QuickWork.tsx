"use client";

import { useMemo, useState, useTransition } from "react";
import { searchProductsAction } from "@/app/new/actions";
import { optionTotals } from "@/lib/calc";
import { money } from "@/lib/format";
import { amountUnit, baseboardDefault, baseboardFollow, BUILDINGS, buildPreliminary, choiceRate, GROUP_ROWS, MANUAL_ROWS, MANUAL_UOMS, manualTotal, parseWork, QUICK_GROUPS, rowTotal, stairTotal, type ManualUom, type QuickChoice, type QuickGroup, type QuickProduct, type QuickProfile } from "@/lib/quick/plan";
import { METHOD_PHRASE, modifierFor, STAIR_ROWS } from "@/lib/quick/stairs";

export type PickedProduct = Pick<QuickProduct, "recordId" | "sku" | "name" | "rate">;
export type WorkRow = { key: string; group: QuickGroup; choiceId: string; amount: string; product: PickedProduct | null };
/** One staircase on the form: the Stair Profiles row picked, and a different price only if typed. */
export type StairRowState = { key: string; profileId: string; price: string };
/** One item typed by hand (2026-10-22): words, amount, what it is priced per, price and cost per unit, as typed. */
export type ManualRowState = { key: string; description: string; qty: string; uom: ManualUom; rate: string; cost: string };
export type WorkState = { rows: WorkRow[]; stairs: StairRowState[]; manual: ManualRowState[]; extraCost: string; description: string; building: string };

let n = 0;
const newRow = (group: QuickGroup): WorkRow => ({ key: `r${++n}`, group, choiceId: "", amount: "", product: null });
const newStair = (): StairRowState => ({ key: `s${++n}`, profileId: "", price: "" });
const newManual = (): ManualRowState => ({ key: `m${++n}`, description: "", qty: "", uom: "sqft", rate: "", cost: "" });

export function initialWork(choices: QuickChoice[]): WorkState {
  const groups = QUICK_GROUPS.filter((g) => choices.some((c) => c.group === g));
  return { rows: groups.map(newRow), stairs: [], manual: [], extraCost: "", description: "", building: "" };
}

const toNumber = (s: string) => {
  const v = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** What New quote sends: which choice and how much, which staircase and its price, never a card price. */
export function workInput(w: WorkState) {
  return {
    rows: w.rows.filter((r) => r.choiceId).map((r) => ({ choiceId: r.choiceId, amount: toNumber(r.amount), productId: r.product?.recordId ?? null })),
    stairs: w.stairs.filter((s) => s.profileId).map((s) => ({ profileId: s.profileId, price: toNumber(s.price) })),
    manual: w.manual.filter((m) => m.description.trim()).map((m) => ({ description: m.description.trim(), qty: toNumber(m.qty), uom: m.uom, rate: toNumber(m.rate), cost: toNumber(m.cost) })),
    extraCost: toNumber(w.extraCost),
    description: w.description,
    building: w.building || null,
  };
}

/** The products staff picked on material rows, by record id, as the pricing needs them (no cost in the browser). */
const pickedProducts = (value: WorkState) => new Map(value.rows.flatMap((r) => (r.product ? [[r.product.recordId, { ...r.product, cost: null }] as const] : [])));

/** The running estimate, the same way the server will price it (before discount and HST). */
export function estimateWork(choices: QuickChoice[], profiles: QuickProfile[], value: WorkState): { total: number; lines: number } {
  const { lines } = buildPreliminary(choices, parseWork(workInput(value)), pickedProducts(value), new Map(profiles.map((p) => [p.id, p])));
  return { total: optionTotals(lines, 0, false).preDiscount, lines: lines.length };
}

const UNIT_LABEL = { sqft: "sq ft", "linear ft": "lin ft", pieces: "pcs" } as const;

/** The rate column's text (Albert, 2026-10-18): "$2.50/sq ft", "$300 flat", or both when a choice has both kinds of part. */
function rateText(c: QuickChoice, unit: keyof typeof UNIT_LABEL | null, product: PickedProduct | null): string {
  const { perUnit, flat } = choiceRate(c, product ? { ...product, cost: null } : null);
  const parts: string[] = [];
  if (perUnit !== null) parts.push(`${money(perUnit)}/${unit ? UNIT_LABEL[unit] : "unit"}`);
  if (flat > 0) parts.push(`${money(flat)} flat`);
  return parts.join(" + ") || "No rate";
}
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
 * Stair Profiles rows at a preset price, a typed price only as an override (src/lib/quick/stairs.ts).
 */
export function QuickWork({ choices, profiles, value, onChange }: { choices: QuickChoice[]; profiles: QuickProfile[]; value: WorkState; onChange: (w: WorkState) => void }) {
  const byId = useMemo(() => new Map(choices.map((c) => [c.id, c])), [choices]);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const picked = useMemo(() => pickedProducts(value), [value]);
  const groups = QUICK_GROUPS.filter((g) => choices.some((c) => c.group === g));
  const missing = QUICK_GROUPS.filter((g) => !groups.includes(g));

  const set = (patch: Partial<WorkState>) => onChange({ ...value, ...patch });

  // The first Install row with a square footage, as a number: baseboards follow it, Remove and Material can copy it.
  const installOf = (rows: WorkRow[]) => {
    const r = rows.find((x) => x.group === "Install" && x.choiceId && toNumber(x.amount) !== null);
    return r ? toNumber(r.amount) : null;
  };
  const isLinearBaseboard = (r: WorkRow) => {
    const c = byId.get(r.choiceId);
    return r.group === "Baseboards" && !!c && amountUnit(c) === "linear ft";
  };
  /** Every change to the rows goes through here, so a baseboard amount that was never typed follows the install figure. */
  const setRows = (next: WorkRow[]) => {
    const from = installOf(value.rows);
    const to = installOf(next);
    const rows =
      from === to
        ? next
        : next.map((r) => {
            const a = isLinearBaseboard(r) ? baseboardFollow(r.amount, from, to) : null;
            return a === null ? r : { ...r, amount: a };
          });
    set({ rows });
  };
  const setRow = (key: string, patch: Partial<WorkRow>) => {
    let rows = value.rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
    // A baseboard choice picked on a blank row takes the default straight away.
    if (patch.choiceId !== undefined) {
      const dflt = baseboardDefault(installOf(rows));
      rows = rows.map((r) => (r.key === key && isLinearBaseboard(r) && r.amount.trim() === "" && dflt !== null ? { ...r, amount: String(dflt) } : r));
    }
    setRows(rows);
  };
  const removeRow = (key: string) => setRows(value.rows.filter((r) => r.key !== key));
  const addRow = (g: QuickGroup) => {
    const at = value.rows.map((r) => r.group).lastIndexOf(g);
    const rows = [...value.rows];
    rows.splice(at + 1, 0, newRow(g));
    setRows(rows);
  };
  const setStair = (key: string, patch: Partial<StairRowState>) => set({ stairs: value.stairs.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  const setManual = (key: string, patch: Partial<ManualRowState>) => set({ manual: value.manual.map((m) => (m.key === key ? { ...m, ...patch } : m)) });
  const manualSummary = value.manual
    .filter((m) => m.description.trim())
    .map((m) => {
      const total = manualTotal({ description: m.description.trim(), qty: toNumber(m.qty), uom: m.uom, rate: toNumber(m.rate), cost: toNumber(m.cost) });
      return `${m.description.trim()}${total !== null ? ` · ${money(total)}` : ""}`;
    })
    .join(" · ");

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

  const stairWords = (s: StairRowState) => {
    const p = profileById.get(s.profileId);
    return p ? `${p.name} · ${money(stairTotal(p, toNumber(s.price)))}` : null;
  };
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
                  // Baseboards: a third of the install square feet, offered back once the amount has been edited.
                  const third = isLinearBaseboard(r) ? baseboardDefault(installOf(value.rows)) : null;
                  const thirdable = third !== null && clean(r.amount) !== String(third);
                  const total = c ? rowTotal(choices, { choiceId: c.id, amount: toNumber(r.amount), productId: r.product?.recordId ?? null }, picked) : null;
                  return (
                    <div key={r.key} className="qw-row">
                      <ChoiceField label={`${g} ${i + 1}`} none={g === "Disposal" ? "None" : null} options={options} value={r.choiceId} onChange={(id) => setRow(r.key, { choiceId: id, product: null })} />
                      {(unit || c || rows.length > 1) && (
                        <div className="qw-amt-row">
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
                          {copyable && (
                            <button type="button" className="linkbtn qw-same" onClick={() => setRow(r.key, { amount: installSqft! })}>
                              Same as install ({installSqft})
                            </button>
                          )}
                          {thirdable && (
                            <button type="button" className="linkbtn qw-same" onClick={() => setRow(r.key, { amount: String(third) })}>
                              ⅓ of install ({third})
                            </button>
                          )}
                          {c && (
                            <span className="qw-price" aria-label={`${g} ${i + 1} rate and total`}>
                              <span className="qw-rate">{rateText(c, unit, r.product)}</span>
                              <b>{total === null ? "—" : money(total)}</b>
                            </span>
                          )}
                          {rows.length > 1 && (
                            <button type="button" className="iconbtn danger qw-x" aria-label={`Remove ${g} ${i + 1}`} onClick={() => removeRow(r.key)}>
                              ✕
                            </button>
                          )}
                        </div>
                      )}
                      {g === "Material" && c && <ProductPick row={r} standard={c.product} fallback={c.parts.length > 0 ? "allowance from the rate card" : "none set"} onPick={(p) => setRow(r.key, { product: p })} />}
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
          const profile = profileById.get(s.profileId) ?? null;
          const override = toNumber(s.price);
          return (
            <div key={s.key} className="qw-stair">
              <div className="qw-stair-h">
                <span className="nm">Staircase {i + 1}</span>
                <button type="button" className="iconbtn danger qw-x" aria-label={`Remove staircase ${i + 1}`} onClick={() => set({ stairs: value.stairs.filter((x) => x.key !== s.key) })}>
                  ✕
                </button>
              </div>
              {profiles.length <= CHIP_LIMIT ? (
                <Chips label={`Staircase ${i + 1}`} options={profiles.map((p) => p.name)} value={profile?.name ?? ""} onChange={(v) => setStair(s.key, { profileId: profiles.find((p) => p.name === v)?.id ?? "" })} />
              ) : (
                <select className="in" aria-label={`Staircase ${i + 1}`} value={s.profileId} onChange={(e) => setStair(s.key, { profileId: e.target.value })}>
                  <option value="">Choose…</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              {profile && (
                <div className="qw-amt-row">
                  <label className="qw-money">
                    <span className="k">Different price (optional)</span>
                    <span className="qw-amt">
                      <input className="in" inputMode="decimal" placeholder={String(profile.price)} aria-label={`Staircase ${i + 1} price override`} value={s.price} onChange={(e) => setStair(s.key, { price: e.target.value })} />
                      <span>$</span>
                    </span>
                  </label>
                  <span className="qw-price" aria-label={`Staircase ${i + 1} price`}>
                    <span className="qw-rate">{override !== null ? `preset ${money(profile.price)}` : `preset${profile.steps ? ` · ${profile.steps} steps` : ""}`}</span>
                    <b>{money(stairTotal(profile, override))}</b>
                  </span>
                </div>
              )}
              {profile && (
                <p className="qw-say">
                  <b>{profile.name}</b> {METHOD_PHRASE[profile.method]} {modifierFor(profile.type)}
                </p>
              )}
            </div>
          );
        })}
        {profiles.length === 0 && <p className="note">No staircase profiles are set up yet. Add rows to Stair Profiles in Airtable.</p>}
        {profiles.length > 0 && value.stairs.length < STAIR_ROWS && (
          <button type="button" className="linkbtn qw-add" onClick={() => set({ stairs: [...value.stairs, newStair()] })}>
            + {value.stairs.length === 0 ? "Add a staircase" : "Another staircase"}
          </button>
        )}
      </section>

      <section className="qw-part" aria-labelledby="qw-manual">
        <h3 className="qw-part-h" id="qw-manual">
          Typed items
          <span className={`qw-wg-sum${manualSummary ? "" : " faint"}`}>{manualSummary || "Nothing typed"}</span>
        </h3>
        {value.manual.map((m, i) => {
          const total = manualTotal({ description: m.description.trim() || "item", qty: toNumber(m.qty), uom: m.uom, rate: toNumber(m.rate), cost: toNumber(m.cost) });
          const flat = m.uom === "flat";
          return (
            <div key={m.key} className="qw-stair qw-item">
              <div className="qw-stair-h">
                <span className="nm">Item {i + 1}</span>
                <button type="button" className="iconbtn danger qw-x" aria-label={`Remove item ${i + 1}`} onClick={() => set({ manual: value.manual.filter((x) => x.key !== m.key) })}>
                  ✕
                </button>
              </div>
              <input className="in" placeholder="What it is, as the customer will read it" aria-label={`Item ${i + 1} description`} value={m.description} onChange={(e) => setManual(m.key, { description: e.target.value })} />
              <Chips label={`Item ${i + 1} priced per`} options={MANUAL_UOMS} value={m.uom} onChange={(v) => setManual(m.key, { uom: v as ManualUom })} />
              <div className="qw-amt-row">
                {!flat && (
                  <label className="qw-amt">
                    <input className="in" inputMode="decimal" placeholder="0" aria-label={`Item ${i + 1} amount in ${UNIT_LABEL[m.uom as keyof typeof UNIT_LABEL] ?? m.uom}`} value={m.qty} onChange={(e) => setManual(m.key, { qty: e.target.value })} />
                    <span>{UNIT_LABEL[m.uom as keyof typeof UNIT_LABEL] ?? m.uom}</span>
                  </label>
                )}
                <label className="qw-amt">
                  <input className="in" inputMode="decimal" placeholder="0" aria-label={`Item ${i + 1} price${flat ? "" : " per unit"}`} value={m.rate} onChange={(e) => setManual(m.key, { rate: e.target.value })} />
                  <span>{flat ? "$ flat" : "$ price"}</span>
                </label>
                <label className="qw-amt">
                  <input className="in" inputMode="decimal" placeholder="0" aria-label={`Item ${i + 1} cost${flat ? "" : " per unit"}, optional`} value={m.cost} onChange={(e) => setManual(m.key, { cost: e.target.value })} />
                  <span>$ cost</span>
                </label>
                <span className="qw-price" aria-label={`Item ${i + 1} total`}>
                  <span className="qw-rate">{m.cost.trim() ? "cost typed" : "no cost yet"}</span>
                  <b>{total === null ? "—" : money(total)}</b>
                </span>
              </div>
            </div>
          );
        })}
        {value.manual.length < MANUAL_ROWS && (
          <button type="button" className="linkbtn qw-add" onClick={() => set({ manual: [...value.manual, newManual()] })}>
            + {value.manual.length === 0 ? "Add an item by hand" : "Another item"}
          </button>
        )}
      </section>

      <section className="qw-part" aria-labelledby="qw-else">
        <h3 className="qw-part-h" id="qw-else">Anything else</h3>
        <div className="qw-field">
          <span className="k">Building</span>
          <Chips label="Building" options={BUILDINGS} value={value.building} onChange={(v) => set({ building: v })} allowNone />
        </div>
        <label className="qw-money">
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
function ProductPick({ row, standard, fallback, onPick }: { row: WorkRow; standard: QuickProduct | null; fallback: string; onPick: (p: PickedProduct | null) => void }) {
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
        {row.product ? "Chosen" : "Standard"}: {shown ? `${shown.name}${shown.sku ? ` (${shown.sku})` : ""} · ${money(shown.rate)}/sq ft` : fallback}
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
