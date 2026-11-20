import { diffOptions, changeWords } from "@/lib/change/diff";
import { rangeText, type CopyOption, type CustomerCopy } from "@/lib/send/copy";
import { firstNameOf, logEntries } from "./history";
import { splitNote } from "./staffNote";

export { cleanStaffNote, NOTE_MARK, splitNote, STAFF_NOTE_MAX, withNote } from "./staffNote";

/**
 * The send history on All quotes (Albert, 2026-11-20: "review what has changed, whose account made the last sent
 * version, and a short description on those changes … a per quote show history", "Jsut the quote app front desk",
 * "its an optional note"). Pure; tested in tests/sendHistory.test.ts. The loader is `loadSendHistory()` in
 * src/lib/quotes/sendHistoryLoad.ts.
 *
 * One row per version that went out, newest first: who sent it, how, the optional staff note typed on the Send card,
 * and what changed since the version sent before it, worked out from the two frozen customer copies (what the
 * customer actually got, never the live lines). Prices are before HST, as everywhere on the staff screens.
 *
 * The staff note lives in the version's append-only Edit Log, on the send's own line, after NOTE_MARK. It is never in
 * the customer copy, the PDF, the email or the text; it goes to GHL only in the staff internal comment and contact note.
 */

/** A version as the history reads it. */
export type HistoryVersion = {
  id: string;
  version: number | null;
  label: string | null;
  status: string | null;
  changeNo: number | null;
  sentAt: string | null;
  sentBy: string | null;
  sentTo: string | null;
  copy: CustomerCopy | null;
  editLog: string | null;
  lastEditedBy: string | null;
  lastEditedAt: string | null;
  createdTime: string;
};

/** A later send of the same version (Send again), from its Edit Log. */
export type Resend = { when: string; who: string; how: string; note: string | null };

export type HistoryRow = {
  id: string;
  label: string;
  status: string | null;
  sentAt: string;
  /** First name when there is one, else the address. */
  by: string;
  how: string;
  note: string | null;
  /** One line per option: name, install sqft and price before HST, arrows where they moved since the send before. */
  options: string[];
  /** The rest of what changed (lines, range, pricing shown, discount, good-until), behind Details. */
  details: string[];
  first: boolean;
  /** Sent again as a new version with nothing changed. */
  same: boolean;
  resends: Resend[];
};

export type WorkingDraft = { id: string; label: string; lastEditedBy: string | null; lastEditedAt: string | null };

export type SendHistory = { rows: HistoryRow[]; draft: WorkingDraft | null };

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const whole = (n: number) => Math.round(n).toLocaleString("en-CA");
const cash = (n: number) => `$${whole(n)}`;

/** One option's price as the customer was shown it, before HST: the range on a preliminary sent as one. */
export function priceWords(o: CopyOption): string {
  return o.range ? rangeText(o.range.low, o.range.high, "–") : cash(o.totals.subtotal);
}

const samePrice = (a: CopyOption, b: CopyOption) => priceWords(a) === priceWords(b);

/** Who, as a person: Albert, Joey (info@), else the address as it was recorded. */
export function personWords(email: string | null): string {
  if (!email) return "someone";
  return firstNameOf({ email, name: null }) ?? email;
}

/**
 * The options of two copies paired up by name. A quote of one option sent again with one option is the same option,
 * renamed if its name moved; with several, a name that moved reads as one removed and one added, never a guess.
 */
function pairOptions(before: CopyOption[], after: CopyOption[]) {
  const left = [...before];
  const pairs: { b: CopyOption; a: CopyOption }[] = [];
  const added: CopyOption[] = [];
  for (const a of after) {
    const i = left.findIndex((b) => key(b.name) === key(a.name));
    if (i >= 0) pairs.push({ b: left.splice(i, 1)[0], a });
    else added.push(a);
  }
  if (before.length === 1 && after.length === 1 && added.length === 1) return { pairs: [...pairs, { b: left[0], a: added[0] }], added: [], removed: [] };
  return { pairs, added, removed: left };
}

/**
 * An option's install square feet on the copy (Albert, 2026-11-20: "a simple one liner … Sqft and Prices noted"): its
 * Install lines in sqft, as the material check counts them (src/lib/quotes/sqftCheck.ts), less refinishing, sanding,
 * painting and glue assist. Null when it has none (a stairs option, or a preliminary sent as words only).
 */
export function installSqft(o: CopyOption): number | null {
  let total = 0;
  for (const s of o.sections) {
    if (key(s.name) !== "install") continue;
    for (const l of s.lines) {
      if (l.kind !== "item" || l.optional || l.uom !== "sqft" || !l.qty || l.qty <= 0) continue;
      if (/\b(refinish|sand|paint)|^glue assist/i.test(l.description)) continue;
      total += l.qty;
    }
  }
  return total > 0 ? Math.round(total) : null;
}

const sqftWords = (n: number) => `${whole(n)} sqft`;
/** "800 sqft", "800 → 860 sqft"; null when neither copy has a figure. */
function sqftMove(b: number | null, a: number | null): string | null {
  if (a === null && b === null) return null;
  if (b === null || a === null) return a === null ? `no install sqft (was ${sqftWords(b!)})` : sqftWords(a);
  return b === a ? sqftWords(a) : `${whole(b)} → ${sqftWords(a)}`;
}

/** One option on one line: name, install sqft and price before HST, with an arrow wherever a figure moved. */
export function optionLine(a: CopyOption | null, b: CopyOption | null = null): string {
  if (!a) return `${b!.name} removed (was ${priceWords(b!)})`;
  const sq = b ? sqftMove(installSqft(b), installSqft(a)) : sqftMove(null, installSqft(a));
  const price = b && !samePrice(b, a) ? `${priceWords(b)} → ${priceWords(a)}` : priceWords(a);
  const same = b && samePrice(b, a) && installSqft(b) === installSqft(a);
  const name = b && key(b.name) !== key(a.name) ? `${a.name} (was ${b.name})` : a.name;
  return `${name}: ${[sq, price].filter(Boolean).join(" · ")}${same ? ", no change" : ""}`;
}

export type CopyChanges = {
  /** One line per option, always shown: added options say "(new)", removed ones what they were. */
  options: string[];
  /** Everything else, behind Details: line changes, range or exact, lump sum or breakdown, discount, good-until. */
  details: string[];
};

/** What changed between two sent copies. Both lists empty of moves = the same quote sent again. */
export function copyChanges(before: CustomerCopy, after: CustomerCopy): CopyChanges & { moved: boolean } {
  const options: string[] = [];
  const details: string[] = [];
  let moved = false;
  const { pairs, removed } = pairOptions(before.options, after.options);
  const many = after.options.length > 1 || before.options.length > 1;
  const on = (o: CopyOption) => (many ? ` on ${o.name}` : "");
  // In the order the customer sees them, then what was taken away.
  for (const a of after.options) {
    const p = pairs.find((x) => x.a === a);
    if (!p) {
      options.push(`${optionLine(a)} (new)`);
      moved = true;
      continue;
    }
    const { b } = p;
    options.push(optionLine(a, b));
    if (key(b.name) !== key(a.name) || !samePrice(b, a) || installSqft(b) !== installSqft(a)) moved = true;
    for (const c of diffOptions(b, a)) {
      details.push(`${changeWords(c)}${on(a)}`);
      moved = true;
    }
    if (!!b.range !== !!a.range) {
      details.push(`${many ? `${a.name}: ` : ""}${a.range ? "sent as a range" : "exact price"}`);
      moved = true;
    }
  }
  for (const b of removed) {
    options.push(optionLine(null, b));
    moved = true;
  }
  const way = (c: CustomerCopy) => c.pricing ?? "itemised";
  if (way(before) !== way(after)) details.push(way(after) === "itemised" ? "breakdown sent" : "lump sum");
  if ((before.discountRate ?? 0) !== (after.discountRate ?? 0)) details.push(`discount ${Math.round((before.discountRate ?? 0) * 100)}% → ${Math.round((after.discountRate ?? 0) * 100)}%`);
  if (before.validUntil && after.validUntil && before.validUntil !== after.validUntil) details.push(`good until ${after.validUntil}`);
  return { options, details, moved: moved || details.length > 0 };
}

const SEND_WORDS = /^(sent by |marked sent|sent again by )/;

/** "email and text", "marked sent, nothing sent", from the send's Edit Log line or Sent To. */
function howOf(v: HistoryVersion, line: { what: string } | null): string {
  if (line) {
    if (line.what.startsWith("marked sent")) return "marked sent, nothing went to the customer";
    const m = /^sent by ([a-z ]+?)(?: from |,|$)/.exec(line.what);
    if (m) return m[1];
  }
  return v.sentTo ? v.sentTo.toLowerCase().replace(", ", " and ") : "";
}

const labelOf = (v: Pick<HistoryVersion, "label" | "version" | "changeNo">) => v.label ?? (v.changeNo ? `Change ${v.changeNo}` : `v${v.version ?? "?"}`);

/** Sent versions oldest first, so each is compared with the one sent before it. */
const bySent = (a: HistoryVersion, b: HistoryVersion) => (a.sentAt ?? "").localeCompare(b.sentAt ?? "") || (a.version ?? 0) - (b.version ?? 0) || a.createdTime.localeCompare(b.createdTime);

/** The quote's send history, newest first, and the working draft when there is one. */
export function sendHistory(versions: HistoryVersion[]): SendHistory {
  const sent = versions.filter((v) => v.sentAt && v.copy).sort(bySent);
  const rows: HistoryRow[] = [];
  let prev: CustomerCopy | null = null;
  for (const v of sent) {
    const entries = logEntries(v.editLog).reverse(); // oldest first
    const sends = entries.filter((e) => SEND_WORDS.test(e.what));
    const firstSend = sends.find((e) => !e.what.startsWith("sent again")) ?? null;
    const own = firstSend ? splitNote(firstSend.what) : null;
    const c = prev ? copyChanges(prev, v.copy!) : null;
    rows.push({
      id: v.id,
      label: labelOf(v),
      status: v.status,
      sentAt: v.sentAt!,
      by: personWords(v.sentBy),
      how: howOf(v, own),
      note: own?.note ?? null,
      options: c ? c.options : v.copy!.options.map((o) => optionLine(o)),
      details: c ? c.details : [],
      first: !prev,
      same: c ? !c.moved : false,
      resends: sends
        .filter((e) => e.what.startsWith("sent again"))
        .map((e) => {
          const s = splitNote(e.what);
          return { when: e.when, who: personWords(e.who), how: s.what.replace(/^sent again by /, "").split(",")[0], note: s.note };
        }),
    });
    prev = v.copy;
  }
  const draft = versions.find((v) => v.status === "Draft" && !v.sentAt) ?? null;
  return {
    rows: rows.reverse(),
    draft: draft ? { id: draft.id, label: labelOf(draft), lastEditedBy: draft.lastEditedBy ? personWords(draft.lastEditedBy) : null, lastEditedAt: draft.lastEditedAt } : null,
  };
}
