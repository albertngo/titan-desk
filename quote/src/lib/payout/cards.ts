import { isPriced, payoutAmount, payoutTotal, round2, sectionOf, SECTIONS } from "@/lib/calc";
import { picksOf } from "@/lib/accept/plan";
import type { Quote, QuoteLine, QuoteOption, RateCard } from "@/lib/quotes/types";

/**
 * Contractor payout cards (Albert, 2026-11-04: "we have to also send the contractor a payout form… select the final
 * sent options and summarize for the labor-only portions of each line item… multiple payout cards since there may be
 * different contractors for each line item… easily check for those said items, add any new lines, edit payout rates;
 * etc. and quickly push this to the companycam").
 *
 * Pure. The cards are built from the options picked as final: one card per contractor on their lines, each line at the
 * labour-only part of what Titan pays for it, then edited by staff and kept as JSON on the quote (Quotes → Payouts),
 * so every version shows the same cards. Money is `payoutAmount()` / `payoutTotal()` in calc.ts.
 *
 * What a card starts with (Albert, same day, from the choices offered):
 * - the labour sections ticked (`ON_SECTIONS`); Delivery, Other, Private and unsorted lines listed but unticked;
 *   Materials, Discounts and Exclusions never listed, since they are not labour;
 * - the rate is our labour cost on the line: the Rate Card row's cost without the swapped material, a Stair Item's
 *   Labor Cost without its Material Cost, else the line's cost (typed override, then the card snap);
 * - the quantity is the line's own, without waste: the contractor is paid for the floor they lay.
 */

export const PAYOUTS_VERSION = 1;
/** Ticked on a new card: the work a contractor does. */
export const ON_SECTIONS: ReadonlySet<string> = new Set(["Install", "Stairs", "Removal", "Prep", "Disposal"]);
/** Never on a card: not labour. */
export const OFF_LIMITS: ReadonlySet<string> = new Set(["Materials", "Discounts", "Exclusions"]);
/** What a typed line on a card is filed under. */
export const TYPED_SECTION = "Other";
export const MAX_CARDS = 20;
export const MAX_LINES = 150;
const TEXT_MAX = 160;
const NOTE_MAX = 1000;
const NUM_MAX = 1_000_000;

export type PayoutLine = {
  id: string;
  /** The Quote Lines record it came from; null for a line typed on the card. */
  ref: string | null;
  /** The option it came from, by name; null for a typed line. */
  option: string | null;
  section: string;
  description: string;
  area: string;
  uom: string;
  qty: number | null;
  /** The payout rate per unit, labour only. */
  rate: number | null;
  /** What the rate started at (our labour cost), so a typed rate shows as changed; null on a typed line. */
  cardRate: number | null;
  on: boolean;
};

/** One push of a card to CompanyCam: when, by whom, the total and a signature of what was on it. Server-written only. */
export type PayoutPush = { at: string; by: string; total: number; sig: string; file: string; camPhotoId: string | null };

export type PayoutCard = { id: string; contractor: string; note: string; lines: PayoutLine[]; pushes: PayoutPush[] };

export type PayoutSet = {
  v: typeof PAYOUTS_VERSION;
  /** The version the cards were built from, and the Quote Options picked as final. */
  versionId: string | null;
  options: string[];
  cards: PayoutCard[];
  by: string | null;
  at: string | null;
};

export const emptySet = (): PayoutSet => ({ v: PAYOUTS_VERSION, versionId: null, options: [], cards: [], by: null, at: null });

/* ---------- which options are final ---------- */

const live = (q: Pick<Quote, "acceptance">) => (q.acceptance && !q.acceptance.cancelled ? q.acceptance : null);

/**
 * The options ticked when the tab opens: what the customer accepted on this version; on a change (sent for the record),
 * every option it offers; otherwise the recommended ones, else the first. Staff can tick others.
 */
export function defaultOptionIds(q: Pick<Quote, "acceptance" | "changeNo" | "options">): string[] {
  const ids = new Set(q.options.map((o) => o.id));
  const a = live(q);
  if (a) {
    const picked = picksOf(a).flatMap((p) => (p.ref && ids.has(p.ref) ? [p.ref] : []));
    if (picked.length) return picked;
  }
  const offered = q.options.filter((o) => !o.notOffered);
  if (q.changeNo) return offered.map((o) => o.id);
  const rec = offered.filter((o) => o.recommended).map((o) => o.id);
  return rec.length ? rec : offered.slice(0, 1).map((o) => o.id);
}

const key = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** An optional add-on (an unticked line) counts as work only when the customer took it on this version. */
function takenAddOns(q: Pick<Quote, "acceptance">): Set<string> {
  const a = live(q);
  return new Set((a?.addOns ?? []).map((x) => key(x.description)));
}

/* ---------- labour only ---------- */

/**
 * The labour-only rate Titan pays for one unit of a line, or null when nothing is known. A typed whole-line cost
 * (Manual Cost) is spread over the quantity.
 */
export function labourRate(l: QuoteLine, card: RateCard): number | null {
  const qty = l.qty ?? 0;
  if (l.manualCost) return qty > 0 ? round2(l.manualCost / qty) : l.manualCost;
  const used = l.costOverride ? l.costOverride : l.unitCostSnap;
  if (l.sourceKind === "rate" && l.materialId) {
    const row = card.rates.find((r) => r.id === l.sourceId);
    const material = (card.materials ?? []).find((m) => m.id === l.materialId);
    // A typed cost on a material line is labour from the card + the typed material (setMaterialFigures()): the card's labour.
    if (l.costOverride && row) return row.cost;
    if (used !== null && material?.cost != null) return Math.max(0, round2(used - material.cost));
    return row ? row.cost : used;
  }
  if (l.sourceKind === "stair") {
    const row = card.stairs.find((s) => s.id === l.sourceId);
    const labour = row?.labourCost ?? null;
    if (row && labour !== null && row.cost !== null && row.cost !== labour && used !== null) {
      // Lines snapped before 2026-10-31 hold labour only already; later ones hold labour + material.
      if (Math.abs(used - labour) < 0.005) return used;
      return Math.max(0, round2(used - (row.cost - labour)));
    }
  }
  return used;
}

/* ---------- building the cards ---------- */

const sectionRank = (s: string) => {
  const i = (SECTIONS as readonly string[]).indexOf(s);
  return i < 0 ? SECTIONS.length : i;
};

/** Just the card line of a candidate. */
const lineOf = (c: PayoutLine): PayoutLine => ({ id: c.id, ref: c.ref, option: c.option, section: c.section, description: c.description, area: c.area, uom: c.uom, qty: c.qty, rate: c.rate, cardRate: c.cardRate, on: c.on });

/** A line that can go on a card: the labour, with the contractor it is set to and the option it is on. */
export type Candidate = PayoutLine & { contractor: string; optionId: string };

/** Every line that can go on a card, from the options picked, in section order. */
export function payoutCandidates(q: Pick<Quote, "acceptance" | "options">, optionIds: string[], card: RateCard): Candidate[] {
  const picked = optionIds.flatMap((id) => q.options.filter((o) => o.id === id));
  const addOns = takenAddOns(q);
  const out: (Candidate & { rank: number; order: number })[] = [];
  let order = 0;
  for (const o of picked as QuoteOption[]) {
    for (const l of o.lines) {
      if (!isPriced(l)) continue;
      const section = sectionOf(l);
      if (OFF_LIMITS.has(section)) continue;
      if (!l.include && !addOns.has(key(l.description))) continue;
      const rate = labourRate(l, card);
      out.push({
        id: "",
        ref: l.id,
        option: o.name,
        section,
        description: (l.description ?? "").trim() || [l.labourType, l.spec].filter(Boolean).join(" · ") || "Line",
        area: l.area ?? "",
        uom: l.uom ?? "",
        qty: l.qty,
        rate,
        cardRate: rate,
        on: ON_SECTIONS.has(section) && (rate ?? 0) > 0,
        contractor: (l.contractor ?? "").trim(),
        optionId: o.id,
        rank: sectionRank(section),
        order: order++,
      });
    }
  }
  return out.sort((a, b) => a.rank - b.rank || a.order - b.order).map((c): Candidate => ({ ...lineOf(c), contractor: c.contractor, optionId: c.optionId }));
}

/**
 * The cards for the options picked: one per contractor, in the order their first line comes, lines with no contractor
 * on a card of their own with no name yet. A rebuild keeps each contractor's push history (same name, any case) so a
 * card already in CompanyCam still says so.
 */
export function buildCards(q: Pick<Quote, "id" | "acceptance" | "options">, optionIds: string[], card: RateCard, before: PayoutSet | null): PayoutSet {
  return groupCards(payoutCandidates(q, optionIds, card), q.id, optionIds, before);
}

/** The cards from candidate lines (the tab regroups them in the browser when other options are ticked). */
export function groupCards(candidates: Candidate[], versionId: string | null, optionIds: string[], before: PayoutSet | null): PayoutSet {
  const picked = new Set(optionIds);
  const groups = new Map<string, { contractor: string; lines: PayoutLine[] }>();
  let n = 0;
  for (const c of candidates) {
    if (!picked.has(c.optionId)) continue;
    const k = key(c.contractor);
    const g = groups.get(k) ?? { contractor: c.contractor, lines: [] };
    g.lines.push({ ...lineOf(c), id: `l${++n}` });
    groups.set(k, g);
  }
  const history = new Map((before?.cards ?? []).map((c) => [key(c.contractor), c.pushes]));
  const cards = [...groups.values()].slice(0, MAX_CARDS).map((g, i) => ({ id: `c${i + 1}`, contractor: g.contractor, note: "", lines: g.lines.slice(0, MAX_LINES), pushes: g.contractor ? (history.get(key(g.contractor)) ?? []) : [] }));
  const known = new Set(candidates.map((c) => c.optionId));
  return { v: PAYOUTS_VERSION, versionId, options: optionIds.filter((id) => known.has(id)), cards, by: null, at: null };
}

/* ---------- editing (the tab only calls these) ---------- */

function nextId(set: PayoutSet, prefix: "c" | "l"): string {
  const used = prefix === "c" ? set.cards.map((c) => c.id) : set.cards.flatMap((c) => c.lines.map((l) => l.id));
  const top = used.reduce((m, id) => Math.max(m, Number(id.slice(1)) || 0), 0);
  return `${prefix}${top + 1}`;
}

const mapCard = (set: PayoutSet, cardId: string, f: (c: PayoutCard) => PayoutCard): PayoutSet => ({ ...set, cards: set.cards.map((c) => (c.id === cardId ? f(c) : c)) });

export function addCard(set: PayoutSet, contractor = ""): PayoutSet {
  if (set.cards.length >= MAX_CARDS) return set;
  return { ...set, cards: [...set.cards, { id: nextId(set, "c"), contractor, note: "", lines: [], pushes: [] }] };
}

export function removeCard(set: PayoutSet, cardId: string): PayoutSet {
  return { ...set, cards: set.cards.filter((c) => c.id !== cardId) };
}

export function setCard(set: PayoutSet, cardId: string, patch: Partial<Pick<PayoutCard, "contractor" | "note">>): PayoutSet {
  return mapCard(set, cardId, (c) => ({ ...c, ...patch }));
}

export type LinePatch = Partial<Pick<PayoutLine, "description" | "area" | "uom" | "qty" | "rate" | "on">>;

export function setLine(set: PayoutSet, cardId: string, lineId: string, patch: LinePatch): PayoutSet {
  return mapCard(set, cardId, (c) => ({ ...c, lines: c.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }));
}

/** A line typed on the card: ticked, no rate until one is typed. */
export function addLine(set: PayoutSet, cardId: string): PayoutSet {
  const id = nextId(set, "l");
  return mapCard(set, cardId, (c) => (c.lines.length >= MAX_LINES ? c : { ...c, lines: [...c.lines, { id, ref: null, option: null, section: TYPED_SECTION, description: "", area: "", uom: "", qty: 1, rate: null, cardRate: null, on: true }] }));
}

export function removeLine(set: PayoutSet, cardId: string, lineId: string): PayoutSet {
  return mapCard(set, cardId, (c) => ({ ...c, lines: c.lines.filter((l) => l.id !== lineId) }));
}

/** Give a line to another contractor's card: it goes to the end of that card, as it was. */
export function moveLine(set: PayoutSet, lineId: string, toCardId: string): PayoutSet {
  const from = set.cards.find((c) => c.lines.some((l) => l.id === lineId));
  const to = set.cards.find((c) => c.id === toCardId);
  if (!from || !to || from.id === to.id || to.lines.length >= MAX_LINES) return set;
  const line = from.lines.find((l) => l.id === lineId)!;
  return { ...set, cards: set.cards.map((c) => (c.id === from.id ? { ...c, lines: c.lines.filter((l) => l.id !== lineId) } : c.id === to.id ? { ...c, lines: [...c.lines, line] } : c)) };
}

/** Back to the rate the line started at. */
export const resetRate = (set: PayoutSet, cardId: string, lineId: string): PayoutSet =>
  mapCard(set, cardId, (c) => ({ ...c, lines: c.lines.map((l) => (l.id === lineId && l.cardRate !== null ? { ...l, rate: l.cardRate } : l)) }));

/* ---------- reading a card ---------- */

export const cardTotal = (c: Pick<PayoutCard, "lines">) => payoutTotal(c.lines);
export const rateChanged = (l: Pick<PayoutLine, "rate" | "cardRate">) => l.cardRate !== null && l.rate !== null && Math.abs(l.rate - l.cardRate) >= 0.005;

/** What is on the card as the contractor sees it: two cards that read the same have the same signature. */
export function cardSig(c: Pick<PayoutCard, "contractor" | "note" | "lines">): string {
  const lines = c.lines.filter((l) => l.on).map((l) => [l.option ?? "", l.description, l.area, l.uom, l.qty ?? 0, l.rate ?? 0].join("|"));
  const text = [c.contractor.trim(), c.note.trim(), ...lines].join("\n");
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Where a card stands with CompanyCam: never pushed, pushed and the same since, or changed since its last push. */
export function pushState(c: PayoutCard): { kind: "never" } | { kind: "current" | "changed"; last: PayoutPush } {
  const last = c.pushes[c.pushes.length - 1];
  if (!last) return { kind: "never" };
  return { kind: last.sig === cardSig(c) ? "current" : "changed", last };
}

/** Why a card can't be pushed yet, or null. */
export function pushProblem(c: PayoutCard): string | null {
  if (!c.contractor.trim()) return "Name the contractor first.";
  const on = c.lines.filter((l) => l.on);
  if (!on.length) return "Tick at least one line.";
  const blank = on.find((l) => l.rate === null || l.qty === null || !l.description.trim());
  if (blank) return `Give "${blank.description.trim() || "the typed line"}" a description, quantity and rate, or untick it.`;
  return null;
}

/**
 * What to say when a push got an answer that wasn't the app's own (2026-11-05: "The app didn't answer" said nothing
 * about why, so the cause couldn't be found). `signedOut` is a redirect to the sign-in page. A timeout or a platform
 * error may have happened after the card reached CompanyCam, so those say to reload and look before pushing again.
 */
export function pushNoAnswer(status: number, signedOut: boolean): string {
  if (signedOut || status === 401) return "You've been signed out. Reload the page, sign in, and push again.";
  if (status === 504) return "The app took too long to answer (504). Reload the page: if the card says In CompanyCam, it went; if not, push again.";
  if (status === 413) return "The card's picture was too large to send (413). Send a bug report with this message.";
  return `The app didn't answer properly (error ${status || "no status"}). Reload the page: if the card says In CompanyCam, it went; if not, push again. If it keeps happening, send a bug report with this message.`;
}

/* ---------- the image (drawn in the browser, src/components/PayoutCards.tsx) ---------- */

export type CardHeader = { quoteNumber: string | null; projectNumber: string | null; customer: string | null; site: string | null; date: string };

export type CardSheet = {
  title: string;
  ref: string;
  rows: [string, string][];
  /** Lines grouped by option when the card covers more than one. */
  groups: { option: string | null; lines: { description: string; detail: string; amount: string }[] }[];
  total: string;
  note: string;
  footer: string;
};

const dollars = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qtyText = (n: number | null) => (n === null ? "" : Number.isInteger(n) ? String(n) : String(round2(n)));

/** The card's words and figures, laid out top to bottom, ticked lines only. */
export function cardSheet(c: PayoutCard, h: CardHeader): CardSheet {
  const on = c.lines.filter((l) => l.on);
  const options = [...new Set(on.map((l) => l.option))];
  const split = options.filter((o) => o !== null).length > 1;
  const groups = (split ? options : [null]).map((option) => ({
    option,
    lines: on
      .filter((l) => !split || l.option === option)
      .map((l) => ({
        description: l.description.trim(),
        detail: [l.area.trim(), `${qtyText(l.qty)}${l.uom ? ` ${l.uom}` : ""} × ${dollars(l.rate ?? 0)}`].filter(Boolean).join(" · "),
        amount: dollars(payoutAmount(l)),
      })),
  }));
  return {
    title: "Contractor payout",
    ref: [h.projectNumber, h.quoteNumber].filter(Boolean).join(" · "),
    rows: [
      ["Contractor", c.contractor.trim()],
      ["Customer", h.customer ?? ""],
      ["Site", h.site ?? ""],
      ["Date", h.date],
    ].filter((r): r is [string, string] => Boolean(r[1])),
    groups,
    total: dollars(cardTotal(c)),
    note: c.note.trim(),
    footer: "Labour only. Materials are not part of this payout.",
  };
}

/** The image's file name in Airtable: who, which job, when (to the minute), so each push is its own file. */
export function cardFileName(contractor: string, h: Pick<CardHeader, "quoteNumber" | "projectNumber">, isoNow: string): string {
  const stamp = isoNow.slice(0, 16).replace("T", " ").replace(":", "");
  const words = ["Payout", contractor.trim() || "Contractor", h.projectNumber ?? h.quoteNumber ?? "", stamp].filter(Boolean).join(" - ");
  return `${words.replace(/[^A-Za-z0-9 ._-]+/g, "").replace(/\s+/g, " ").trim().slice(0, 120)}.jpg`;
}

/** The CompanyCam photo's description: the card in one line, so the timeline and its search say what it is. */
export function camDescription(c: PayoutCard, h: Pick<CardHeader, "quoteNumber" | "projectNumber">, by: string): string {
  const ref = h.projectNumber ?? h.quoteNumber;
  return `Payout card: ${c.contractor.trim()}, ${dollars(cardTotal(c))} labour${ref ? ` (${ref})` : ""}. Sent from the quote app by ${by}.`;
}

/* ---------- storing ---------- */

export function payoutsRaw(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const text = (v: unknown, max: number, lines = false) => {
  const s = typeof v === "string" ? v : "";
  const one = lines ? s.replace(/\r\n?/g, "\n") : s.replace(/\s+/g, " ");
  return one.trim().slice(0, max);
};

function amount(v: unknown, min: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*-?\d*\.?\d+\s*$/.test(v) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || Math.abs(n) > NUM_MAX) return null;
  return Math.round(n * 1000) / 1000;
}

const ID = /^[cl]\d{1,4}$/;
const REC = /^rec[A-Za-z0-9]{14}$/;

function cleanLine(v: unknown): PayoutLine | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Record<string, unknown>;
  if (typeof l.id !== "string" || !ID.test(l.id) || !l.id.startsWith("l")) return null;
  const qty = amount(l.qty, 0);
  const rate = amount(l.rate, -NUM_MAX);
  const cardRate = amount(l.cardRate, -NUM_MAX);
  return {
    id: l.id,
    ref: typeof l.ref === "string" && REC.test(l.ref) ? l.ref : null,
    option: l.option == null ? null : text(l.option, TEXT_MAX) || null,
    section: text(l.section, 40) || TYPED_SECTION,
    description: text(l.description, TEXT_MAX),
    area: text(l.area, TEXT_MAX),
    uom: text(l.uom, 20),
    qty: qty === null ? null : round2(qty),
    rate: rate === null ? null : round2(rate),
    cardRate: cardRate === null ? null : round2(cardRate),
    on: l.on === true,
  };
}

function cleanPush(v: unknown): PayoutPush | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (typeof p.at !== "string" || typeof p.sig !== "string") return null;
  return { at: p.at, by: text(p.by, TEXT_MAX), total: amount(p.total, -NUM_MAX) ?? 0, sig: p.sig.slice(0, 20), file: text(p.file, 200), camPhotoId: typeof p.camPhotoId === "string" ? p.camPhotoId.slice(0, 40) : null };
}

/**
 * The cards as the browser sent them, cleaned: text trimmed and capped, numbers checked, at most MAX_CARDS cards and
 * MAX_LINES lines each, unique ids. Push history is never taken from the browser: each card keeps the pushes the
 * stored copy has for the same card id.
 */
export function cleanPayouts(input: unknown, stored: PayoutSet | null): PayoutSet {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const pushes = new Map((stored?.cards ?? []).map((c) => [c.id, c.pushes]));
  const seen = new Set<string>();
  const cards: PayoutCard[] = [];
  for (const raw of Array.isArray(o.cards) ? o.cards : []) {
    if (cards.length >= MAX_CARDS || !raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== "string" || !ID.test(c.id) || !c.id.startsWith("c") || seen.has(c.id)) continue;
    seen.add(c.id);
    const lines: PayoutLine[] = [];
    for (const l of Array.isArray(c.lines) ? c.lines : []) {
      const line = cleanLine(l);
      if (line && !seen.has(line.id) && lines.length < MAX_LINES) {
        seen.add(line.id);
        lines.push(line);
      }
    }
    cards.push({ id: c.id, contractor: text(c.contractor, 80), note: text(c.note, NOTE_MAX, true), lines, pushes: pushes.get(c.id) ?? [] });
  }
  const options = (Array.isArray(o.options) ? o.options : []).filter((x): x is string => typeof x === "string" && REC.test(x)).slice(0, 20);
  const versionId = typeof o.versionId === "string" && REC.test(o.versionId) ? o.versionId : null;
  return { v: PAYOUTS_VERSION, versionId, options, cards, by: null, at: null };
}

/** What is stored, read back; text the app didn't write reads as no cards (and saving replaces it). */
export function parsePayouts(raw: string): PayoutSet | null {
  if (!raw.trim()) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.v !== PAYOUTS_VERSION) return null;
    const base = cleanPayouts(o, null);
    const byId = new Map((Array.isArray(o.cards) ? o.cards : []).flatMap((c) => (c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string" ? [[(c as { id: string }).id, c as Record<string, unknown>]] : [])));
    for (const c of base.cards) c.pushes = (Array.isArray(byId.get(c.id)?.pushes) ? (byId.get(c.id)!.pushes as unknown[]) : []).flatMap((p) => cleanPush(p) ?? []);
    return { ...base, by: typeof o.by === "string" ? o.by : null, at: typeof o.at === "string" ? o.at : null };
  } catch {
    return null;
  }
}

export function serializePayouts(set: PayoutSet, by: string, at: string): string {
  return JSON.stringify({ ...set, v: PAYOUTS_VERSION, by, at });
}

/** The set with one more push on a card. */
export function withPush(set: PayoutSet, cardId: string, push: PayoutPush): PayoutSet {
  return mapCard(set, cardId, (c) => ({ ...c, pushes: [...c.pushes, push].slice(-20) }));
}

/** Whether two sets hold the same cards (who saved them and when aside). */
export function samePayouts(a: PayoutSet | null, b: PayoutSet | null): boolean {
  const strip = (x: PayoutSet | null) => JSON.stringify(x ? { ...x, by: null, at: null } : emptySet());
  return strip(a) === strip(b);
}
