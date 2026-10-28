import { LINE, OPTION, VERSION } from "@/lib/airtable/fields";
import { sectionOf } from "@/lib/calc";
import { cleanSchedule, sameSchedule, scheduleField } from "@/lib/pricing/schedule";
import { levelOf } from "@/lib/pricing/service";
import { scopeValue } from "./scope";
import type { EditorLine, EditorOption, EditorQuote } from "@/lib/editor/model";

/**
 * Saving a version: what to write to Airtable so it matches the editor. Pure, no I/O, and the
 * only place the editor's data is turned into Airtable fields (tests/save.test.ts).
 *
 * Rules:
 * - Only records that already belong to this version are ever updated. Anything else the
 *   browser sends, whatever id it carries, is created new: a tampered or stale id can never
 *   reach a record on another quote.
 * - Nothing is deleted (the app has no delete). A removed line or option is detached from the
 *   version, which takes it out of every total; the record stays in Airtable as history.
 * - Only what changed is written; an untouched line costs no request.
 */

export type Fields = Record<string, unknown>;

export type SavePlan = {
  version: Fields;
  createOptions: { ref: string; fields: Fields }[];
  updateOptions: { id: string; fields: Fields }[];
  detachOptions: string[];
  /** `option` is an existing option's id, or the `ref` of one in createOptions. */
  createLines: { option: string; fields: Fields }[];
  updateLines: { id: string; option: string; fields: Fields }[];
  detachLines: string[];
};

export const isRecordId = (v: unknown): v is string => typeof v === "string" && /^rec[A-Za-z0-9]{14}$/.test(v);

const LIMITS = { options: 20, linesPerOption: 200, text: 1000 };

/**
 * Airtable's own choices for the three select fields a line writes. Writes use typecast, which
 * would quietly add a new choice for anything else, so a value off these lists is saved blank.
 */
/** Quote Lines → Section, Airtable's own choices; a value off this list is saved blank. "Private" added 2026-10-22. */
export const LINE_SECTIONS = ["Removal", "Prep", "Materials", "Install", "Stairs", "Refinish", "Paint", "Sand", "Disposal", "Delivery", "Other", "Private", "Exclusions"] as const;
export const LINE_TYPES = ["Material", "Install", "Removal", "Stairs", "Disposal", "Delivery", "Moulding", "Other", "Note"] as const;
export const LINE_UOMS = ["sqft", "linear ft", "each", "piece", "hour", "roll", "flat"] as const;
const oneOf = <T extends string>(list: readonly T[], v: string | null): T | null => (v !== null && (list as readonly string[]).includes(v) ? (v as T) : null);

// ---------- what the browser sends, made safe ----------

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown, max = LIMITS.text): string => (typeof v === "string" ? v.slice(0, max) : "");
const nullableText = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);
const SOURCE_KINDS = ["rate", "stair", "product", "profile", "manual"] as const;

function cleanLine(raw: unknown, i: number): EditorLine {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = SOURCE_KINDS.includes(r.sourceKind as never) ? (r.sourceKind as EditorLine["sourceKind"]) : "manual";
  const sourceId = kind !== "manual" && isRecordId(r.sourceId) ? r.sourceId : null;
  return {
    id: typeof r.id === "string" ? r.id.slice(0, 40) : `line_${i}`,
    sourceKind: sourceId ? kind : "manual",
    sourceId,
    labourType: nullableText(r.labourType),
    spec: nullableText(r.spec),
    description: text(r.description),
    contractor: nullableText(r.contractor),
    materialId: kind === "rate" && isRecordId(r.materialId) ? r.materialId : null,
    area: text(r.area, 200),
    uom: oneOf(LINE_UOMS, nullableText(r.uom, 40)),
    clientNote: text(r.clientNote),
    lineType: oneOf(LINE_TYPES, nullableText(r.lineType, 40)),
    section: oneOf(LINE_SECTIONS, nullableText(r.section, 40)),
    include: r.include !== false,
    qty: num(r.qty),
    waste: num(r.waste),
    unitPrice: num(r.unitPrice),
    unitPriceSnap: num(r.unitPriceSnap),
    unitCostSnap: num(r.unitCostSnap),
    costOverride: num(r.costOverride),
    manualCost: num(r.manualCost),
    minChargeSnap: num(r.minChargeSnap),
    noHst: r.noHst === true,
    hasSource: Boolean(sourceId),
  };
}

/** The editor's quote as the server will trust it: types checked, sizes capped, unknown keys dropped. */
export function cleanEditorQuote(raw: unknown): EditorQuote {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const options = (Array.isArray(r.options) ? r.options : []).slice(0, LIMITS.options).map((o, i): EditorOption => {
    const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
    return {
      id: typeof x.id === "string" ? x.id.slice(0, 40) : `opt_${i}`,
      name: text(x.name, 120).trim() || `Option ${i + 1}`,
      description: text(x.description, 4000),
      recommended: x.recommended === true,
      serviceLevel: x.serviceLevel === "Premium" ? "Premium" : "Standard",
      crew: text(x.crew, 80).trim() || null,
      privateLabel: text(x.privateLabel, 120).trim() || null,
      scope: scopeValue(x.scope),
      lines: (Array.isArray(x.lines) ? x.lines : []).slice(0, LIMITS.linesPerOption).map(cleanLine),
    };
  });
  const rate = num(r.discountRate) ?? 0;
  return {
    quoteRecordId: isRecordId(r.quoteRecordId) ? r.quoteRecordId : null,
    customerName: "",
    siteAddress: "",
    siteCity: "",
    ghlContactId: null,
    ghlOpportunityId: null,
    addressStatus: null,
    projectNumber: null,
    notionProjectUrl: null,
    discountRate: Math.min(1, Math.max(0, rate)),
    discountReason: nullableText(r.discountReason, 120),
    itemised: r.itemised === true,
    showHst: r.showHst !== false,
    schedule: cleanSchedule(r.schedule),
    options,
  };
}

// ---------- editor → Airtable fields ----------

const orNull = (s: string) => (s.trim() === "" ? null : s.trim());

/**
 * What Airtable's Description formula shows for a card line with no typed wording. Saving that
 * same text as an override would pin it, so it is saved blank and the formula keeps it.
 */
const cardWording = (l: EditorLine) => (l.sourceKind === "rate" && l.labourType && l.spec ? `${l.labourType} | ${l.spec}` : null);

export function lineFields(l: EditorLine, sortOrder: number): Fields {
  const wording = orNull(l.description);
  return {
    [LINE.label]: wording ? wording.slice(0, 120) : null,
    [LINE.lineType]: oneOf(LINE_TYPES, l.lineType),
    [LINE.section]: oneOf(LINE_SECTIONS, l.section),
    [LINE.sortOrder]: sortOrder,
    [LINE.area]: orNull(l.area),
    [LINE.qty]: l.qty,
    [LINE.uom]: oneOf(LINE_UOMS, l.uom),
    [LINE.waste]: l.waste,
    [LINE.unitPrice]: l.unitPrice,
    [LINE.unitPriceSnap]: l.unitPriceSnap,
    [LINE.unitCostSnap]: l.unitCostSnap,
    [LINE.minChargeSnap]: l.minChargeSnap,
    [LINE.manualCost]: l.manualCost,
    [LINE.costOverride]: l.costOverride,
    [LINE.descriptionOverride]: wording === cardWording(l) ? null : wording,
    [LINE.clientNote]: orNull(l.clientNote),
    [LINE.include]: l.include,
    // Only a material chooses its own HST; anywhere else the box stays clear so it can't mislead.
    [LINE.noHst]: sectionOf(l) === "Materials" && l.noHst === true,
    [LINE.rateItem]: l.sourceKind === "rate" && l.sourceId ? [l.sourceId] : [],
    [LINE.stairItem]: l.sourceKind === "stair" && l.sourceId ? [l.sourceId] : [],
    [LINE.product]: l.sourceKind === "product" && l.sourceId ? [l.sourceId] : [],
    [LINE.stairProfile]: l.sourceKind === "profile" && l.sourceId ? [l.sourceId] : [],
    [LINE.installMaterial]: l.sourceKind === "rate" && l.materialId ? [l.materialId] : [],
  };
}

export function optionFields(o: EditorOption, sortOrder: number): Fields {
  return {
    [OPTION.name]: o.name,
    [OPTION.description]: orNull(o.description),
    [OPTION.sortOrder]: sortOrder,
    [OPTION.recommended]: o.recommended,
    [OPTION.serviceLevel]: levelOf(o),
    [OPTION.crew]: o.crew?.trim() || null,
    [OPTION.privateLabel]: o.privateLabel?.trim() || null,
    [OPTION.scope]: o.scope ?? null,
  };
}

const same = (a: Fields, b: Fields) => JSON.stringify(a) === JSON.stringify(b);

/**
 * `original` is the version as Airtable has it now (null for a brand-new version); `edited` is
 * what the editor holds. Returns the smallest set of writes that makes Airtable match.
 */
export function planSave(original: EditorQuote | null, edited: EditorQuote): SavePlan {
  const plan: SavePlan = { version: {}, createOptions: [], updateOptions: [], detachOptions: [], createLines: [], updateLines: [], detachLines: [] };

  if (!original || original.discountRate !== edited.discountRate) plan.version[VERSION.discountRate] = edited.discountRate;
  if (!original || original.showHst !== edited.showHst) plan.version[VERSION.showHst] = edited.showHst;
  if (!original || (original.discountReason ?? null) !== (edited.discountReason ?? null)) plan.version[VERSION.discountReason] = edited.discountReason ?? null;
  if (!original || !!original.itemised !== !!edited.itemised) plan.version[VERSION.itemised] = !!edited.itemised;
  // The default schedule is saved blank, so a quote nobody changed the schedule on stays blank (2026-10-27).
  if (original ? !sameSchedule(original.schedule, edited.schedule) : scheduleField(edited.schedule) !== null) plan.version[VERSION.paymentSchedule] = scheduleField(edited.schedule);

  const oldOptions = new Map((original?.options ?? []).map((o, i) => [o.id, { o, i }]));
  const oldLines = new Map((original?.options ?? []).flatMap((o) => o.lines.map((l, i) => [l.id, { l, i, option: o.id }] as const)));
  const keptOptions = new Set<string>();
  const keptLines = new Set<string>();

  edited.options.forEach((o, oi) => {
    const before = oldOptions.get(o.id);
    let optionRef: string;
    if (before) {
      keptOptions.add(o.id);
      optionRef = o.id;
      const now = optionFields(o, oi + 1);
      if (!same(now, optionFields(before.o, before.i + 1))) plan.updateOptions.push({ id: o.id, fields: now });
    } else {
      optionRef = `new:${oi}`;
      plan.createOptions.push({ ref: optionRef, fields: optionFields(o, oi + 1) });
    }

    o.lines.forEach((l, li) => {
      const now = lineFields(l, li + 1);
      const prev = oldLines.get(l.id);
      // A line counts as existing only if it was on this version, and was not already claimed.
      if (prev && !keptLines.has(l.id)) {
        keptLines.add(l.id);
        const moved = prev.option !== optionRef;
        if (moved || !same(now, lineFields(prev.l, prev.i + 1))) plan.updateLines.push({ id: l.id, option: optionRef, fields: now });
      } else {
        plan.createLines.push({ option: optionRef, fields: now });
      }
    });
  });

  for (const id of oldOptions.keys()) if (!keptOptions.has(id)) plan.detachOptions.push(id);
  for (const id of oldLines.keys()) if (!keptLines.has(id)) plan.detachLines.push(id);
  return plan;
}

export const planIsEmpty = (p: SavePlan) =>
  Object.keys(p.version).length === 0 &&
  p.createOptions.length + p.updateOptions.length + p.detachOptions.length + p.createLines.length + p.updateLines.length + p.detachLines.length === 0;

/**
 * A short fingerprint of a version's content. The editor is given the one for what it opened;
 * a save is refused if Airtable no longer matches it, so nobody's newer work is overwritten.
 */
export function fingerprint(q: EditorQuote): string {
  // A schedule joins the fingerprint only when it isn't the default, so versions saved before it existed keep theirs (2026-10-27).
  const sched = scheduleField(q.schedule);
  const s = JSON.stringify({ d: q.discountRate, h: q.showHst, r: q.discountReason ?? null, i: !!q.itemised, ...(sched ? { s: sched } : {}), o: q.options });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16).padStart(8, "0")}-${s.length.toString(16)}`;
}

/**
 * Changes after acceptance (2026-10-27, from Albert's test: pressing Make a change twice gave Change 1
 * and Change 2 with nothing sent). One change is open at a time: a draft change is reopened, never
 * duplicated. Numbers count only the changes the customer was sent, so a draft that was replaced or
 * thrown away leaves no gap.
 */
export function changeSlot(versions: { id: string; status: string | null; changeNo: number | null; sentAt: string | null }[]): { open: string | null; next: number } {
  const open = versions.find((v) => v.status === "Draft" && (v.changeNo ?? 0) > 0)?.id ?? null;
  const sent = versions.filter((v) => (v.changeNo ?? 0) > 0 && v.sentAt).map((v) => v.changeNo as number);
  return { open, next: Math.max(0, ...sent) + 1 };
}

/**
 * Why Save as new version is refused, or null. The agreed quote (accepted or won) and a change are
 * never copied into an ordinary version: a copy would go out as a fresh quote to accept, not as a
 * change for the record. They change only through Make a change.
 */
export function newVersionRefusal(from: { changeNo: number | null; agreed: boolean }): string | null {
  if (from.agreed) return "This is the accepted quote. To change it, use Make a change on the quote page.";
  if ((from.changeNo ?? 0) > 0) return "This is a change to the accepted quote. Save it here, or use Make a change on the quote page for the next one.";
  return null;
}
