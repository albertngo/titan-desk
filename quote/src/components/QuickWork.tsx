"use client";

import { useMemo, useState, useTransition } from "react";
import { searchProductsAction } from "@/app/new/actions";
import { optionTotals } from "@/lib/calc";
import { money } from "@/lib/format";
import { amountUnit, BASIS_GROUPS, basisChoices, BUILDINGS, buildPreliminary, choiceRate, GROUP_ROWS, materialQuestion, parseWork, QUICK_GROUPS, remapBases, resolveBasis, rowTotal, followBases, materialWaste, topChoices, topOf, TOTAL_BASIS, waterfall, type QuickChoice, type QuickGroup, type QuickProduct, type QuickProfile, type TopChoice } from "@/lib/quick/plan";
import { METHOD_PHRASE, modifierFor, STAIR_ROWS } from "@/lib/quick/stairs";
import { SAND_DISCLAIMER, sandFlag, sandRole } from "@/lib/editor/sandRule";
import { wasteMath } from "@/lib/editor/model";

export type PickedProduct = Pick<QuickProduct, "recordId" | "sku" | "name" | "rate">;
/**
 * `basis` (Baseboards rows 2026-11-04, Material rows 2026-11-05): what the amount follows live,
 * TOTAL_BASIS or an Install row's key; null once staff type their own amount, and on a row added
 * after the first.
 */
/** `materialId` (2026-11-06): the Install Material picked on the row (the type of glue); absent = the default. */
export type WorkRow = { key: string; group: QuickGroup; choiceId: string; amount: string; product: PickedProduct | null; basis?: string | null; materialId?: string | null };
/** One staircase on the form: the Stair Profiles row picked (no typed price since 2026-11-02). */
export type StairRowState = { key: string; profileId: string };
export type WorkState = { rows: WorkRow[]; stairs: StairRowState[]; extraCost: string; description: string; building: string };

let n = 0;
const newRow = (group: QuickGroup, basis: string | null = null): WorkRow => ({ key: `r${++n}`, group, choiceId: "", amount: "", product: null, ...(BASIS_GROUPS.includes(group) ? { basis } : {}) });
const newStair = (): StairRowState => ({ key: `s${++n}`, profileId: "" });

export function initialWork(choices: QuickChoice[]): WorkState {
  const groups = QUICK_GROUPS.filter((g) => choices.some((c) => c.group === g));
  return { rows: groups.map((g) => newRow(g, BASIS_GROUPS.includes(g) ? TOTAL_BASIS : null)), stairs: [], extraCost: "", description: "", building: "" };
}

const toNumber = (s: string) => {
  const v = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** What New quote sends: which choice and how much, which staircase, never a price. */
export function workInput(w: WorkState) {
  return {
    rows: w.rows.filter((r) => r.choiceId).map((r) => ({ choiceId: r.choiceId, amount: toNumber(r.amount), productId: r.product?.recordId ?? null, ...(r.materialId ? { materialId: r.materialId } : {}) })),
    stairs: w.stairs.filter((s) => s.profileId).map((s) => ({ profileId: s.profileId })),
    extraCost: toNumber(w.extraCost),
    description: w.description,
    building: w.building || null,
  };
}

/** The products staff picked on material rows, by record id, as the pricing needs them (no cost in the browser). */
const pickedProducts = (value: WorkState) => new Map(value.rows.flatMap((r) => (r.product ? [[r.product.recordId, { ...r.product, cost: null }] as const] : [])));

/** The running estimate, the same way the server will price it (before discount and HST). */
export function estimateWork(choices: QuickChoice[], profiles: QuickProfile[], value: WorkState): { total: number; lines: number; name: string; materials: string[] } {
  const { lines, name, materials } = buildPreliminary(choices, parseWork(workInput(value)), pickedProducts(value), new Map(profiles.map((p) => [p.id, p])));
  return { total: optionTotals(lines, 0, false).preDiscount, lines: lines.length, name, materials };
}

/** A full, independent copy of one option's work (Duplicate, 2026-10-31): new row keys, nothing shared. */
export function copyWork(w: WorkState): WorkState {
  const keyFor = new Map(w.rows.map((r) => [r.key, `r${++n}`]));
  const rows = remapBases(w.rows.map((r) => ({ ...r, key: keyFor.get(r.key)! })), keyFor);
  return { ...w, rows, stairs: w.stairs.map((s) => ({ ...s, key: `s${++n}` })) };
}

const UNIT_LABEL = { sqft: "sq ft", "linear ft": "lin ft", pieces: "pcs" } as const;

/** The rate column's text (Albert, 2026-10-18): "$2.50/sq ft", "$300 flat", or both when a choice has both kinds of part. */
function rateText(c: QuickChoice, unit: keyof typeof UNIT_LABEL | null, product: PickedProduct | null, materialId: string | null = null): string {
  const { perUnit, flat } = choiceRate(c, product ? { ...product, cost: null } : null, materialId);
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
 * Stair Profiles rows, each adding its preset Stair Item lines (2026-11-02, src/lib/quick/plan.ts).
 */
export function QuickWork({
  choices,
  profiles,
  value,
  onChange,
  quoteWide = "one",
}: {
  choices: QuickChoice[];
  profiles: QuickProfile[];
  value: WorkState;
  onChange: (w: WorkState) => void;
  /** Building and the project description belong to the quote: "one" option, "shared" by several tabs (said so), or "hidden" (the editor's + From quick form). */
  quoteWide?: "one" | "shared" | "hidden";
}) {
  const byId = useMemo(() => new Map(choices.map((c) => [c.id, c])), [choices]);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const picked = useMemo(() => pickedProducts(value), [value]);
  const groups = QUICK_GROUPS.filter((g) => choices.some((c) => c.group === g));
  const missing = QUICK_GROUPS.filter((g) => !groups.includes(g));

  const set = (patch: Partial<WorkState>) => onChange({ ...value, ...patch });

  /** A row follows its basis only once a choice is picked on it: a linear-foot one on Baseboards, any on Material. */
  const follows = (r: WorkRow) => {
    const c = byId.get(r.choiceId);
    return !!c && (r.group === "Material" || amountUnit(c) === "linear ft");
  };
  /** Every change to the rows goes through here, so each row with a basis follows it, live (2026-11-04; Material 2026-11-05). */
  const setRows = (next: WorkRow[]) => set({ rows: followBases(next, follows) });
  /** Typing an amount on a Baseboards or Material row is a manual override: it stops following until a chip is picked. */
  const setRow = (key: string, patch: Partial<WorkRow>) =>
    setRows(value.rows.map((r) => (r.key !== key ? r : { ...r, ...patch, ...(BASIS_GROUPS.includes(r.group) && patch.amount !== undefined && patch.basis === undefined ? { basis: null } : {}) })));
  const labelOf = (id: string) => byId.get(id)?.label ?? "";
  const removeRow = (key: string) => setRows(value.rows.filter((r) => r.key !== key));
  const addRow = (g: QuickGroup) => {
    const at = value.rows.map((r) => r.group).lastIndexOf(g);
    const rows = [...value.rows];
    rows.splice(at + 1, 0, newRow(g));
    setRows(rows);
  };
  const setStair = (key: string, patch: Partial<StairRowState>) => set({ stairs: value.stairs.map((s) => (s.key === key ? { ...s, ...patch } : s)) });

  // The first Install row with a square footage: Remove rows can take it in one tap (Material follows a basis since 2026-11-05).
  const installSqft = value.rows.find((r) => r.group === "Install" && r.choiceId && toNumber(r.amount) !== null)?.amount ?? null;

  const rowWords = (r: WorkRow) => {
    const c = byId.get(r.choiceId);
    if (!c) return null;
    const unit = amountUnit(c);
    const amt = toNumber(r.amount);
    const glue = materialQuestion(c, r.materialId);
    return `${c.label}${glue ? ` · ${glue.current.name}` : ""}${unit && amt !== null ? ` · ${amt} ${UNIT_LABEL[unit]}` : ""}`;
  };
  const groupSummary = (g: QuickGroup) => value.rows.filter((r) => r.group === g).map(rowWords).filter(Boolean).join(" · ");

  const stairWords = (s: StairRowState) => {
    const p = profileById.get(s.profileId);
    return p ? `${p.name} · ${money(p.total)}` : null;
  };
  const stairSummary = value.stairs.map(stairWords).filter(Boolean).join(" · ");

  return (
    <div className="qw">
      <section className="qw-part" aria-labelledby="qw-flooring">
        <h3 className="qw-part-h" id="qw-flooring">Flooring</h3>
        {groups.map((g) => {
          const rows = value.rows.filter((r) => r.group === g);
          const options = choices.filter((c) => c.group === g);
          // The waterfall (2026-11-06): choices sharing a Path's first part are one entry here; their options follow under it.
          const tops = topChoices(options);
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
                  const copyable = unit === "sqft" && g === "Remove" && installSqft !== null && clean(r.amount) !== clean(installSqft);
                  // Baseboards: a third of the install square feet, the total or one Install row's (2026-11-04); Material: the square feet (2026-11-05).
                  const bases = (g === "Baseboards" && (!c || amountUnit(c) === "linear ft")) || g === "Material" ? basisChoices(value.rows, labelOf, g) : [];
                  // Material waste (2026-11-05): on the line's Waste field, counted in the total beside it.
                  const waste = g === "Material" && c ? materialWaste(c.label, (r.product ?? c.product)?.name ?? null) : null;
                  const following = resolveBasis(r.basis, value.rows);
                  const total = c ? rowTotal(choices, { choiceId: c.id, amount: toNumber(r.amount), productId: r.product?.recordId ?? null, materialId: r.materialId ?? null }, picked) : null;
                  const levels = c ? waterfall(choices, c.id) : [];
                  const glue = materialQuestion(c, r.materialId);
                  return (
                    <div key={r.key} className="qw-row">
                      <ChoiceField label={`${g} ${i + 1}`} none={g === "Disposal" ? "None" : null} options={tops} value={r.choiceId} onChange={(id) => setRow(r.key, { choiceId: id, product: null, materialId: null })} />
                      {levels.map((lv) => (
                        <div key={lv.depth} className={`qw-chips qw-fall qw-fall-${Math.min(lv.depth, 3)}`} role="radiogroup" aria-label={`${g} ${i + 1} option ${lv.depth}`}>
                          {lv.options.map((o) => (
                            <button type="button" key={o.label} className={`qw-chip${o.on ? " on" : ""}`} role="radio" aria-checked={o.on} onClick={() => setRow(r.key, { choiceId: o.choiceId })}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      ))}
                      {glue && (
                        <div className={`qw-chips qw-fall qw-fall-${Math.min(levels.length + 1, 3)}`} role="radiogroup" aria-label={`${g} ${i + 1} ${glue.label}`}>
                          <span className="qw-fall-k">{glue.label}</span>
                          {glue.choices.map((m) => {
                            const on = m.id === glue.current.id;
                            return (
                              <button type="button" key={m.id} className={`qw-chip${on ? " on" : ""}`} role="radio" aria-checked={on} title={`+ ${money(m.price)}/sq ft`} onClick={() => setRow(r.key, { materialId: m.id })}>
                                {m.name} <span className="faint">+{money(m.price)}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
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
                          {c && (
                            <span className="qw-price" aria-label={`${g} ${i + 1} rate and total`}>
                              <span className="qw-rate">{rateText(c, unit, r.product, r.materialId ?? null)}{waste !== null && ` + ${Math.round(waste * 100)}% waste`}</span>
                              <b>{total === null ? "-" : money(total)}</b>
                            </span>
                          )}
                          {rows.length > 1 && (
                            <button type="button" className="iconbtn danger qw-x" aria-label={`Remove ${g} ${i + 1}`} onClick={() => removeRow(r.key)}>
                              ✕
                            </button>
                          )}
                        </div>
                      )}
                      {/* The material's math (2026-11-06): the square feet typed + the waste = what is ordered. */}
                      {waste !== null &&
                        (() => {
                          const m = wasteMath({ qty: toNumber(r.amount), waste });
                          return m && m.typed > 0 ? (
                            <p className="wastemath qw-math">
                              {m.typed.toLocaleString("en-CA", { maximumFractionDigits: 2 })} sf + {m.pct}% waste = <b>{m.actual.toLocaleString("en-CA", { maximumFractionDigits: 2 })} sf</b>
                            </p>
                          ) : null;
                        })()}
                      {bases.length > 0 && (
                        <div className="qw-chips qw-basis" role="radiogroup" aria-label={`${g} ${i + 1} follows`}>
                          {bases.map((b) => {
                            const on = following === b.basis;
                            return (
                              <button type="button" key={b.basis} className={`qw-chip${on ? " on" : ""}`} role="radio" aria-checked={on} title={`${b.third} ${g === "Material" ? "sq ft" : "linear ft"}, and it keeps following`} onClick={() => setRow(r.key, { basis: b.basis })}>
                                {b.label}
                              </button>
                            );
                          })}
                          {following === null && <span className="qw-basis-note">{r.amount.trim() ? "Typed by hand" : "Pick one to follow the install"}</span>}
                        </div>
                      )}
                      {g === "Material" && c && <ProductPick row={r} standard={c.product} fallback={c.parts.length > 0 ? "allowance from the rate card" : "none set"} onPick={(p) => setRow(r.key, { product: p })} />}
                    </div>
                  );
                })}
                {rows.length < GROUP_ROWS[g] && g !== "Disposal" && (
                  <button type="button" className="linkbtn qw-add" onClick={() => addRow(g)}>
                    + Another {g === "Subfloor prep" ? "subfloor prep" : g === "Baseboards" ? "moulding area" : g.toLowerCase()}
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
                  <span className="qw-rate">
                    {profile.storedPrice ? "Stored price: link this row's Stair Items in Stair Profiles to add them instead" : `Adds ${profile.lines.map((l) => `${l.qty} × ${l.description}`).join(" · ")}`}
                  </span>
                  <span className="qw-price" aria-label={`Staircase ${i + 1} price`}>
                    <span className="qw-rate">{`${profile.storedPrice ? "preset" : "Stair Items"}${profile.steps ? ` · ${profile.steps} steps` : ""}`}</span>
                    <b>{money(profile.total)}</b>
                  </span>
                </div>
              )}
              {profile && (
                <p className="qw-say">
                  <b>{profile.name}</b> {METHOD_PHRASE[profile.method]} {modifierFor(profile.type)}
                </p>
              )}
              {/* Sand steps → painted risers and stringers only (2026-11-06): the disclaimer, and a flag if the profile's own items clash. */}
              {profile && (profile.method === "Sand & stain" || profile.lines.some((l) => sandRole({ id: l.sourceId, name: l.description, category: l.stairCategory }) === "sand")) && (
                <p className="sand-note">{SAND_DISCLAIMER}</p>
              )}
              {profile &&
                [...new Set(profile.lines.map((l) => sandFlag(l, profile.lines)).filter((x): x is string => x !== null))].map((f) => (
                  <p key={f} className="sand-flag" role="status">
                    ⚠ {f}
                  </p>
                ))}
            </div>
          );
        })}
        {profiles.length === 0 && <p className="note">No staircase profiles are ready yet. A Stair Profiles row shows here when its linked Stair Items are all active and priced (or, with none linked yet, when it has a stored price).</p>}
        {profiles.length > 0 && value.stairs.length < STAIR_ROWS && (
          <button type="button" className="linkbtn qw-add" onClick={() => set({ stairs: [...value.stairs, newStair()] })}>
            + {value.stairs.length === 0 ? "Add a staircase" : "Another staircase"}
          </button>
        )}
      </section>

      <section className="qw-part" aria-labelledby="qw-else">
        <h3 className="qw-part-h" id="qw-else">Anything else</h3>
        {quoteWide !== "hidden" && (
          <div className="qw-field">
            <span className="k">Building{quoteWide === "shared" && <span className="faint"> (the same on every option)</span>}</span>
            <Chips label="Building" options={BUILDINGS} value={value.building} onChange={(v) => set({ building: v })} allowNone />
          </div>
        )}
        <label className="qw-money" title="Goes on the quote as a private line: the customer sees one “Additional work” row with the amount, never what it was for.">
          <span className="k">Additional cost <span className="faint">(private: shown to the customer as one “Additional work” row)</span></span>
          <span className="qw-amt">
            <input className="in" inputMode="decimal" placeholder="0" value={value.extraCost} onChange={(e) => set({ extraCost: e.target.value })} />
            <span>$</span>
          </span>
        </label>
        {quoteWide !== "hidden" && (
          <label className="qw-desc">
            Description of project <span className="faint">(internal, saved on the quote&apos;s notes{quoteWide === "shared" ? "; the same on every option" : ""})</span>
            <textarea className="in area" rows={3} value={value.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
        )}
      </section>
    </div>
  );
}

/**
 * A short list as one-tap chips; a long one as a list. Each entry is a top-level choice (2026-11-06): a choice of
 * its own, or a waterfall's head standing for the choices under it, shown picked while the row holds any of them.
 */
function ChoiceField({ label, none, options, value, onChange }: { label: string; none: string | null; options: TopChoice[]; value: string; onChange: (id: string) => void }) {
  const current = topOf(options, value);
  if (options.length <= CHIP_LIMIT) {
    return (
      <div className="qw-chips" role="radiogroup" aria-label={label}>
        {none && (
          <button type="button" className={`qw-chip${value === "" ? " on" : ""}`} role="radio" aria-checked={value === ""} onClick={() => onChange("")}>
            {none}
          </button>
        )}
        {options.map((o) => {
          const on = current?.key === o.key;
          return (
            <button type="button" key={o.key} className={`qw-chip${on ? " on" : ""}`} role="radio" aria-checked={on} onClick={() => (on ? !none && onChange("") : onChange(o.choiceId))}>
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <select className="in" aria-label={label} value={current?.key ?? ""} onChange={(e) => onChange(options.find((o) => o.key === e.target.value)?.choiceId ?? "")}>
      <option value="">{none ?? "Choose…"}</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>{o.label}</option>
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
