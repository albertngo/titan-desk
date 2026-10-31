"use client";

import Link from "next/link";
import { addChoices, sectionLinesInOrder, stairGroupLabel, stairGroups, type AddChoice } from "@/lib/editor/stairGroups";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { quickFormAction, quickOptionAction, saveAsNewVersionAction, saveVersionAction } from "@/app/q/[id]/edit/actions";
import { estimateWork, initialWork, QuickWork, workInput, type WorkState } from "@/components/QuickWork";
import type { QuickChoice, QuickProfile } from "@/lib/quick/plan";
import { Financials } from "@/components/Financials";
import { DEFAULT_PRIVATE_LABEL, PRIVATE_SECTION, SECTIONS, isPriced, lineCost, lineFlags, lineTotal, optionTotals, privateRollup, sectionOf, stageAmounts } from "@/lib/calc";
import { manualLine,
  UOMS,
  addLine,
  addLines,
  addBuiltOption,
  addOption,
  buildCatalogue,
  compareCrews,
  crewState,
  duplicateOption,
  entryFor,
  exclusionLine,
  materialChoices,
  parseNum,
  removeLine,
  removeOption,
  revertLine,
  setContractor,
  setCrew,
  setMaterial,
  setMaterialFigures,
  materialSplit,
  setServiceLevel,
  setAcceptedPrice,
  setDiscountAmount,
  setSchedule,
  setTerms,
  showsWaste,
  withCustomerFrom,
  updateLine,
  updateOption,
  type EditorLine,
  type EditorQuote,
  draftKey,
} from "@/lib/editor/model";
import { ghlContactUrl } from "@/lib/ghl/ids";
import { fixAddressLink } from "@/lib/link/linkJob";
import { money, pct, rate } from "@/lib/format";
import type { RateCard } from "@/lib/quotes/types";
import { optionScope, PARTS, partValue, scopeGroups } from "@/lib/quotes/scope";
import { Picker } from "./Picker";
import { ScheduleEditor } from "./ScheduleEditor";
import { SwapOption } from "./SwapOption";
import type { SwapSource } from "@/lib/change/swap";
import { defaultSchedule, suggestsMaterialDeposit } from "@/lib/pricing/schedule";
import { levelApplies, levelOf, PREMIUM_MARKUP, SERVICE_LEVELS } from "@/lib/pricing/service";

const WORK_SECTIONS = SECTIONS.filter((s) => s !== "Exclusions");

/** `base` is the fingerprint of what Airtable held when the draft was started; saving checks it still does. */
type Draft = { savedAt: string; quote: EditorQuote; base?: string };

/** The version being edited, as the edit page read it from Airtable. */
export type EditorVersion = {
  id: string;
  label: string | null;
  version: number | null;
  status: string | null;
  basis: string | null;
  base: string;
  /** A change after acceptance (2026-10-27): its number and the total (with HST) of the contract it changes. */
  change?: { no: number; contractTotal: number | null } | null;
  /** The accepted (or won) quote (2026-10-27): never copied into a new version; it changes only through Make a change. */
  agreed?: boolean;
};

const BASES = ["Preliminary", "Measured"] as const;

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

export default function Editor({
  initial,
  card,
  backHref,
  version,
  customer,
  swap = null,
  swapTo = null,
}: {
  initial: EditorQuote;
  card: RateCard;
  backHref: string;
  version: EditorVersion;
  /** Customer view: no cost, margin, contractor, card rate or flags on screen. */
  customer: boolean;
  /** Swap option (2026-10-30): on a draft change, the accepted version's other options; null otherwise. */
  swap?: SwapSource | null;
  /** Put on contract (2026-10-30): the option to start the swap with, opened and chosen. */
  swapTo?: string | null;
}) {
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
  const [picking, setPicking] = useState<AddChoice | null>(null);
  const [newExclusion, setNewExclusion] = useState("");
  /** + From quick form (2026-10-31): the preliminary's screen, opened beside the tabs to build one more option. */
  const [quick, setQuick] = useState<{ choices: QuickChoice[]; profiles: QuickProfile[]; work: WorkState } | "loading" | null>(null);
  const [quickNote, setQuickNote] = useState<string | null>(null);
  const [addingQuick, startQuick] = useTransition();

  // The rate card and the stair items, for the picker and for re-pricing (service level, contractor, material).
  const catalogue = useMemo(() => buildCatalogue(card.rates, card.stairs, card.materials), [card]);
  const pricing = catalogue;
  const [levelNote, setLevelNote] = useState<string | null>(null);
  const [crewNote, setCrewNote] = useState<string | null>(null);
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
  // What this option would cost with each crew (lines set by hand stay as they are).
  const crews = useMemo(() => (option && !customer ? compareCrews(quote, option.id, pricing) : []), [quote, option, pricing, customer]);

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

  // Customer view leaves the Private section out and shows its total as one row in Other (2026-10-22).
  const hidden = option && customer ? privateRollup(option.lines) : 0;
  const sectionsShown: string[] = option
    ? WORK_SECTIONS.filter((s) => (customer && s === PRIVATE_SECTION ? false : option.lines.some((l) => sectionOf(l) === s) || (s === "Other" && hidden > 0)))
    : [];
  if (option?.lines.some((l) => sectionOf(l) === "Unsorted")) sectionsShown.push("Unsorted");
  const exclusions = option ? option.lines.filter((l) => l.section === "Exclusions") : [];

  let n = 0;
  const numberOf = new Map<string, number>();
  if (option) for (const s of sectionsShown) for (const l of sectionLinesInOrder(s, option.lines.filter((x) => sectionOf(x) === s))) if (isPriced(l) && l.include) numberOf.set(l.id, ++n);

  // How a line stands against the option's crew: set by hand (with a way back), or not theirs to do.
  const crewMark = (l: EditorLine) => {
    if (!option?.crew) return null;
    const st = crewState(l, option.crew, pricing);
    if (st === "hand")
      return (
        <span className="crew-mark">
          set by hand{" "}
          <button type="button" className="linkbtn" onClick={() => apply(setContractor(quote, option.id, l.id, option.crew!, pricing))}>
            back to {option.crew}
          </button>
        </span>
      );
    if (st === "cannot") return <span className="crew-mark warn">no {option.crew} rate</span>;
    return null;
  };

  const row = (l: EditorLine) => {
    if (!option) return null;
    const total = lineTotal(l);
    const cost = lineCost(l);
    const flags = lineFlags(l);
    const entry = entryFor(l, catalogue);
    const contractors = entry && entry.kind === "rate" ? entry.contractors : [];
    const mat = materialChoices(l, pricing);
    const split = mat.current ? materialSplit(l, pricing, levelOf(option)) : null;
    const setMat = (patch: { price?: number | null; cost?: number | null }) => apply(setMaterialFigures(quote, option.id, l.id, patch, pricing));
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
          {mat.choices.length > 1 && (
            <label className="mat">
              Material
              <select className="cell-in" value={mat.current?.id ?? ""} onChange={(e) => apply(setMaterial(quote, option.id, l.id, e.target.value, pricing))}>
                {mat.choices.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {money(m.price)}/{l.uom ?? "unit"}
                    {!customer ? ` · cost ${money(m.cost)}` : ""}
                    {m.id === mat.base?.id ? " (standard)" : ""}
                  </option>
                ))}
              </select>
            </label>
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
          {!customer && flags.length > 0 && <div>{flags.map((f) => <span key={f} className={`flag ${f}`}>{f}</span>)}</div>}
        </td>
        {!customer && (
          <td>
            {contractors.length > 1 ? (
              <select
                className="cell-in"
                aria-label="Contractor"
                value={l.contractor ?? ""}
                onChange={(e) => apply(setContractor(quote, option.id, l.id, e.target.value, pricing))}
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
            {crewMark(l)}
          </td>
        )}
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
          {showsWaste(l) && (
            <div className="wastein">
              <NumCell value={l.waste === null ? null : Math.round(l.waste * 1000) / 10} label="Waste percent" placeholder="waste %" onCommit={(v) => upd({ waste: v === null ? null : v / 100 })} />
            </div>
          )}
        </td>
        {!customer && (
          <td className="r">
            <NumCell value={l.costOverride} label="Unit cost" placeholder={l.unitCostSnap !== null ? rate(l.unitCostSnap) : "cost"} onCommit={(v) => upd({ costOverride: v })} />
            {l.unitCostSnap !== null && <span className="sub">card {money(l.unitCostSnap)}</span>}
            {split && (
              <div className="matin" title="The material's cost per unit, on top of the labour. Blank follows the card.">
                <NumCell value={split.cost} label="Material unit cost" placeholder={rate(split.cardCost)} onCommit={(v) => setMat({ cost: v })} />
                <span className="sub">material · labour {money(split.labourCost)}</span>
              </div>
            )}
          </td>
        )}
        <td className="r">
          <NumCell value={l.unitPrice} label="Unit price" placeholder={l.unitPriceSnap !== null ? rate(l.unitPriceSnap) : "price"} onCommit={(v) => upd({ unitPrice: v })} />
          {!customer && l.unitPriceSnap !== null && (
            <span className="sub">
              {levelOf(option) === "Premium" && levelApplies(l) ? `card +${Math.round(PREMIUM_MARKUP * 100)}%` : "card"} {money(l.unitPriceSnap)}
            </span>
          )}
          {split && (
            <div className="matin" title="The material's price per unit, on top of the labour. Blank follows the card.">
              <NumCell value={split.price} label="Material unit price" placeholder={rate(split.cardPrice)} onCommit={(v) => setMat({ price: v })} />
              {!customer && <span className="sub">material · labour {money(split.labourPrice)}</span>}
            </div>
          )}
        </td>
        {!customer && <td className="r muted">{pct(margin, 0)}</td>}
        <td className="r amt">
          {l.include ? money(total) : <span className="note">optional</span>}
          <label className="inc" title="Untick to show this line as an optional extra, outside the total.">
            <input type="checkbox" checked={l.include} onChange={(e) => upd({ include: e.target.checked })} /> in total
          </label>
          {sectionOf(l) === "Materials" && (
            <label className="inc" title="A material's own HST: the quote's Charge HST switch never changes it.">
              <input type="checkbox" checked={!l.noHst} onChange={(e) => upd({ noHst: !e.target.checked })} /> HST
            </label>
          )}
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
            {isDraft
              ? "Changes are kept on this device until you save."
              : version.agreed || version.change
                ? `This version is ${version.status ?? "locked"}. To change what was agreed, use Make a change on the quote page.`
                : `This version was sent (${(version.status ?? "locked").toLowerCase()}), so it stays as the customer saw it: saving starts the next draft, with every option carried over.`}
          </p>
          {version.change && (
            <p className="change-note">
              Change {version.change.no} to the accepted quote. Edit the work as usual; the customer gets it as an updated quote, for their records, and the payment schedule is worked out again on the new total.
              {" "}New work (a basement, an extra) can go on the first option or as another option after it: everything on a change is part of the project when it is sent, for the record, with nothing for the customer to accept.
              {version.change.contractTotal !== null && option && t && quote.options.length === 1 && (
                <span className={`chip ${t.total >= version.change.contractTotal ? "accent" : "warn"}`}>
                  vs contract: {t.total - version.change.contractTotal >= 0 ? "+" : "−"}
                  {money(Math.abs(t.total - version.change.contractTotal))} with HST
                </span>
              )}
            </p>
          )}
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
          {/* Swap option (2026-10-30): the customer changed their mind on which option; sent for record like any change. */}
          {isDraft && version.change && swap && option && (
            <SwapOption source={swap} quote={quote} option={option} contractTotal={version.change.contractTotal} apply={apply} preselect={swapTo} />
          )}
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
                  {(() => {
                    // A confirmed site is fixed on the opportunity, not the contact: point the right way.
                    const fix = fixAddressLink(quote);
                    return fix && fix.href !== (quote.ghlContactId ? ghlContactUrl(quote.ghlContactId) : null) ? (
                      <>
                        {" · "}
                        <a href={fix.href} target="_blank" rel="noreferrer" title={fix.hint}>
                          Fix address ↗
                        </a>
                      </>
                    ) : null;
                  })()}
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
              <label title="Prints beside the Discount row on the customer's page and PDF, e.g. “Fall promotion”.">
                Discount reason
                <TextCell value={quote.discountReason ?? ""} placeholder="e.g. Fall promotion" label="Discount reason" onCommit={(v) => apply(setTerms(quote, { discountReason: v.trim() || null }))} />
              </label>
              <label className="check-in" title="Labour and everything else. Each material line has its own HST box, which this never changes.">
                <input type="checkbox" checked={quote.showHst} onChange={(e) => apply(setTerms(quote, { showHst: e.target.checked }))} /> Charge HST (13%)
              </label>
              {/* The payment schedule (Albert, 2026-10-27): one per version, frozen when it is sent. */}
              <ScheduleEditor
                schedule={quote.schedule ?? null}
                onChange={(next) => apply(setSchedule(quote, next))}
                suggestMaterials={quote.options.some((o) => suggestsMaterialDeposit(o.lines, quote.showHst))}
                amounts={option && t ? stageAmounts(quote.schedule ?? defaultSchedule(), option.lines, quote.discountRate, quote.showHst, t.total) : []}
              />
            </div>
          </section>

          <nav className="tabs" aria-label="Options">
            {scopeGroups(quote.options).groups.map((g, i, all) => (
              <Fragment key={g.scope}>
                {i > 0 && <span className="tab-sep" aria-hidden />}
                {all.length > 1 && <span className="tab-scope">{g.scope}</span>}
                {g.options.map((o) => (
                  <button key={o.id} className={o.notOffered ? "tab off" : "tab"} aria-current={option?.id === o.id ? "page" : undefined} onClick={() => setActiveId(o.id)} title={o.notOffered ? "Not offered: never sent to the customer" : undefined}>
                    {o.notOffered && <span className="t-off">Not offered</span>}
                    {o.part && <span className="t-part">{o.part}</span>}
                    <span className="t-name">{o.name || "Untitled"}</span>
                    <span className="t-amt">{money(optionTotals(o.lines, quote.discountRate, quote.showHst).total)}</span>
                  </button>
                ))}
              </Fragment>
            ))}
            {quote.options.length > 0 && <span className="tab-sep" aria-hidden />}
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
            <button
              className="tab"
              aria-expanded={quick !== null}
              disabled={quick === "loading"}
              title="Build an option with the preliminary's quick form"
              onClick={() => {
                setQuickNote(null);
                if (quick !== null) return setQuick(null);
                setQuick("loading");
                startQuick(async () => {
                  const f = await quickFormAction().catch(() => null);
                  if (!f || f.choices.length === 0) {
                    setQuick(null);
                    setQuickNote("The quick form couldn't be opened. Try again in a moment.");
                  } else setQuick({ ...f, work: initialWork(f.choices) });
                });
              }}
            >
              {quick === "loading" ? "Opening…" : "+ From quick form"}
            </button>
          </nav>

          {quickNote && <div className="banner warn" role="status">{quickNote}</div>}
          {quick !== null && quick !== "loading" && (() => {
            const est = estimateWork(quick.choices, quick.profiles, quick.work);
            return (
              <section className="card ed-quick" aria-label="New option from the quick form">
                <div className="card-h">
                  New option from the quick form
                  <span className="right">{est.lines > 0 ? `${est.name} · ${money(est.total)} before discount and HST` : "Pick the work"}</span>
                </div>
                <div className="card-b">
                  <QuickWork choices={quick.choices} profiles={quick.profiles} value={quick.work} onChange={(w) => setQuick({ ...quick, work: w })} quoteWide="hidden" />
                  <div className="ed-quick-foot">
                    <button type="button" className="btn" onClick={() => setQuick(null)} disabled={addingQuick}>Cancel</button>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={addingQuick || est.lines === 0}
                      onClick={() =>
                        startQuick(async () => {
                          const r = await quickOptionAction(workInput(quick.work), quote.options.map((o) => o.name));
                          if (!r.ok) return setQuickNote(r.message);
                          const next = addBuiltOption(quote, r.option);
                          apply(next);
                          setActiveId(next.options[next.options.length - 1].id);
                          setQuick(null);
                          setQuickNote(r.skipped.length ? `Added. Left out: ${r.skipped.join("; ")}.` : null);
                        })
                      }
                    >
                      {addingQuick ? "Adding…" : "Add this option"}
                    </button>
                  </div>
                </div>
              </section>
            );
          })()}

          {option && t ? (
            <>
              {option.notOffered && <p className="no-offer-banner" role="note"><b>Not offered.</b> This option stays on the quote but is never sent to the customer. Untick Not offered below to send it.</p>}
              <section className={option.notOffered ? "card no-offer-card" : "card"}>
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
                    {/* Flooring or stairs (2026-10-28): the customer takes up to one option of each. Auto reads the lines. */}
                    <label className="check-in" title="A customer accepts at most one option of each scope. Auto: Stairs when every priced line is a stair line.">
                      Scope{" "}
                      <select
                        className="in"
                        aria-label="Scope"
                        value={option.scope ?? ""}
                        onChange={(e) => apply(updateOption(quote, option.id, { scope: e.target.value === "Flooring" || e.target.value === "Stairs" ? e.target.value : null }))}
                      >
                        <option value="">Auto ({optionScope({ ...option, scope: null })})</option>
                        <option value="Flooring">Flooring</option>
                        <option value="Stairs">Stairs</option>
                      </select>
                    </label>
                    {/* The part of the home (2026-10-30): options in one Part are alternatives; the customer takes one per Part. */}
                    <label className="check-in" title="Options in one Part are alternatives: the customer takes one per Part. Say exactly what it covers in the description.">
                      Part{" "}
                      <select
                        className="in"
                        aria-label="Part"
                        value={option.part ?? ""}
                        onChange={(e) => apply(updateOption(quote, option.id, { part: partValue(e.target.value) }))}
                      >
                        <option value="">None ({optionScope({ ...option, part: null })})</option>
                        {PARTS.map((p) => (
                          <option key={p.part} value={p.part}>
                            {p.part}
                          </option>
                        ))}
                      </select>
                    </label>
                    {/* Kept on the quote, left off what the customer is sent (2026-10-30). */}
                    <label className="check-in" title="Kept on the quote but left off what the customer is sent. Untick to offer it again.">
                      <input type="checkbox" checked={option.notOffered === true} onChange={(e) => apply(updateOption(quote, option.id, { notOffered: e.target.checked }))} /> Not offered
                    </label>
                    {!customer && (
                      <div className="lvl" role="radiogroup" aria-label="Service level">
                        {SERVICE_LEVELS.map((lv) => (
                          <button
                            key={lv}
                            type="button"
                            role="radio"
                            aria-checked={levelOf(option) === lv}
                            className={levelOf(option) === lv ? "on" : undefined}
                            onClick={() => {
                              if (levelOf(option) === lv) return;
                              const r = setServiceLevel(quote, option.id, lv, pricing);
                              apply(r.quote);
                              setLevelNote(
                                r.notRepriced.length
                                  ? `${r.notRepriced.length} line${r.notRepriced.length === 1 ? "" : "s"} kept ${r.notRepriced.length === 1 ? "its" : "their"} price: the Rate Card row is gone (${r.notRepriced.map((l) => l.description).join(", ")}).`
                                  : null,
                              );
                            }}
                          >
                            {lv}
                            {lv === "Premium" && <span className="pct">+{Math.round(PREMIUM_MARKUP * 100)}%</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {!customer && crews.length > 0 && (
                      <label className="crew">
                        Crew
                        <select
                          className="in"
                          value={option.crew ?? ""}
                          onChange={(e) => {
                            const r = setCrew(quote, option.id, e.target.value || null, pricing);
                            apply(r.quote);
                            const said = [
                              r.kept.length ? `${r.kept.length} line${r.kept.length === 1 ? " was" : "s were"} set by hand and kept (${r.kept.map((l) => l.description).join(", ")}).` : null,
                              r.cannot.length ? `${e.target.value} has no rate for ${r.cannot.map((l) => l.description).join(", ")}; ${r.cannot.length === 1 ? "it keeps its" : "they keep their"} contractor.` : null,
                            ].filter(Boolean);
                            setCrewNote(said.length ? said.join(" ") : null);
                          }}
                        >
                          <option value="">None (pick per line)</option>
                          {crews.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name} · cost {money(c.cost)} · {pct(c.marginPct, 1) || "no margin"}
                              {c.cannot ? ` · can't do ${c.cannot}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
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
                  {levelNote && !customer && (
                    <p className="lvl-note" role="status">
                      {levelNote}
                    </p>
                  )}
                  {crewNote && !customer && (
                    <p className="lvl-note" role="status">
                      {crewNote}
                    </p>
                  )}
                </div>

                <div className="tbl-wrap">
                  <table className="items edit">
                    <thead>
                      <tr>
                        <th className="idx">#</th>
                        <th>Item</th>
                        {!customer && <th>Contractor</th>}
                        <th className="r">Quantity</th>
                        {!customer && <th className="r">Unit cost</th>}
                        <th className="r">Unit price</th>
                        {!customer && <th className="r">Margin</th>}
                        <th className="r">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionsShown.length === 0 && (
                        <tr>
                          <td colSpan={customer ? 5 : 8} className="empty">No lines yet. Pick a type of work below to add the first one.</td>
                        </tr>
                      )}
                      {sectionsShown.flatMap((s) => {
                        const lines = option.lines.filter((l) => sectionOf(l) === s);
                        const rollup = s === "Other" && hidden > 0 ? hidden : 0;
                        const sum = lines.reduce((a, l) => a + (lineTotal(l) ?? 0), 0) + rollup;
                        return [
                          <tr className="sect" key={`s-${s}`}>
                            <td colSpan={customer ? 4 : 7}>
                              {s}{" "}
                              {/* The inline Add follows the option's scope (2026-10-30): a stairs option adds only to Stairs and Private (stair items or typed), a flooring option never to Stairs. */}
                              {(optionScope(option) === "Stairs" ? s === "Stairs" || s === PRIVATE_SECTION : s !== "Stairs") && (
                                <button className="addinline" onClick={() => setPicking({ label: s, section: s, ...(optionScope(option) === "Stairs" && s === PRIVATE_SECTION ? { stairsOnly: true as const } : {}) })}>
                                  + Add
                                </button>
                              )}
                              {s === PRIVATE_SECTION && !customer && (
                                <span className="priv-as" title="These lines are never itemised for the customer. On the page, the PDF and the email they roll up into one row in Other with this name and their total.">
                                  Not itemised for the customer. Shown as{" "}
                                  <TextCell
                                    value={option.privateLabel ?? ""}
                                    placeholder={DEFAULT_PRIVATE_LABEL}
                                    label="Private section, shown to the customer as"
                                    className="cell-in mini"
                                    onCommit={(v) => apply(updateOption(quote, option.id, { privateLabel: v.trim() || null }))}
                                  />
                                </span>
                              )}
                            </td>
                            <td className="r">{money(sum)}</td>
                          </tr>,
                          // Stairs grouped by the Stair Item's Category (2026-10-28), a small heading over each group.
                          ...(s === "Stairs"
                            ? stairGroups(lines).flatMap((g) => [
                                ...(g.heading
                                  ? [
                                      <tr className="subsect" key={`g-${g.group ?? "other"}`}>
                                        <td colSpan={customer ? 5 : 8}>{stairGroupLabel(g.group)}</td>
                                      </tr>,
                                    ]
                                  : []),
                                ...g.lines.map(row),
                              ])
                            : lines.map(row)),
                          ...(rollup > 0
                            ? [
                                <tr key="private-rollup">
                                  <td className="idx">{numberOf.size + 1}</td>
                                  <td>{option.privateLabel ?? DEFAULT_PRIVATE_LABEL}</td>
                                  <td className="r">—</td>
                                  <td className="r">—</td>
                                  <td className="r"><b>{money(rollup)}</b></td>
                                </tr>,
                              ]
                            : []),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="addbar">
                  <span className="lbl">Add work</span>
                  {/* A stairs option adds Stair Items by category (2026-10-30); a flooring option everything but Stairs. */}
                  {addChoices(optionScope(option), card.stairs.map((x) => x.category), WORK_SECTIONS.filter((s) => !(customer && s === PRIVATE_SECTION)))
                    .map((c) => (
                      <button
                        key={`${c.section}:${c.category ?? c.label}`}
                        className="chip-btn"
                        onClick={() => (c.typed ? apply(addLine(quote, option.id, manualLine(c.section))) : setPicking(c))}
                        title={c.typed ? "A line you type, with your own price" : undefined}
                      >
                        {c.label}
                      </button>
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
                  <div className="ov-row bullet"><span className="k">HST{quote.showHst ? " (13%)" : t.hst ? " (materials only)" : " (off)"}</span><span className="v">{money(t.hst)}</span></div>
                  <div className="ov-total"><span>Total</span><span className="v">{money(t.total)}</span></div>
                  {/* "They accept this price": type the pre-tax amount and the quote's discount is set to land on it (Albert, 2026-10-22). */}
                  <div className="ov-accept" title="Below the list price this sets the quote's discount, one per quote, so every option follows it. Above it, the difference goes in as a private line the customer sees as one row in Other.">
                    <div className="ov-accept-in">
                      <label>
                        Accepted price, before HST
                        <NumCell value={t.subtotal} label="Accepted price before HST" placeholder="0" onCommit={(v) => apply(setAcceptedPrice(quote, option.id, v))} />
                      </label>
                      <label>
                        or $ off
                        <NumCell value={t.discount === 0 ? null : -t.discount} label="Discount in dollars" placeholder="0" onCommit={(v) => apply(setDiscountAmount(quote, option.id, v))} />
                      </label>
                    </div>
                    <span className="mt">
                      {t.preDiscount > 0 ? (
                        <>
                          List price {money(t.preDiscount)}. Below it sets the discount{quote.options.length > 1 ? ", which every option follows" : ""}; above it adds a private line for the difference, shown to the customer as one row.
                        </>
                      ) : (
                        "Nothing priced yet."
                      )}
                    </span>
                  </div>
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
            {/* One working quote (2026-10-30): no Save as new version. A sent version saves as the next draft;
                a change, or the agreed quote, is never copied into an ordinary version (2026-10-27): Make a change is the way. */}
            {!isDraft && !version.change && !version.agreed && (
            <span className="saveas">
              <select className="in" value={basis} onChange={(e) => setBasis(e.target.value)} aria-label="The next draft is" title="Whether the next draft is a preliminary or a measured quote" disabled={saving}>
                {BASES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <button className="btn primary" onClick={saveAsNew} disabled={saving || !changed}>
                {saving ? "Saving…" : "Save as the next draft"}
              </button>
            </span>
            )}
            {!isDraft && (version.change || version.agreed) && (
              <Link href={backHref} className="btn primary">
                Back to the quote
              </Link>
            )}
            {isDraft && (
              <button className="btn primary" onClick={save} disabled={saving || !changed}>
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
          {saveError && (
            <p className="card banner bad save-error" role="alert">
              {saveError.message}
              {/* Airtable moved on under this draft: keep this device's work as the next draft, and the other becomes Superseded. */}
              {saveError.conflict && !version.change && !version.agreed && (
                <>
                  {" "}
                  <button type="button" className="btn" onClick={saveAsNew} disabled={saving}>
                    Save mine as the next draft
                  </button>
                </>
              )}
            </p>
          )}
        </div>

        {option && t && <Financials schedule={quote.schedule ?? null} lines={option.lines} t={t} discountRate={quote.discountRate} showHst={quote.showHst} agrees={null} customer={customer} />}
      </div>

      {picking && option && (
        <Picker
          section={picking.section}
          category={picking.category ?? null}
          stairsOnly={picking.stairsOnly === true}
          catalogue={catalogue}
          profiles={card.profiles ?? []}
          profileLines={option.lines.filter((l) => l.sourceKind === "profile").map((l) => ({ id: l.id, sourceId: l.sourceId }))}
          level={levelOf(option)}
          crew={option.crew ?? null}
          onClose={() => setPicking(null)}
          customer={customer}
          onPick={(line) => {
            apply(addLine(quote, option.id, line));
            setPicking(null);
          }}
          onPickMany={(lines, replacing) => {
            apply(addLines(quote, option.id, lines, replacing));
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
