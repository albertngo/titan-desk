"use client";

import Link from "next/link";
import { HstAll } from "./HstAll";
import { addChoices, sectionLinesInOrder, stairGroupLabel, stairGroups, stairSections, type AddChoice } from "@/lib/editor/stairGroups";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AutosaveResult } from "@/lib/quotes/save";
import { autosaveVersionAction, quickFormAction, quickOptionAction, saveAsNewVersionAction, saveVersionAction } from "@/app/q/[id]/edit/actions";
import { estimateWork, glueWait, initialWork, QuickWork, workInput, type WorkState } from "@/components/QuickWork";
import type { QuickChoice, QuickProfile } from "@/lib/quick/plan";
import { methodChoices, switchMethod } from "@/lib/editor/waterfall";
import { sqftCheck, sqftWords } from "@/lib/quotes/sqftCheck";
import { newOptionIds, withFees } from "@/lib/quotes/fees";
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
  setSqftOk,
  materialWords,
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
  settleContractor,
  holdAccepted,
  setSchedule,
  setAllHst,
  setOptionHst,
  showsWaste,
  wasteMath,
  withCustomerFrom,
  updateLine,
  updateOption,
  type EditorLine,
  type EditorQuote,
  draftKey,
  distinctIds,
  invertIds,
  renameIds,
} from "@/lib/editor/model";
import { ghlContactUrl } from "@/lib/ghl/ids";
import { fixAddressLink } from "@/lib/link/linkJob";
import { money, pct, rate } from "@/lib/format";
import type { RateCard } from "@/lib/quotes/types";
import { STAIRS_FOLDED, optionScope, PARTS, partValue, scopeGroups } from "@/lib/quotes/scope";
import { Picker } from "./Picker";
import { ScheduleEditor } from "./ScheduleEditor";
import { SwapOption } from "./SwapOption";
import type { SwapSource } from "@/lib/change/swap";
import { scheduleFlags, shownStage } from "@/lib/pricing/schedule";
import { SAND_DISCLAIMER, sandFlag, sandRole } from "@/lib/editor/sandRule";
import { EditorSend } from "@/components/editor/EditorSend";
import { quoteSchedule } from "@/lib/send/copy";
import { levelApplies, levelOf, PREMIUM_MARKUP, SERVICE_LEVELS } from "@/lib/pricing/service";
import { CONTRACTOR_DISCOUNT, DISCOUNTS_SECTION, priceSummary } from "@/lib/pricing/discounts";
import { PriceCard } from "./PriceCard";

// Discount items live in the price card, never in the line tables (2026-11-04).
const WORK_SECTIONS = SECTIONS.filter((s) => s !== "Exclusions" && s !== DISCOUNTS_SECTION);

/** `base` is the fingerprint of what Airtable held when the draft was started; saving checks it still does. */
type Draft = { savedAt: string; quote: EditorQuote; base?: string };

/** Autosave (2026-11-05): how long after the last change a Draft saves itself, and how long it waits to try again offline. */
const AUTOSAVE_AFTER_MS = 4000;
const AUTOSAVE_RETRY_MS = 30_000;
/** `paused`: a save was refused. A conflict holds autosave until someone acts; anything else, until the next edit. */
type AutoState = { state: "idle" } | { state: "saving" } | { state: "saved"; at: string } | { state: "offline" } | { state: "paused"; conflict: boolean; on: string };

/** A quantity for the waste math: whole numbers bare, else up to two decimals, with thousands commas. */
const fmtQty = (n: number) => n.toLocaleString("en-CA", { maximumFractionDigits: 2 });

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });

/** The header's one line on where the work is: saving, saved to Airtable, or only on this device and why. */
function statusWords({ changed, autoOn, auto, keptAt }: { changed: boolean; autoOn: boolean; auto: AutoState; keptAt: string | null }): string {
  const kept = keptAt ? ` · kept ${clock(keptAt)}` : "";
  if (autoOn && auto.state === "saving") return "Saving…";
  if (!changed) return autoOn && auto.state === "saved" ? `Saved ${clock(auto.at)}` : "No changes";
  if (!autoOn) return `Unsaved changes${kept}`;
  if (auto.state === "offline") return `Offline: kept on this device${kept}`;
  if (auto.state === "paused") return `Not saved: see below${kept}`;
  return `Unsaved changes${kept}`;
}

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
  sendCard = null,
  lastWay = null,
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
  /** The Send card (2026-11-06), drawn on the server as on the quote page; null in Customer view. */
  sendCard?: ReactNode;
  /** How the last version was sent (2026-11-07): the Private note's switch starts on it. */
  lastWay?: "lump" | "itemised" | "range" | "exact" | null;
}) {
  const router = useRouter();
  const key = draftKey(initial);
  const [boot] = useState(() => loadDraft(key));
  // A restored draft keeps the base it was started from, so a save can tell if Airtable moved on since.
  // Each autosave moves it on to what Airtable holds after it (2026-11-05).
  const [base, setBase] = useState<string>(() => (boot ? (boot.base ?? "unknown") : version.base));
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
  /** The waterfall families (2026-11-06), for the Add search and each line's Method; fetched once, after the editor draws. */
  const [families, setFamilies] = useState<QuickChoice[] | null>(null);
  const wantsFamilies = families === null;
  useEffect(() => {
    if (!wantsFamilies) return;
    let live = true;
    quickFormAction()
      .then((f) => live && setFamilies(f.choices))
      .catch(() => live && setFamilies([]));
    return () => {
      live = false;
    };
  }, [wantsFamilies]);
  const [addingQuick, startQuick] = useTransition();

  // The rate card and the stair items, for the picker and for re-pricing (service level, contractor, material).
  const catalogue = useMemo(() => buildCatalogue(card.rates, card.stairs, card.materials), [card]);
  const pricing = catalogue;
  /** This version is measured (2026-11-06): its new flooring options start with the delivery fee. */
  const measured = version.basis !== "Preliminary";
  /** The flooring Private note's switch (look D, 2026-11-07): which way it shows; a preliminary is always a lump sum. */
  const [privWay, setPrivWay] = useState<"breakdown" | "lump">(lastWay === "lump" ? "lump" : "breakdown");
  const privShown = measured && privWay === "breakdown";
  const [levelNote, setLevelNote] = useState<string | null>(null);
  const [holdNote, setHoldNote] = useState<string | null>(null);
  const [crewNote, setCrewNote] = useState<string | null>(null);
  /** What Airtable holds, in its own ids: the version as the editor opened it, then each autosave's read back (2026-11-05). */
  const [saved, setSaved] = useState<EditorQuote>(initial);
  /** The record each line and option the editor made became, by an autosave; the screen keeps its own ids. */
  const [ids, setIds] = useState<Record<string, string>>({});
  /** The editor's quote in Airtable's ids: what is saved, compared and kept on the device. */
  const asSaved = useMemo(() => renameIds(quote, ids), [quote, ids]);
  const changed = useMemo(() => JSON.stringify(asSaved) !== JSON.stringify(saved), [asSaved, saved]);
  const hasSendCard = sendCard !== null && sendCard !== undefined;

  // Keep a draft on this device: closing the tab or losing signal never loses work.
  useEffect(() => {
    if (leaving.current) return;
    try {
      if (changed) window.localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), quote: asSaved, base } satisfies Draft));
      else window.localStorage.removeItem(key);
    } catch {
      // Private browsing or storage full: editing still works, it just is not kept.
    }
  }, [asSaved, changed, key, base]);

  // Autosave (Albert, 2026-11-05): a Draft saves itself a few seconds after the last change, while
  // online. A sent version never does (its save starts the next draft), and a refusal stops it
  // until Save is pressed, so a conflict is never saved over. Offline, the device copy above keeps
  // the work and it tries again when the connection is back.
  const autoOn = isDraft;
  const [auto, setAuto] = useState<AutoState>({ state: "idle" });
  const inFlight = useRef(false);
  const latest = useRef({ quote, ids, base });
  useEffect(() => {
    latest.current = { quote, ids, base };
  }, [quote, ids, base]);

  const autosave = useCallback(async () => {
    if (inFlight.current || leaving.current) return;
    if (navigator.onLine === false) return setAuto({ state: "offline" });
    const own = distinctIds(latest.current.quote);
    if (own !== latest.current.quote) {
      // Two lines sharing an id: give the second its own first, and save on the next round.
      setQuote(own);
      return;
    }
    const { quote: sentQuote, ids: sentIds, base: sentBase } = latest.current;
    inFlight.current = true;
    setAuto({ state: "saving" });
    const sent = renameIds(sentQuote, sentIds);
    let r: AutosaveResult;
    try {
      r = await autosaveVersionAction(version.id, sent, sentBase);
    } catch {
      // The connection dropped: the work is still on this device. The next try finds out whether this one landed.
      inFlight.current = false;
      return setAuto({ state: "offline" });
    }
    inFlight.current = false;
    if (!r.ok) {
      setSaveError({ message: r.message, conflict: Boolean(r.conflict) });
      return setAuto({ state: "paused", conflict: Boolean(r.conflict), on: JSON.stringify(sent) });
    }
    if (!r.fresh) {
      // Saved, but Airtable couldn't be read back: open the editor again from what it holds.
      leaving.current = true;
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Storage unavailable: nothing was kept.
      }
      window.location.assign(`/q/${version.id}/edit`);
      return;
    }
    const nextIds = { ...sentIds, ...r.ids };
    const fresh = withCustomerFrom(r.fresh.quote, initial);
    setSaved(fresh);
    setBase(r.fresh.base);
    setIds(nextIds);
    // Untouched while it saved: show exactly what Airtable has, in the editor's own ids. Edited
    // meanwhile: keep those edits; the next autosave takes them.
    if (latest.current.quote === sentQuote) setQuote(renameIds(fresh, invertIds(nextIds)));
    setRestoredAt(null);
    setSaveError(null);
    setAuto({ state: "saved", at: new Date().toISOString() });
    // The Send card in the editor (2026-11-06) checks the version as Airtable now has it.
    if (hasSendCard) router.refresh();
  }, [version.id, initial, key, hasSendCard, router]);

  // A refusal that wasn't a conflict (a payment schedule that doesn't add up) waits for the edit that fixes it.
  const held = auto.state === "paused" && (auto.conflict || auto.on === JSON.stringify(asSaved));

  useEffect(() => {
    if (!autoOn || !changed || held || saving || auto.state === "saving" || leaving.current) return;
    const t = window.setTimeout(() => void autosave(), auto.state === "offline" ? AUTOSAVE_RETRY_MS : AUTOSAVE_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [autoOn, changed, asSaved, held, saving, auto.state, autosave]);

  // Back online: try again straight away rather than at the next retry.
  useEffect(() => {
    const back = () => setAuto((a) => (a.state === "offline" ? { state: "idle" } : a));
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, []);

  // The Contractor level's 10% follows the list price after every change (2026-11-04).
  const apply = (next: EditorQuote): boolean => {
    // The accepted price is held, firmly (Albert, 2026-11-04): a change that would move it is taken up by
    // the option's accepted discount, and one that could only be held with a markup is refused.
    const r = holdAccepted(quote, settleContractor(next));
    if (r.refused) {
      setHoldNote(
        `Not changed: that would bring ${r.refused.name ? `"${r.refused.name}"` : "this option"} under its accepted price of ${money(r.refused.price)}, and the accepted price never moves on its own. Press Reset in its price card first to change the price.`,
      );
      return false;
    }
    setHoldNote(null);
    setQuote(r.quote);
    setSavedAt(new Date().toISOString());
    return true;
  };

  const option = quote.options.find((o) => o.id === activeId) ?? quote.options[0] ?? null;
  // HST is the option's own (Albert, 2026-11-04), the version's only where the option has none set.
  const hstOn = option ? (option.showHst ?? quote.showHst) : quote.showHst;
  const t = option ? optionTotals(option.lines, quote.discountRate, hstOn) : null;
  // A change is the whole project, every option of it (2026-10-31: options stay apart), so it compares as one sum.
  const changeTotal = version.change ? quote.options.filter((o) => !o.notOffered).reduce((a, o) => a + optionTotals(o.lines, quote.discountRate, (o.showHst ?? quote.showHst)).total, 0) : null;
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

  /** A dropped connection throws rather than answering (2026-11-05): said plainly, never as "Airtable did not answer". */
  const LOST =
    "Lost the connection while saving. Your changes are still on this device. Airtable may or may not have them: open the quote to check before saving again.";

  const save = () => {
    setSaveError(null);
    startSave(async () => {
      try {
        const r = await saveVersionAction(version.id, asSaved, base);
        if (r.ok) done(r.versionId);
        else setSaveError({ message: r.message, conflict: Boolean(r.conflict) });
        // A Save pressed after a refusal takes autosave off hold; it pauses again if this one is refused too.
        if (r.ok || !r.conflict) setAuto({ state: "idle" });
      } catch {
        setSaveError({ message: LOST, conflict: false });
      }
    });
  };

  const saveAsNew = () => {
    setSaveError(null);
    startSave(async () => {
      try {
        // A preliminary saved as the measured next draft (2026-11-06): each flooring option gains the delivery fee.
        const toSave = basis === "Measured" && version.basis === "Preliminary" ? withFees(asSaved, catalogue, true, asSaved.options.filter((o) => optionScope(o) === "Flooring").map((o) => o.id)) : asSaved;
        const r = await saveAsNewVersionAction(version.id, toSave, basis);
        if (r.ok) done(r.versionId);
        else setSaveError({ message: r.message, conflict: false });
      } catch {
        setSaveError({ message: LOST, conflict: false });
      }
    });
  };

  const discard = () => {
    if (!window.confirm("Discard every change on this device and go back to what is in Airtable?")) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage unavailable: nothing was kept, so there is nothing to clear.
    }
    // Back to what Airtable has: as the editor opened it, or as the last autosave left it.
    setQuote(saved);
    setIds({});
    setRestoredAt(null);
    setSavedAt(null);
    setSaveError(null);
    setAuto({ state: "idle" });
    setActiveId(saved.options[0]?.id ?? null);
  };

  // The short lines the sidebar and the folded terms show (Option C, 2026-11-01).
  const termsRef = useRef<HTMLDetailsElement>(null);
  // The version's own schedule, else the automatic one from its HST (2026-11-05).
  // Over the options that go to the customer, as the frozen copy works it out (2026-11-05).
  const autoPlan = useMemo(() => quoteSchedule({ schedule: null, showHst: quote.showHst, discountRate: quote.discountRate, options: quote.options.filter((o) => !o.notOffered) }), [quote.showHst, quote.discountRate, quote.options]);
  const schedule = quote.schedule ?? autoPlan;
  // A schedule that goes against the HST rules is flagged, never stopped (2026-11-05).
  const scheduleWarnings = useMemo(
    () => scheduleFlags(quote.schedule ?? autoPlan, quote.options.filter((o) => !o.notOffered).map((o) => ({ name: o.name, lines: o.lines, showHst: o.showHst ?? quote.showHst, discountRate: quote.discountRate }))),
    [quote.schedule, autoPlan, quote.options, quote.showHst, quote.discountRate],
  );
  const payLine = option && t ? stageAmounts(schedule, option.lines, quote.discountRate, option.showHst ?? quote.showHst, t.total).filter(shownStage).map((x) => x.pct).join(" / ") : "35 / 35 / 30";
  const termsLine = [hstOn ? "HST charged" : "HST off", `payment ${payLine}`].join(" · ");

  // A stairs option always shows Stairs, empty or not, each category with its own add (2026-11-04).
  const stairsOption = !!option && optionScope(option) === "Stairs";
  // Customer view leaves the Private section out and shows its total as one row in Other (2026-10-22). Never on a stairs option.
  const hidden = option && customer && !stairsOption ? privateRollup(option.lines) : 0;
  // A stairs option has no Other section (Albert, 2026-11-06: "just a header separation"): Other is the heading inside
  // Stairs, and a line saved there shows under it. Its Private section came back the same day, staff only (see below).
  const secOf = (l: EditorLine) => (stairsOption && STAIRS_FOLDED.includes(sectionOf(l)) ? "Stairs" : sectionOf(l));
  const stairCats = card.stairs.map((x) => x.category);
  const sectionsShown: string[] = option
    ? WORK_SECTIONS.filter((s) =>
        s === PRIVATE_SECTION && customer
          ? false
          : option.lines.some((l) => secOf(l) === s) || (s === "Other" && hidden > 0) || (stairsOption && (s === "Stairs" || s === PRIVATE_SECTION)),
      )
    : [];
  if (option?.lines.some((l) => sectionOf(l) === "Unsorted")) sectionsShown.push("Unsorted");
  const exclusions = option ? option.lines.filter((l) => l.section === "Exclusions") : [];

  let n = 0;
  const numberOf = new Map<string, number>();
  if (option) for (const s of sectionsShown) for (const l of sectionLinesInOrder(s, option.lines.filter((x) => secOf(x) === s))) if (isPriced(l) && l.include) numberOf.set(l.id, ++n);

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

  const sandFlagOf = (l: EditorLine) => (option ? sandFlag(l, option.lines) : null);

  const row = (l: EditorLine) => {
    if (!option) return null;
    const total = lineTotal(l);
    const cost = lineCost(l);
    const flags = lineFlags(l);
    const entry = entryFor(l, catalogue);
    const contractors = entry && entry.kind === "rate" ? entry.contractors : [];
    const mat = materialChoices(l, pricing);
    const split = mat.current ? materialSplit(l, pricing, levelOf(option)) : null;
    const setMat = (patch: { price?: number | null; cost?: number | null; methodPrice?: number | null; methodCost?: number | null }) => apply(setMaterialFigures(quote, option.id, l.id, patch, pricing));
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
            <div className="desc" title={l.sourceKind === "rate" && l.labourType ? `${l.labourType} | ${l.spec ?? ""}` : undefined}>{l.description}</div>
          )}
          {/* The method, in place (2026-11-06): same quantity and crew; the glue stays when it fits. */}
          {(() => {
            const methods = methodChoices(l, families ?? [], pricing, l.section ?? "Install");
            if (methods.length < 2) return null;
            return (
              <label className="mat">
                Method
                <select className="cell-in" value={methods.find((m) => m.on)?.choiceId ?? ""} onChange={(e) => apply(updateLine(quote, option.id, l.id, switchMethod(l, e.target.value, families ?? [], pricing, l.section ?? "Install", levelOf(option))))}>
                  {methods.map((m) => (
                    <option key={m.choiceId} value={m.choiceId}>{m.label}</option>
                  ))}
                </select>
              </label>
            );
          })()}
          {mat.choices.length > 0 && (
            <label className="mat">
              {glueWord(mat.base?.group)}
              <select className={`cell-in${mat.missing ? " missing" : ""}`} value={mat.current?.id ?? ""} onChange={(e) => e.target.value && apply(setMaterial(quote, option.id, l.id, e.target.value, pricing))}>
                {mat.missing && <option value="">Pick the {glueWord(mat.base?.group).toLowerCase()}…</option>}
                {mat.choices.map((m) => (
                  <option key={m.id} value={m.id}>
                    {materialWords(m)} · {money(m.price)}/{l.uom ?? "unit"}
                    {!customer ? ` · cost ${money(m.cost)}` : ""}
                  </option>
                ))}
              </select>
              {/* Never a default (2026-11-06): the line is the labour alone until a glue is picked, and it can't be sent. */}
              {mat.missing && <span className="sand-flag" role="status">Pick the {glueWord(mat.base?.group).toLowerCase()}: this line is labour only and can&apos;t be sent yet</span>}
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
          {/* Sand steps → painted risers and stringers only (2026-11-06): the disclaimer, and a flag on a clash. */}
          {sectionOf(l) === "Stairs" && sandRole({ id: l.sourceId, name: l.description, category: l.stairCategory }) === "sand" && <div className="sand-note">{SAND_DISCLAIMER}</div>}
          {sectionOf(l) === "Stairs" && sandFlagOf(l) && (
            <div className="sand-flag" role="status">
              ⚠ {sandFlagOf(l)}
            </div>
          )}
        </td>
        {!customer && (
          <td data-label="Contractor">
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
              <span className="muted">{l.contractor ?? "-"}</span>
            )}
            {crewMark(l)}
          </td>
        )}
        <td className="r" data-label="Quantity">
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
              <span className="faint">+</span>
              <NumCell value={l.waste === null ? null : Math.round(l.waste * 1000) / 10} label="Waste percent" placeholder="0" onCommit={(v) => upd({ waste: v === null ? null : v / 100 })} />
              <span className="faint">% waste</span>
            </div>
          )}
          {/* The material's math, worked out, never typed (2026-11-06): what is typed + the waste = what is ordered. */}
          {showsWaste(l) &&
            (() => {
              const m = wasteMath(l);
              const u = l.uom ?? "";
              return m ? (
                <div className="wastemath" aria-label="Quantity with waste">
                  {fmtQty(m.typed)} {u} + {fmtQty(m.pct)}% = <b>{fmtQty(m.actual)} {u}</b>
                </div>
              ) : null;
            })()}
        </td>
        {/* Unit cost in its own column again (Albert, 2026-11-01: "Can unit cost and price be on different row"). Staff only. */}
        {!customer && (
          <td className="r" data-label="Unit cost">
            {split ? (
              // Method and glue each adjustable, the unit worked out (Albert, 2026-11-06: "have the method and glue be
              // 'adjustable' and the total is calculated"). The unit is the line's own figure, so the sum always agrees.
              <MatSum word={glueWord(mat.current?.group)} unit={split.unitCost} uom={l.uom}
                method={<NumCell value={split.methodCost} label="Method unit cost" placeholder={rate(split.labourCost)} onCommit={(v) => setMat({ methodCost: v })} />}
                glue={<NumCell value={split.cost} label="Glue unit cost" placeholder={rate(split.cardCost)} onCommit={(v) => setMat({ cost: v })} />}
              />
            ) : (
              <>
                <NumCell value={l.costOverride} label="Unit cost" placeholder={l.unitCostSnap !== null ? rate(l.unitCostSnap) : "cost"} onCommit={(v) => upd({ costOverride: v })} />
                {l.unitCostSnap !== null && l.costOverride !== null && <span className="sub">card {money(l.unitCostSnap)}</span>}
              </>
            )}
          </td>
        )}
        <td className="r" data-label="Unit price">
          {split ? (
            <MatSum word={glueWord(mat.current?.group)} unit={split.unitPrice} uom={l.uom}
              method={<NumCell value={split.methodPrice} label="Method unit price" placeholder={rate(split.labourPrice)} onCommit={(v) => setMat({ methodPrice: v })} />}
              glue={<NumCell value={split.price} label="Glue unit price" placeholder={rate(split.cardPrice)} onCommit={(v) => setMat({ price: v })} />}
            />
          ) : (
            <>
              <NumCell value={l.unitPrice} label="Unit price" placeholder={l.unitPriceSnap !== null ? rate(l.unitPriceSnap) : "price"} onCommit={(v) => upd({ unitPrice: v })} />
              {/* The card figure is the box's placeholder, so it is only spelled out once typed over or marked up (2026-11-01). */}
              {!customer && l.unitPriceSnap !== null && (l.unitPrice !== null || (levelOf(option) === "Premium" && levelApplies(l))) && (
                <span className="sub">
                  {levelOf(option) === "Premium" && levelApplies(l) ? `card +${Math.round(PREMIUM_MARKUP * 100)}%` : "card"} {money(l.unitPriceSnap)}
                </span>
              )}
            </>
          )}
        </td>
        <td className="r amt" data-label="Line total">
          {l.include ? money(total) : <span className="note">optional</span>}
          {!customer && margin !== null && <span className="sub mg">{pct(margin, 0)} margin</span>}
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
    <div className={`page${version.change ? " is-change" : ""}`}>
      {/* Editing an accepted quote (Albert, 2026-10-31: "make it a little bit more obvious"): a band that stays
          in view while scrolling, so nobody mistakes a change for an ordinary draft. */}
      {version.change && (
        <div className="change-band" role="note">
          <span className="change-band-tag">Accepted quote · Change {version.change.no}</span>
          <span className="change-band-t">
            {isDraft
              ? `You are changing ${quote.customerName ? `${quote.customerName}'s` : "the customer's"} accepted quote. When sent, it goes to them as the updated quote for their records.`
              : `This change to ${quote.customerName ? `${quote.customerName}'s` : "the customer's"} accepted quote was ${(version.status ?? "sent").toLowerCase()}.`}
          </span>
          {version.change.contractTotal !== null && changeTotal !== null && (
            <span className={`change-band-d ${changeTotal >= version.change.contractTotal ? "up" : "down"}`}>
              {changeTotal - version.change.contractTotal >= 0 ? "+" : "−"}
              {money(Math.abs(changeTotal - version.change.contractTotal))} vs contract, with HST
            </span>
          )}
        </div>
      )}
      {/* Option C (Albert, 2026-11-01): a compact header with the status and Save always at the top. */}
      <div className="pagehead ed-head">
        <div className="titles">
          <Link href={backHref} className="crumb">
            ← {[version.label ?? (version.version !== null ? `v${version.version}` : null), version.basis].filter(Boolean).join(" · ") || "Back"}
          </Link>
          <h1>{quote.quoteRecordId ? quote.customerName || "No customer" : "New quote"}</h1>
          {!isDraft && (
            <p className="ed-hint">
              {version.agreed || version.change
                ? `This version is ${(version.status ?? "locked").toLowerCase()}. To change what was agreed, use Make a change on the quote page.`
                : `Sent (${(version.status ?? "locked").toLowerCase()}): saving starts the next draft, with every option carried over.`}
            </p>
          )}
          {version.change && (
            <p className="change-note">
              Change {version.change.no} to the accepted quote. Edit the work as usual; the customer gets it as an updated quote, for their records, and the payment schedule is worked out again on the new total.
              {" "}Each option the customer has stays its own option, and the customer sees each one as its own part with its own price. New work (a basement, an extra) goes on the option it belongs to, or as a new option: everything on a change goes to the customer as part of the project, for the record, with nothing to accept.
            </p>
          )}
        </div>
        <span className={`status ${changed ? "Sent" : "Draft"}`} role="status">
          {statusWords({ changed, autoOn, auto, keptAt: savedAt })}
        </span>
        <div className="actions">
          {/* On a phone Discard shows only once there is something to discard (2026-11-03). */}
          <button className={`btn ed-discard${!changed && !restoredAt ? " idle" : ""}`} onClick={discard} disabled={!changed && !restoredAt}>Discard</button>
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
            <button className="btn primary" onClick={save} disabled={saving || auto.state === "saving" || !changed}>
              {saving ? "Saving…" : version.change ? `Save change ${version.change.no}` : "Save"}
            </button>
          )}
        </div>
      </div>
      {/* On a phone the Conversation button sits here, in the page, instead of on the screen's edge (2026-11-03). */}
      <div id="conv-slot" className="conv-slot" />
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

      {restoredAt && (
        <p className="card banner warn restored">
          Restored your unsaved changes from {new Date(restoredAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}.{" "}
          <button className="linkbtn" onClick={discard}>Discard them</button>
        </p>
      )}

      <div className="layout ed-layout">
        <div className="stack">
          {/* Swap option (2026-10-30): the customer changed their mind on which option; sent for record like any change. */}
          {isDraft && version.change && swap && option && (
            <SwapOption source={swap} quote={quote} option={option} contractTotal={version.change.contractTotal} apply={apply} preselect={swapTo} />
          )}
          {/* Options on the left; adding one is a separate column on the right behind a light rule (Albert, 2026-11-01). */}
          <nav className="ed-tabs" aria-label="Options">
            <div className="ed-opts">
            {scopeGroups(quote.options).groups.map((g, i, all) => (
              // Each scope is its own row, its label in a fixed column so wrapped tabs still line up (2026-11-01);
              // Stairs start their own row (Albert, 2026-10-31), so flooring tabs never push them off to the right.
              <div className="tab-grp" key={g.scope}>
                {all.length > 1 && <span className="tab-scope">{g.scope}</span>}
                <div className="tab-grp-t">
                {g.options.map((o) => (
                  <button key={o.id} className={o.notOffered ? "tab off" : "tab"} aria-current={option?.id === o.id ? "page" : undefined} onClick={() => setActiveId(o.id)} title={o.notOffered ? "Not offered: never sent to the customer" : undefined}>
                    {o.notOffered && <span className="t-off">Not offered</span>}
                    {o.part && <span className="t-part">{o.part}</span>}
                    <span className="t-name">{o.name || "Untitled"}</span>
                    <span className="t-amt">{money(optionTotals(o.lines, quote.discountRate, (o.showHst ?? quote.showHst)).total)}</span>
                  </button>
                ))}
                </div>
              </div>
            ))}
            </div>
            <div className="ed-tabs-add">
            <button
              className="tab ed-add-blank"
              onClick={() => {
                // A new option starts with its fee (2026-11-06): delivery on a measured version.
                const added = addOption(quote);
                const next = withFees(added, catalogue, measured, newOptionIds(quote, added));
                apply(next);
                setActiveId(next.options[next.options.length - 1].id);
              }}
            >
              + Add option
            </button>
            <button
              className="tab ed-add-quick"
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
            </div>
          </nav>

          {quickNote && <div className="banner warn" role="status">{quickNote}</div>}
          {quick !== null && quick !== "loading" && (() => {
            const est = estimateWork(quick.choices, quick.profiles, quick.work);
            return (
              // On a phone this is a full-screen sheet with the estimate and Add pinned at the bottom (2026-11-03, globals.css).
              <section className="card ed-quick" aria-label="New option from the quick form">
                <div className="card-h">
                  <button type="button" className="ed-quick-x" onClick={() => setQuick(null)} disabled={addingQuick} aria-label="Close the quick form">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                  <span className="ed-quick-t">New option from the quick form</span>
                  <span className="right">{est.lines > 0 ? `${est.name} · ${money(est.total)} before discount and HST` : "Pick the work"}</span>
                </div>
                <div className="card-b">
                  <QuickWork choices={quick.choices} profiles={quick.profiles} value={quick.work} onChange={(w) => setQuick({ ...quick, work: w })} quoteWide="hidden" />
                </div>
                  <div className="ed-quick-foot">
                    <span className="ed-quick-est" aria-live="polite">
                      <span>{est.lines > 0 ? "Estimate, before discount and HST" : "Pick the work"}</span>
                      {est.lines > 0 && <b>{money(est.total)}</b>}
                    </span>
                    {glueWait(est.needsGlue, est.needsMaterial) && <span className="sand-flag" role="status">{glueWait(est.needsGlue, est.needsMaterial)}</span>}
                    <button type="button" className="btn" onClick={() => setQuick(null)} disabled={addingQuick}>Cancel</button>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={addingQuick || est.lines === 0 || est.needsGlue.length > 0 || est.needsMaterial.length > 0}
                      onClick={() =>
                        startQuick(async () => {
                          const r = await quickOptionAction(workInput(quick.work, quick.choices), quote.options.map((o) => o.name));
                          if (!r.ok) return setQuickNote(r.message);
                          // Flooring and stairs from one tab are two options (2026-11-06); the first one added opens.
                          const built = r.options.reduce((q, o) => addBuiltOption(q, o), quote);
                          const next = withFees(built, catalogue, measured, newOptionIds(quote, built));
                          apply(next);
                          setActiveId(next.options[quote.options.length]?.id ?? next.options[next.options.length - 1].id);
                          setQuick(null);
                          setQuickNote(r.skipped.length ? `Added. Left out: ${r.skipped.join("; ")}.` : null);
                        })
                      }
                    >
                      {addingQuick ? "Adding…" : "Add this option"}
                    </button>
                  </div>
              </section>
            );
          })()}

          {option && t ? (
            <>
              {option.notOffered && <p className="no-offer-banner" role="note"><b>Not offered.</b> This option stays on the quote but is never sent to the customer. Untick Not offered below to send it.</p>}
              {/* The material against the install (2026-11-06): outside 10-15% over, it stops a send until OK'd for these figures. */}
              {!customer &&
                (() => {
                  const sq = sqftCheck(option.lines);
                  if (!sq || sq.inBand) return null;
                  const ok = option.sqftOk === sq.key;
                  return ok ? (
                    <p className="sqft-ok" role="note">
                      Square feet OK&apos;d: {sqftWords(sq)}{" "}
                      <button type="button" className="linkbtn" onClick={() => apply(setSqftOk(quote, option.id, null))}>Undo</button>
                    </p>
                  ) : (
                    <p className="sand-flag sqft-flag" role="status">
                      ⚠ {sqftWords(sq)} It can&apos;t be sent until you check it.{" "}
                      <button type="button" className="btn small" onClick={() => apply(setSqftOk(quote, option.id, sq.key))}>OK, it&apos;s right</button>
                    </p>
                  );
                })()}
              <section className={option.notOffered ? "card ed-opt no-offer-card" : "card ed-opt"}>
                <div className="ohead">
                  <div className="oname">
                    <TextCell className="in title" value={option.name} label="Option name" placeholder="Option name" onCommit={(v) => apply(updateOption(quote, option.id, { name: v }))} />
                  </div>
                  {/* A preliminary's stairs option goes to the customer as these words only (2026-11-07, `wordsOnly()` in
                      copy.ts), so the box says so and is drawn as a plain text box to edit by hand (Albert, same day:
                      "Can we have the wordings in a text box that we can edit manually?"). */}
                  {!measured && stairsOption && (
                    <div className="words-h">
                      <b>Customer wording</b>
                      <span>Goes to the customer word for word: on a preliminary these words and the price range are all they get for this option, no lines. Edit it freely; the Send card shows it again before it goes. Left empty, the lines go instead.</span>
                    </div>
                  )}
                  <textarea
                    key={`${option.id}:${option.description}`}
                    className={!measured && stairsOption ? "in area words" : "in area"}
                    aria-label={!measured && stairsOption ? "Customer wording" : "Option description"}
                    placeholder={!measured && stairsOption ? "The words the customer gets for these stairs." : "What the client gets with this option. This text prints on the quote."}
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
                        onChange={(e) => {
                          const next = updateOption(quote, option.id, { scope: e.target.value === "Flooring" || e.target.value === "Stairs" ? e.target.value : null });
                          // Made a stairs option (2026-11-06): it gains Delivery, in Private, if it has none.
                          apply(optionScope(next.options.find((o) => o.id === option.id)!) === "Stairs" ? withFees(next, catalogue, measured, [option.id]) : next);
                        }}
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
                              if (!apply(r.quote)) return;
                              setLevelNote(
                                r.notRepriced.length
                                  ? `${r.notRepriced.length} line${r.notRepriced.length === 1 ? "" : "s"} kept ${r.notRepriced.length === 1 ? "its" : "their"} price: the Rate Card row is gone (${r.notRepriced.map((l) => l.description).join(", ")}).`
                                  : null,
                              );
                            }}
                          >
                            {lv}
                            {lv === "Premium" && <span className="pct">+{Math.round(PREMIUM_MARKUP * 100)}%</span>}
                            {lv === "Contractor" && <span className="pct">-{Math.round(CONTRACTOR_DISCOUNT * 100)}%</span>}
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
                  {holdNote && (
                    <p className="lvl-note warn" role="alert">
                      {holdNote}
                    </p>
                  )}
                </div>

                <div className="tbl-wrap">
                  {/* On a phone each line is a card, its cells labelled from data-label (2026-11-03, globals.css). */}
                  <table className="items edit">
                    <thead>
                      <tr>
                        <th className="idx">#</th>
                        <th>Item</th>
                        {!customer && <th>Contractor</th>}
                        <th className="r">Quantity</th>
                        {!customer && <th className="r">Unit cost</th>}
                        <th className="r">Unit price</th>
                        <th className="r">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionsShown.length === 0 && (
                        <tr>
                          <td colSpan={customer ? 5 : 7} className="empty">No lines yet. Pick a type of work below to add the first one.</td>
                        </tr>
                      )}
                      {sectionsShown.flatMap((s) => {
                        const lines = option.lines.filter((l) => secOf(l) === s);
                        const rollup = s === "Other" && hidden > 0 ? hidden : 0;
                        const sum = lines.reduce((a, l) => a + (lineTotal(l) ?? 0), 0) + rollup;
                        return [
                          <tr className={s === PRIVATE_SECTION ? "sect priv" : "sect"} key={`s-${s}`}>
                            <td colSpan={customer ? 4 : 6}>
                              {s === PRIVATE_SECTION ? <span className="priv-tag">Private</span> : s}{" "}
                              {s === PRIVATE_SECTION && !customer && !stairsOption && (
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
                            <td className="r">{customer && stairsOption ? "" : money(sum)}</td>
                          </tr>,
                          // Look B (Albert, 2026-11-06): the Private section says plainly whether the customer sees it, and how.
                          // Flooring: one line, its name and total, on a breakdown. Stairs: never, its money inside the stairs price.
                          ...(s === PRIVATE_SECTION && !customer
                            ? [
                                <tr className="priv-ban-row" key="priv-ban">
                                  <td colSpan={7}>
                                    {stairsOption ? (
                                      // Stairs (2026-11-07: "Ensure it is explicit always never shows"): every way it can be sent, said outright.
                                      <div className="priv-ban never" role="note">
                                        <span className="priv-never-k">Never shown to the customer</span>
                                        Not on a breakdown, not on a lump sum, not on the PDF or the email. Its {money(sum)} is inside the stairs price.
                                      </div>
                                    ) : (
                                      // Look D (Albert, 2026-11-07): one line and a Breakdown / Lump sum switch that starts on the way the
                                      // last version went; tap to see the other. A preliminary is always a lump sum: Breakdown is off.
                                      <div className={`priv-ban ${privShown ? "show" : "lumpway"}`} role="note">
                                        <span className="priv-seg" role="group" aria-label="What the customer sees, sent as">
                                          <button type="button" className={privShown ? "on" : ""} aria-pressed={privShown} disabled={!measured} title={measured ? "Sent as a breakdown" : "A preliminary always goes as a lump sum"} onClick={() => setPrivWay("breakdown")}>
                                            Breakdown
                                          </button>
                                          <button type="button" className={privShown ? "" : "on"} aria-pressed={!privShown} onClick={() => setPrivWay("lump")}>
                                            Lump sum
                                          </button>
                                        </span>
                                        {privShown ? (
                                          <>
                                            The customer sees one line:{" "}
                                            <span className="priv-prev">
                                              {option.privateLabel ?? DEFAULT_PRIVATE_LABEL} <b>{money(sum)}</b>
                                            </span>
                                          </>
                                        ) : (
                                          <>Not shown. Its {money(sum)} is inside the one price.{measured ? "" : " A preliminary is always a lump sum."}</>
                                        )}
                                        <span className="priv-foot">Never listed line by line, no quantities or line prices, either way.</span>
                                      </div>
                                    )}
                                  </td>
                                </tr>,
                              ]
                            : []),
                          // A stairs option: every category, empty or not, its add on its
                          // heading, so a picked item lands right there (2026-11-04). Private's add sits right under its header.
                          ...(stairsOption && s === "Stairs"
                            ? [
                                // No + Build a staircase (Albert, 2026-11-06: "You can take away the 'build staircase' option"):
                                // stairs are added from each category's heading.
                                ...stairSections(lines, stairCats).flatMap((g) => [
                                  <tr className="subsect with-add" key={`g-${g.group ?? "other"}`}>
                                    <td colSpan={customer ? 5 : 7}>
                                      <span className="subsect-in">
                                        <span>{stairGroupLabel(g.group)}</span>
                                        <button
                                          className="addrow"
                                          onClick={() =>
                                            g.group === null
                                              ? apply(addLine(quote, option.id, manualLine("Stairs")))
                                              : setPicking({ label: stairGroupLabel(g.group), section: "Stairs", category: g.group })
                                          }
                                        >
                                          + Add {g.group === null ? "a typed line" : `to ${stairGroupLabel(g.group).toLowerCase()}`}
                                        </button>
                                      </span>
                                    </td>
                                  </tr>,
                                  ...g.lines.map(row),
                                ]),
                              ]
                            : []),
                          // Stairs grouped by the Stair Item's Category (2026-10-28), a small heading over each group.
                          ...(stairsOption && s === "Stairs"
                            ? []
                            : s === "Stairs"
                            ? stairGroups(lines).flatMap((g) => [
                                ...(g.heading
                                  ? [
                                      <tr className="subsect" key={`g-${g.group ?? "other"}`}>
                                        <td colSpan={customer ? 5 : 7}>{stairGroupLabel(g.group)}</td>
                                      </tr>,
                                    ]
                                  : []),
                                ...g.lines.map(row),
                              ])
                            : lines.map(row)),
                          ...(rollup > 0
                            ? [
                                <tr key="private-rollup" className="rollup">
                                  <td className="idx">{numberOf.size + 1}</td>
                                  <td>{option.privateLabel ?? DEFAULT_PRIVATE_LABEL}</td>
                                  <td className="r">-</td>
                                  <td className="r">-</td>
                                  <td className="r"><b>{money(rollup)}</b></td>
                                </tr>,
                              ]
                            : []),
                          // "+ Add to …" closes each section (Option C, 2026-11-01). It follows the option's scope (2026-10-30):
                          // a stairs option adds only to Stairs and Private (stair items or typed), a flooring option never to Stairs.
                          // A stairs option's adds are at the top of its sections (above), so none closes them.
                          ...((!stairsOption && s !== "Stairs") || (stairsOption && s === PRIVATE_SECTION)
                            ? [
                                <tr className="sect-add" key={`a-${s}`}>
                                  <td />
                                  <td colSpan={customer ? 4 : 6}>
                                    <button className="addrow" onClick={() => setPicking({ label: s, section: s })}>
                                      + Add to {s === PRIVATE_SECTION ? "Private" : s.toLowerCase()}
                                    </button>
                                  </td>
                                </tr>,
                              ]
                            : []),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
                {/* A flooring option adds everything but Stairs here. A stairs option has no bar: every category is its own
                    heading with its add (2026-11-04), so nothing would be added far from where it shows. */}
                {!stairsOption && (
                  <div className="addbar">
                    <span className="lbl">Add work</span>
                    {addChoices("Flooring", stairCats, WORK_SECTIONS.filter((s) => !(customer && s === PRIVATE_SECTION))).map((c) => (
                      <button key={`${c.section}:${c.category ?? c.label}`} className="chip-btn" onClick={() => setPicking(c)}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
                {/* Totals at the bottom of the lines, as on an invoice (Albert, 2026-11-01: "the totals should be at the bottom for intuitiveness"). */}
                <div className="ov-foot">
                  <div className="ov-foot-in">
                  {(() => {
                    const ps = priceSummary(option.lines, quote.discountRate, hstOn);
                    return (
                      <>
                        <div className="ov-row"><span className="k">List price</span><span className="v">{money(ps.gross)}</span></div>
                        {ps.items.map((d, i) => (
                          <div className="ov-row" key={i}><span className="k">{d.label}</span><span className="v">{money(-d.amount)}</span></div>
                        ))}
                        {t.discount !== 0 && <div className="ov-row"><span className="k">Accepted price discount ({pct(quote.discountRate * 100, 1)})</span><span className="v">{money(t.discount)}</span></div>}
                      </>
                    );
                  })()}
                  <div className="ov-row"><span className="k">Subtotal</span><span className="v">{money(t.subtotal)}</span></div>
                  <div className="ov-row"><span className="k">HST{hstOn ? " (13%)" : t.hst ? " (materials only)" : " (off)"}</span><span className="v">{money(t.hst)}</span></div>
                  <div className="ov-total"><span>Total</span><span className="v">{money(t.total)}</span></div>
                  </div>
                </div>
                {/* Said again here: the price card is where most refused changes are typed. */}
                {holdNote && (
                  <p className="lvl-note warn" role="alert">
                    {holdNote}
                  </p>
                )}
                <PriceCard quote={quote} option={option} customer={customer} apply={apply} />
              </section>

              <div>
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

              </div>
            </>
          ) : (
            <section className="card ed-empty">
              <p className="empty">No options. Use “+ Add option” to start one.</p>
            </section>
          )}

          <details className="card ed-terms" ref={termsRef} id="ed-terms">
            <summary className="card-h">
              Customer and terms <span className="right">{termsLine}</span>
            </summary>
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
              {option && (
                <div className="hst-row">
                  <label className="check-in" title="This option only: its labour and everything else. The other options keep their own. Each material line has its own HST box, which this never changes.">
                    <input type="checkbox" checked={hstOn} onChange={(e) => apply(setOptionHst(quote, option.id, e.target.checked))} /> Charge HST (13%) on this option
                  </label>
                  {/* Every option at once, behind a confirmation (Albert, 2026-11-04). */}
                  <HstAll
                    options={quote.options.map((o) => ({ id: o.id, name: o.name, lines: o.lines, hst: o.showHst ?? quote.showHst }))}
                    discountRate={quote.discountRate}
                    onApply={(on) => apply(setAllHst(quote, on))}
                  />
                </div>
              )}
              {/* The payment schedule (Albert, 2026-10-27): one per version, frozen when it is sent. */}
              <ScheduleEditor
                schedule={quote.schedule ?? null}
                auto={autoPlan}
                flags={scheduleWarnings}
                onChange={(next) => apply(setSchedule(quote, next))}
                amounts={option && t ? stageAmounts(schedule, option.lines, quote.discountRate, hstOn, t.total) : []}
              />
            </div>
          </details>


        </div>

        <aside className="ed-side">
          {option && t && <Financials schedule={schedule} lines={option.lines} t={t} discountRate={quote.discountRate} showHst={hstOn} agrees={null} customer={customer} />}
          <section className="card ed-cust">
            <div className="card-h">Customer and terms</div>
            <div className="card-b">
              <b className="who">{quote.customerName || <span className="faint">No customer</span>}</b>
              <span className="where">{[quote.siteAddress, quote.siteCity].filter(Boolean).join(", ") || <span className="faint">No address yet</span>}</span>
              {quote.addressStatus === "Unconfirmed" && <span className="chip warn">Address unconfirmed</span>}
              {quote.ghlContactId && (
                <a href={ghlContactUrl(quote.ghlContactId)} target="_blank" rel="noreferrer">
                  Open in GHL ↗
                </a>
              )}
              <dl>
                <div><dt>Discount</dt><dd>{quote.discountRate ? `${pct(quote.discountRate * 100, 1)}${quote.discountReason ? `, ${quote.discountReason}` : ""} (every option)` : "Per option, in its price card"}</dd></div>
                <div><dt>HST</dt><dd>{hstOn ? "Charged, 13%" : "Off (materials keep their own)"} (this option)</dd></div>
                <div><dt>Payment</dt><dd>{payLine}</dd></div>
              </dl>
              <button
                type="button"
                className="linkbtn ed-edit"
                onClick={() => {
                  const d = termsRef.current;
                  if (!d) return;
                  d.open = true;
                  d.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Edit terms
              </button>
            </div>
          </section>
          {/* The Send card (2026-11-06), as on the quote page; off while this screen holds unsaved changes. */}
          {hasSendCard && (
            <div className="ed-send">
              <EditorSend.Provider value={{ unsavedAt: changed || auto.state === "saving" ? (savedAt ?? "unknown") : null }}>{sendCard}</EditorSend.Provider>
            </div>
          )}
        </aside>
      </div>

      {picking && option && (
        <Picker
          section={picking.section}
          category={picking.category ?? null}
          stairsOnly={picking.stairsOnly === true}
          catalogue={catalogue}
          profiles={card.profiles ?? []}
          profileLines={option.lines.filter((l) => l.sourceKind === "profile").map((l) => ({ id: l.id, sourceId: l.sourceId }))}
          optionLines={option.lines}
          families={families ?? []}
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


/** What a Rate Card row's material is called on the line: Glue for a glue group, else Material (2026-11-06). */
function glueWord(group: string | null | undefined): string {
  return group && /glue/i.test(group) ? "Glue" : "Material";
}

/**
 * Method + glue = unit (Albert, 2026-11-06): the method and the glue are the two boxes, each blank on the card's figure
 * (its placeholder), and the unit under them is worked out, never typed (`materialSplit()` / `setMaterialFigures()`).
 */
function MatSum({ word, method, glue, unit, uom }: { word: string; method: ReactNode; glue: ReactNode; unit: number | null; uom: string | null }) {
  return (
    <div className="matsum" title={`The method's labour plus the ${word.toLowerCase()}, per unit. A blank box follows the card.`}>
      <span className="k">Method</span>
      <span className="v">{method}</span>
      <span className="k">+ {word}</span>
      <span className="v">{glue}</span>
      <span className="k eq">=</span>
      <span className="v eq">{unit === null ? "-" : money(unit)}<span className="faint">/{uom ?? "unit"}</span></span>
    </div>
  );
}
