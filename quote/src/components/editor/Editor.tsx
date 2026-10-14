"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveAsNewVersionAction, saveVersionAction } from "@/app/q/[id]/edit/actions";
import { Financials } from "@/components/Financials";
import { SECTIONS, isPriced, lineCost, lineFlags, lineTotal, optionTotals, sectionOf } from "@/lib/calc";
import {
  UOMS,
  addLine,
  addOption,
  buildCatalogue,
  duplicateOption,
  entryFor,
  exclusionLine,
  parseNum,
  removeLine,
  removeOption,
  revertLine,
  setContractor,
  setTerms,
  withCustomerFrom,
  updateLine,
  updateOption,
  type EditorLine,
  type EditorQuote,
} from "@/lib/editor/model";
import { ghlContactUrl } from "@/lib/ghl/ids";
import { money, pct, rate } from "@/lib/format";
import type { RateCard } from "@/lib/quotes/types";
import { Picker } from "./Picker";

const WORK_SECTIONS = SECTIONS.filter((s) => s !== "Exclusions");

/** `base` is the fingerprint of what Airtable held when the draft was started; saving checks it still does. */
type Draft = { savedAt: string; quote: EditorQuote; base?: string };

/** The version being edited, as the edit page read it from Airtable. */
export type EditorVersion = { id: string; label: string | null; version: number | null; status: string | null; basis: string | null; base: string };

const BASES = ["Preliminary", "Measured"] as const;

function draftKey(q: EditorQuote) {
  return `titan-quote-draft:${q.quoteRecordId ?? "new"}`;
}

function loadDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

/** A number cell: blank means "use the card". Commits on blur or Enter; Escape cancels. */
function NumCell({ value, placeholder, label, onCommit }: { value: number | null; placeholder?: string; label: string; onCommit: (v: number | null) => void }) {
  return (
    <input
      key={String(value)}
      className="cell-in num"
      inputMode="decimal"
      aria-label={label}
      defaultValue={value === null ? "" : String(value)}
      placeholder={placeholder}
      onBlur={(e) => {
        const v = parseNum(e.currentTarget.value);
        if (v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = value === null ? "" : String(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** A text cell that commits on blur, so typing never re-renders the whole quote per keystroke. */
function TextCell({ value, placeholder, label, onCommit, className = "cell-in" }: { value: string; placeholder?: string; label: string; onCommit: (v: string) => void; className?: string }) {
  return (
    <input
      key={value}
      className={className}
      aria-label={label}
      defaultValue={value}
      placeholder={placeholder}
      onBlur={(e) => {
        if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

export default function Editor({ initial, card, backHref, version }: { initial: EditorQuote; card: RateCard; backHref: string; version: EditorVersion }) {
  const key = draftKey(initial);
  const [boot] = useState(() => loadDraft(key));
  // A restored draft keeps the base it was started from, so a save can tell if Airtable moved on since.
  const base = boot ? (boot.base ?? "unknown") : version.base;
  const isDraft = version.status === "Draft";
  // A new version is usually the measured one, after the site visit.
  const [basis, setBasis] = useState<string>("Measured");
  const [saving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<{ message: string; conflict: boolean } | null>(null);
  const leaving = useRef(false);
  const [quote, setQuote] = useState<EditorQuote>(boot ? withCustomerFrom(boot.quote, initial) : initial);
  const [restoredAt, setRestoredAt] = useState<string | null>(boot?.savedAt ?? null);
  const [savedAt, setSavedAt] = useState<string | null>(boot?.savedAt ?? null);
  const [activeId, setActiveId] = useState<string | null>(quote.options[0]?.id ?? null);
  const [picking, setPicking] = useState<string | null>(null);
  const [newExclusion, setNewExclusion] = useState("");

  // Stairs are not quoted on this page (Albert, 2026-10-12): the picker searches the rate card only.
  const catalogue = useMemo(() => buildCatalogue(card.rates, []), [card]);
  const changed = useMemo(() => JSON.stringify(quote) !== JSON.stringify(initial), [quote, initial]);

  // Keep a draft on this device: closing the tab or losing signal never loses work.
  useEffect(() => {
    if (leaving.current) return;
    try {
      if (changed) window.localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), quote, base } satisfies Draft));
      else window.localStorage.removeItem(key);
    } catch {
      // Private browsing or storage full: editing still works, it just is not kept.
    }
  }, [quote, changed, key, base]);

  const apply = (next: EditorQuote) => {
    setQuote(next);
    setSavedAt(new Date().toISOString());
  };

  const option = quote.options.find((o) => o.id === activeId) ?? quote.options[0] ?? null;
  const t = option ? optionTotals(option.lines, quote.discountRate, quote.showHst) : null;

  /** After a save, the device copy is done with: Airtable has it. Open the saved version so its parity check shows. */
  const done = (versionId: string) => {
    leaving.current = true;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage unavailable: nothing was kept.
    }
    window.location.assign(`/q/${versionId}`);
  };

  const save = () => {
    setSaveError(null);
    startSave(async () => {
      const r = await saveVersionAction(version.id, quote, base);
      if (r.ok) done(r.versionId);
      else setSaveError({ message: r.message, conflict: Boolean(r.conflict) });
    });
  };

  const saveAsNew = () => {
    setSaveError(null);
    startSave(async () => {
      const r = await saveAsNewVersionAction(version.id, quote, basis);
      if (r.ok) done(r.versionId);
      else setSaveError({ message: r.message, conflict: false });
    });
  };

  const discard = () => {
    if (!window.confirm("Discard every change on this device and go back to what is in Airtable?")) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage unavailable: nothing was kept, so there is nothing to clear.
    }
    setQuote(initial);
    setRestoredAt(null);
    setSavedAt(null);
    setActiveId(initial.options[0]?.id ?? null);
  };

  const sectionsShown: string[] = option ? WORK_SECTIONS.filter((s) => option.lines.some((l) => sectionOf(l) === s)) : [];
  if (option?.lines.some((l) => sectionOf(l) === "Unsorted")) sectionsShown.push("Unsorted");
  const exclusions = option ? option.lines.filter((l) => l.section === "Exclusions") : [];

  let n = 0;
  const numberOf = new Map<string, number>();
  if (option) for (const s of sectionsShown) for (const l of option.lines) if (sectionOf(l) === s && isPriced(l) && l.include) numberOf.set(l.id, ++n);

  const row = (l: EditorLine) => {
    if (!option) return null;
    const total = lineTotal(l);
    const cost = lineCost(l);
    const flags = lineFlags(l);
    const entry = entryFor(l, catalogue);
    const contractors = entry && entry.kind === "rate" ? entry.contractors : [];
    const overridden = l.unitPrice !== null || l.costOverride !== null;
    const margin = total && total > 0 && cost !== null ? ((total - cost) / total) * 100 : null;
    const upd = (patch: Partial<EditorLine>) => apply(updateLine(quote, option.id, l.id, patch));
    return (
      <tr key={l.id} className={l.include ? undefined : "off"}>
        <td className="idx">{numberOf.get(l.id) ?? ""}</td>
        <td className="item">
          {l.sourceKind === "manual" ? (
            <TextCell value={l.description} label="Description" placeholder="Describe the work" onCommit={(v) => upd({ description: v })} />
          ) : (
            <div className="desc">{l.description}</div>
          )}
          <div className="subins">
            <TextCell value={l.area} label="Area or room" placeholder="Area / room" className="cell-in mini" onCommit={(v) => upd({ area: v })} />
            <TextCell value={l.clientNote} label="Note to client" placeholder="Note to client" className="cell-in mini" onCommit={(v) => upd({ clientNote: v })} />
            <span className="rowbtns">
              {overridden && l.hasSource && (
                <button className="iconbtn" title="Back to the card rate and cost" aria-label="Back to the card rate and cost" onClick={() => apply(revertLine(quote, option.id, l.id))}>↺</button>
              )}
              <button className="iconbtn danger" title="Remove line" aria-label="Remove line" onClick={() => apply(removeLine(quote, option.id, l.id))}>✕</button>
            </span>
          </div>
          {flags.length > 0 && <div>{flags.map((f) => <span key={f} className={`flag ${f}`}>{f}</span>)}</div>}
        </td>
        <td>
          {contractors.length > 1 ? (
            <select
              className="cell-in"
              aria-label="Contractor"
              value={l.contractor ?? ""}
              onChange={(e) => apply(setContractor(quote, option.id, l.id, e.target.value, catalogue))}
            >
              {contractors.map((c, i) => (
                <option key={c.name} value={c.name}>
                  {c.name} · {money(c.cost)}{i === 0 ? " ★" : ""}
                </option>
              ))}
            </select>
          ) : (
            <span className="muted">{l.contractor ?? "—"}</span>
          )}
        </td>
        <td className="r">
          <div className="qty">
            <NumCell value={l.qty} label="Quantity" placeholder="0" onCommit={(v) => upd({ qty: v })} />
            {l.sourceKind === "manual" ? (
              <select className="cell-in uom" aria-label="Unit" value={l.uom ?? ""} onChange={(e) => upd({ uom: e.target.value || null })}>
                <option value="">unit</option>
                {UOMS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            ) : (
              <span className="faint uomtxt">{l.uom ?? ""}</span>
            )}
          </div>
          <div className="wastein">
            <NumCell value={l.waste === null ? null : Math.round(l.waste * 1000) / 10} label="Waste percent" placeholder="waste %" onCommit={(v) => upd({ waste: v === null ? null : v / 100 })} />
          </div>
        </td>
        <td className="r">
          <NumCell value={l.costOverride} label="Unit cost" placeholder={l.unitCostSnap !== null ? rate(l.unitCostSnap) : "cost"} onCommit={(v) => upd({ costOverride: v })} />
          {l.unitCostSnap !== null && <span className="sub">card {money(l.unitCostSnap)}</span>}
        </td>
        <td className="r">
          <NumCell value={l.unitPrice} label="Unit price" placeholder={l.unitPriceSnap !== null ? rate(l.unitPriceSnap) : "price"} onCommit={(v) => upd({ unitPrice: v })} />
          {l.unitPriceSnap !== null && <span className="sub">card {money(l.unitPriceSnap)}</span>}
        </td>
        <td className="r muted">{pct(margin, 0)}</td>
        <td className="r amt">
          {l.include ? money(total) : <span className="note">optional</span>}
          <label className="inc" title="Untick to show this line as an optional extra, outside the total.">
            <input type="checkbox" checked={l.include} onChange={(e) => upd({ include: e.target.checked })} /> in total
          </label>
        </td>
      </tr>
    );
  };

  return (
    <div className="page">
      <div className="pagehead">
        <div className="titles">
          <Link href={backHref} className="crumb">← Back</Link>
          <h1>{quote.quoteRecordId ? `Edit · ${quote.customerName || "No customer"}` : "New quote"}</h1>
          <p>
            {version.label ?? (version.version !== null ? `v${version.version}` : "Quote")}
            {version.basis && ` · ${version.basis}`}
            {" · "}
            {isDraft ? "Changes are kept on this device until you save." : `This version is ${version.status ?? "locked"}: changes save as a new version.`}
          </p>
        </div>
        <span className={`status ${changed ? "Sent" : "Draft"}`}>
          {changed ? `Unsaved changes${savedAt ? ` · kept ${new Date(savedAt).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}` : ""}` : "No changes"}
        </span>
      </div>

      {restoredAt && (
        <p className="card banner warn restored">
          Restored your unsaved changes from {new Date(restoredAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}.{" "}
          <button className="linkbtn" onClick={discard}>Discard them</button>
        </p>
      )}

      <div className={`layout${option && t ? "" : " full"}`}>
        <div className="stack">
          <section className="card">
            <div className="card-h">Customer and terms</div>
            <div className="card-b form">
              <div className="ro-strip">
                <span className="who">{quote.customerName || <span className="faint">No customer</span>}</span>
                <span className="where">
                  {[quote.siteAddress, quote.siteCity].filter(Boolean).join(", ") || <span className="faint">No address yet</span>}
                </span>
                {quote.addressStatus === "Unconfirmed" && <span className="chip warn">Address unconfirmed</span>}
                <span className="note">
                  Change these on the GHL contact (after Won, in the Notion project), not here.{" "}
                  {quote.ghlContactId && (
                    <a href={ghlContactUrl(quote.ghlContactId)} target="_blank" rel="noreferrer">
                      Open in GHL ↗
                    </a>
                  )}
                </span>
              </div>
              <label>
                Discount %
                <NumCell
                  value={Math.round(quote.discountRate * 1000) / 10}
                  label="Discount percent"
                  placeholder="0"
                  onCommit={(v) => apply(setTerms(quote, { discountRate: Math.max(0, Math.min(100, v ?? 0)) / 100 }))}
                />
              </label>
              <label className="check-in">
                <input type="checkbox" checked={quote.showHst} onChange={(e) => apply(setTerms(quote, { showHst: e.target.checked }))} /> Charge HST (13%)
              </label>
            </div>
          </section>

          <nav className="tabs" aria-label="Options">
            {quote.options.map((o) => (
              <button key={o.id} className="tab" aria-current={option?.id === o.id ? "page" : undefined} onClick={() => setActiveId(o.id)}>
                {o.name || "Untitled"}
                <span className="t-amt">{money(optionTotals(o.lines, quote.discountRate, quote.showHst).total)}</span>
              </button>
            ))}
            <button
              className="tab"
              onClick={() => {
                const next = addOption(quote);
                apply(next);
                setActiveId(next.options[next.options.length - 1].id);
              }}
            >
              + Add option
            </button>
          </nav>

          {option && t ? (
            <>
              <section className="card">
                <div className="ohead">
                  <div className="oname">
                    <TextCell className="in title" value={option.name} label="Option name" placeholder="Option name" onCommit={(v) => apply(updateOption(quote, option.id, { name: v }))} />
                  </div>
                  <textarea
                    key={`${option.id}:${option.description}`}
                    className="in area"
                    aria-label="Option description"
                    placeholder="What the client gets with this option. This text prints on the quote."
                    defaultValue={option.description}
                    onBlur={(e) => {
                      if (e.currentTarget.value !== option.description) apply(updateOption(quote, option.id, { description: e.currentTarget.value }));
                    }}
                  />
                  <div className="obar">
                    <label className="check-in">
                      <input type="checkbox" checked={option.recommended} onChange={(e) => apply(updateOption(quote, option.id, { recommended: e.target.checked }))} /> Recommended
                    </label>
                    <span className="spacer" />
                    <button
                      className="btn small"
                      onClick={() => {
                        const next = duplicateOption(quote, option.id);
                        apply(next);
                        setActiveId(next.options[next.options.findIndex((o) => o.id === option.id) + 1].id);
                      }}
                    >
                      Duplicate option
                    </button>
                    <button
                      className="btn small danger"
                      onClick={() => {
                        if (!window.confirm(`Delete "${option.name || "this option"}" and its ${option.lines.length} lines?`)) return;
                        const next = removeOption(quote, option.id);
                        apply(next);
                        setActiveId(next.options[0]?.id ?? null);
                      }}
                    >
                      Delete option
                    </button>
                  </div>
                </div>

                <div className="tbl-wrap">
                  <table className="items edit">
                    <thead>
                      <tr>
                        <th className="idx">#</th>
                        <th>Item</th>
                        <th>Contractor</th>
                        <th className="r">Quantity</th>
                        <th className="r">Unit cost</th>
                        <th className="r">Unit price</th>
                        <th className="r">Margin</th>
                        <th className="r">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionsShown.length === 0 && (
                        <tr>
                          <td colSpan={8} className="empty">No lines yet. Pick a type of work below to add the first one.</td>
                        </tr>
                      )}
                      {sectionsShown.flatMap((s) => {
                        const lines = option.lines.filter((l) => sectionOf(l) === s);
                        const sum = lines.reduce((a, l) => a + (lineTotal(l) ?? 0), 0);
                        return [
                          <tr className="sect" key={`s-${s}`}>
                            <td colSpan={7}>
                              {s}{" "}
                              <button className="addinline" onClick={() => setPicking(s)}>+ Add</button>
                            </td>
                            <td className="r">{money(sum)}</td>
                          </tr>,
                          ...lines.map(row),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="addbar">
                  <span className="lbl">Add work</span>
                  {WORK_SECTIONS.map((s) => (
                    <button key={s} className="chip-btn" onClick={() => setPicking(s)}>{s}</button>
                  ))}
                </div>
              </section>

              <div className="duo">
                <section className="card">
                  <div className="card-h">Exclusions</div>
                  <div className="card-b notes">
                    {exclusions.length === 0 && <p className="faint">None yet.</p>}
                    {exclusions.map((x) => (
                      <div className="excl" key={x.id}>
                        <TextCell className="in" value={x.description} label="Exclusion" onCommit={(v) => apply(updateLine(quote, option.id, x.id, { description: v }))} />
                        <button className="iconbtn danger" aria-label="Remove exclusion" onClick={() => apply(removeLine(quote, option.id, x.id))}>✕</button>
                      </div>
                    ))}
                    <form
                      className="excl"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!newExclusion.trim()) return;
                        apply(addLine(quote, option.id, exclusionLine(newExclusion.trim())));
                        setNewExclusion("");
                      }}
                    >
                      <input className="in" placeholder="e.g. Appliance removal, by others" value={newExclusion} onChange={(e) => setNewExclusion(e.target.value)} aria-label="New exclusion" />
                      <button className="btn small">Add</button>
                    </form>
                  </div>
                </section>

                <section className="card">
                  <div className="card-h">Quote overview</div>
                  <div className="ov-row bullet"><span className="k">Pre-discount</span><span className="v">{money(t.preDiscount)}</span></div>
                  <div className="ov-row bullet"><span className="k">Discount ({pct(quote.discountRate * 100, 0)})</span><span className="v">{money(t.discount)}</span></div>
                  <div className="ov-row bullet"><span className="k">Subtotal</span><span className="v">{money(t.subtotal)}</span></div>
                  <div className="ov-row bullet"><span className="k">HST{quote.showHst ? " (13%)" : " (off)"}</span><span className="v">{money(t.hst)}</span></div>
                  <div className="ov-total"><span>Total</span><span className="v">{money(t.total)}</span></div>
                </section>
              </div>
            </>
          ) : (
            <section className="card">
              <p className="empty">No options. Use “+ Add option” to start one.</p>
            </section>
          )}

          <div className="actions">
            <button className="btn" onClick={discard} disabled={!changed && !restoredAt}>Discard changes</button>
            <span className="saveas">
              <select className="in" value={basis} onChange={(e) => setBasis(e.target.value)} aria-label="Basis of the new version" disabled={saving}>
                {BASES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <button className={`btn${isDraft ? "" : " primary"}`} onClick={saveAsNew} disabled={saving}>
                {saving ? "Saving…" : "Save as new version"}
              </button>
            </span>
            {isDraft && (
              <button className="btn primary" onClick={save} disabled={saving || !changed}>
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
          {saveError && (
            <p className="card banner bad save-error" role="alert">
              {saveError.message}
            </p>
          )}
        </div>

        {option && t && <Financials lines={option.lines} t={t} discountRate={quote.discountRate} showHst={quote.showHst} agrees={null} />}
      </div>

      {picking && option && (
        <Picker
          section={picking}
          catalogue={catalogue}
          onClose={() => setPicking(null)}
          onPick={(line) => {
            apply(addLine(quote, option.id, line));
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
