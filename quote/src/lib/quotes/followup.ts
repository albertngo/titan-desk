import "server-only";
import { AirtableError, getRecord, listByIds, listRecords, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { requireQuoterPerson } from "@/lib/auth";
import { followUpTagBodies } from "@/lib/activity/track";
import { sortThread } from "@/lib/conversation/thread";
import {
  ageWords,
  byUrgency,
  cleanNote,
  dueOf,
  dueWords,
  ownerOf,
  parseState,
  postponeBack,
  postponeProblem,
  serializeState,
  SNOOZE_CHOICES,
  threadSince,
  withLost,
  withPostpone,
  withSnooze,
  withTouch,
  type Due,
  type FollowUpState,
  type Thread,
} from "@/lib/followup/plan";
import { conversationMessages, conversationsForContact, ghlConfigured, lostReasons, pipelines, postponedUntilFieldId } from "@/lib/ghl/client";
import { BOOKING_URLS, ghlContactUrl, ghlConversationUrl } from "@/lib/ghl/ids";
import { buildPostpone, lostStatusBody, postponedStageId } from "@/lib/link/ghlRequest";
import { makeConfigured, removeFollowUpTags, sendMessage, sendToGhl, setOpportunityStatus } from "@/lib/make/client";
import { torontoDay } from "./group";
import { appendLog, logLine } from "./history";
import { ids, num, str } from "./values";

/**
 * The Follow up page (Albert, 2026-11-07; vault 05_decisions/2026-11-07-quote-follow-up-worklist). Reads Airtable for
 * the sent quotes and GHL for what has happened since, decides with src/lib/followup/plan.ts, and carries out the four
 * buttons. Quotes → Follow Up is written here only, compare-and-swap like Rooms. GHL is written only through Make
 * (src/lib/make/client.ts): the opportunity's stage and Postponed Until on `link`, its lost status and reason on `status`,
 * the follow-up tags on `untag`, and the optional note as an internal comment on `message`.
 */

/** Statuses a quote's newest sent version can have and still be waiting on the customer. */
const WAITING = new Set(["Sent", "Expired"]);
/** GHL reads at once, and how long each quote's thread may take before it counts as unread. */
const GHL_PARALLEL = 6;
const GHL_WAIT_MS = 8_000;
const threadCache = new Map<string, { at: number; messages: Awaited<ReturnType<typeof readMessages>> }>();
const CACHE_MS = 120_000;

export type FollowUpRow = {
  quoteRecordId: string;
  /** The newest sent version, which the customer has the link to; the row opens it. */
  versionId: string;
  quoteNumber: string | null;
  customer: string | null;
  description: string | null;
  basis: string | null;
  sentAt: string;
  owner: string | null;
  due: Due;
  why: string;
  age: string;
  /** What is kept on the quote, shown on the row (a postpone's note, the last "I followed up" note). */
  state: FollowUpState;
  /** The field as read, for the compare-and-swap. */
  seen: string;
  contactId: string | null;
  opportunityId: string | null;
  ghlUrl: string | null;
  /** False when GHL couldn't be read for this quote: only "I followed up" counted. */
  ghlRead: boolean;
};

export type FollowUpPage = {
  me: string;
  rows: FollowUpRow[];
  lostReasons: { id: string; name: string }[] | null;
  inHomeUrl: string;
  ghlOn: boolean;
  makeOn: boolean;
  today: string;
};

function customerOf(f: Record<string, unknown>): string | null {
  const name = [str(f[QUOTE.firstName]), str(f[QUOTE.lastName])].filter(Boolean).join(" ");
  return name || str(f[QUOTE.customerName]);
}

async function readMessages(contactId: string) {
  const conversations = (await conversationsForContact(contactId)).slice(0, 2);
  const pages = await Promise.all(conversations.map((c) => conversationMessages(c.id, 60)));
  return { messages: sortThread(pages.flatMap((p) => p.messages)), conversationId: conversations[0]?.id ?? null };
}

/** The contact's thread, cached two minutes so a page reload after a button doesn't read GHL again for every quote. */
async function threadOf(contactId: string): Promise<Awaited<ReturnType<typeof readMessages>> | null> {
  const hit = threadCache.get(contactId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.messages;
  try {
    const messages = await Promise.race([readMessages(contactId), new Promise<never>((_, no) => setTimeout(() => no(new Error("GHL too slow")), GHL_WAIT_MS))]);
    threadCache.set(contactId, { at: Date.now(), messages });
    return messages;
  } catch (e) {
    console.error("followUp thread", e);
    return null;
  }
}

async function inBatches<T, R>(items: T[], n: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(f))));
  return out;
}

export async function loadFollowUps(): Promise<FollowUpPage> {
  const person = await requireQuoterPerson();
  const now = new Date();
  const [versions, quotes] = await Promise.all([
    listRecords(T.versions, { fields: [VERSION.quote, VERSION.version, VERSION.status, VERSION.basis, VERSION.sentAt, VERSION.validUntil, VERSION.sentBy, VERSION.createdBy, VERSION.changeNo] }),
    listRecords(T.quotes, { fields: [QUOTE.quoteNumber, QUOTE.customerName, QUOTE.firstName, QUOTE.lastName, QUOTE.projectNumber, QUOTE.description, QUOTE.ghlContactId, QUOTE.ghlOpportunityId, QUOTE.followUp] }),
  ]);
  const byQuote = new Map<string, typeof versions>();
  for (const v of versions) {
    const q = ids(v.fields[VERSION.quote])[0];
    if (q) byQuote.set(q, [...(byQuote.get(q) ?? []), v]);
  }
  const candidates = quotes.flatMap((q) => {
    if (str(q.fields[QUOTE.projectNumber])) return [];
    const vs = (byQuote.get(q.id) ?? []).sort((a, b) => (num(b.fields[VERSION.version]) ?? 0) - (num(a.fields[VERSION.version]) ?? 0));
    const statuses = vs.map((v) => str(v.fields[VERSION.status]));
    if (statuses.some((s) => s === "Accepted" || s === "Won") || statuses[0] === "Lost") return [];
    const sent = vs.find((v) => WAITING.has(str(v.fields[VERSION.status]) ?? "") && !((num(v.fields[VERSION.changeNo]) ?? 0) > 0) && str(v.fields[VERSION.sentAt]));
    if (!sent) return [];
    const seen = str(q.fields[QUOTE.followUp]) ?? "";
    const state = parseState(seen);
    if (state.lost) return [];
    return [{ q, sent, seen, state }];
  });

  const ghlOn = ghlConfigured();
  const threads = await inBatches(candidates, GHL_PARALLEL, async (c) => {
    const contactId = str(c.q.fields[QUOTE.ghlContactId]);
    return ghlOn && contactId && /^[A-Za-z0-9]+$/.test(contactId) ? threadOf(contactId) : null;
  });

  const rows: FollowUpRow[] = candidates.flatMap((c, i) => {
    const sentAt = str(c.sent.fields[VERSION.sentAt]) as string;
    const t = threads[i];
    const thread: Thread | null = t ? threadSince(t.messages, sentAt) : null;
    const due = dueOf({ sentAt, validUntil: str(c.sent.fields[VERSION.validUntil]), state: c.state, thread, now, torontoDay });
    if (!due) return [];
    const contactId = str(c.q.fields[QUOTE.ghlContactId]);
    return [
      {
        quoteRecordId: c.q.id,
        versionId: c.sent.id,
        quoteNumber: str(c.q.fields[QUOTE.quoteNumber]),
        customer: customerOf(c.q.fields),
        description: str(c.q.fields[QUOTE.description]),
        basis: str(c.sent.fields[VERSION.basis]),
        sentAt,
        owner: ownerOf(str(c.sent.fields[VERSION.sentBy]), str(c.sent.fields[VERSION.createdBy])),
        due,
        why: dueWords(due),
        age: ageWords(due.age),
        state: c.state,
        seen: c.seen,
        contactId,
        opportunityId: str(c.q.fields[QUOTE.ghlOpportunityId]),
        ghlUrl: t?.conversationId ? ghlConversationUrl(t.conversationId) : contactId ? ghlContactUrl(contactId) : null,
        ghlRead: Boolean(t),
      },
    ];
  });
  rows.sort(byUrgency);

  let reasons: { id: string; name: string }[] | null = null;
  if (ghlOn) reasons = await lostReasons().catch((e) => (console.error("lostReasons", e), null));
  return { me: person.email.toLowerCase(), rows, lostReasons: reasons, inHomeUrl: BOOKING_URLS.inHome, ghlOn, makeOn: makeConfigured(), today: torontoDay(now) };
}

/* ---------- the buttons ---------- */

export type FollowUpResult = { ok: true; notes: string[] } | { ok: false; message: string };

const REC_ID = /^rec[A-Za-z0-9]{14}$/;
const GONE = "This quote isn't in Airtable any more.";
const MOVED = "Someone else updated this quote's follow-up since the page opened, so nothing was changed. Reload and try again.";

type Current = { state: FollowUpState; contactId: string | null; opportunityId: string | null; quoteNumber: string | null; version: { id: string; basis: string | null; editLog: string | null } | null };

/** The quote as Airtable has it now, refused when its Follow Up isn't what the page opened with. */
async function current(quoteRecordId: string, seen: string): Promise<Current | string> {
  if (!REC_ID.test(quoteRecordId)) return GONE;
  let q;
  try {
    q = await getRecord(T.quotes, quoteRecordId);
  } catch (e) {
    if (e instanceof AirtableError && (e.status === 404 || e.status === 403)) return GONE;
    return `Airtable couldn't be read (${e instanceof Error ? e.message.slice(0, 120) : "error"}), so nothing was changed. Try again.`;
  }
  const raw = str(q.fields[QUOTE.followUp]) ?? "";
  if (raw !== (typeof seen === "string" ? seen : "")) return MOVED;
  // The version the customer has: the newest one still Sent or Expired.
  const vs = await listByIds(T.versions, ids(q.fields[QUOTE.versions]), [VERSION.version, VERSION.status, VERSION.basis, VERSION.editLog, VERSION.changeNo]).catch(() => []);
  const sent = vs
    .filter((v) => WAITING.has(str(v.fields[VERSION.status]) ?? "") && !((num(v.fields[VERSION.changeNo]) ?? 0) > 0))
    .sort((a, b) => (num(b.fields[VERSION.version]) ?? 0) - (num(a.fields[VERSION.version]) ?? 0))[0];
  return {
    state: parseState(raw),
    contactId: str(q.fields[QUOTE.ghlContactId]),
    opportunityId: str(q.fields[QUOTE.ghlOpportunityId]),
    quoteNumber: str(q.fields[QUOTE.quoteNumber]),
    version: sent ? { id: sent.id, basis: str(sent.fields[VERSION.basis]), editLog: str(sent.fields[VERSION.editLog]) } : null,
  };
}

async function saveState(quoteRecordId: string, state: FollowUpState): Promise<string | null> {
  try {
    await updateRecord(T.quotes, quoteRecordId, { [QUOTE.followUp]: serializeState(state) });
    return null;
  } catch (e) {
    return `Airtable didn't take it (${e instanceof Error ? e.message.slice(0, 120) : "error"}).`;
  }
}

/** One History line on the version the customer has, so the quote page's History card shows it. Best effort. */
async function logOnVersion(c: Current, email: string, what: string, extra: Record<string, unknown> = {}): Promise<string | null> {
  if (!c.version) return null;
  try {
    await updateRecord(T.versions, c.version.id, { [VERSION.editLog]: appendLog(c.version.editLog, logLine(new Date(), email, what)), ...extra });
    return null;
  } catch (e) {
    return `The quote's History line wasn't written (${e instanceof Error ? e.message.slice(0, 80) : "error"}).`;
  }
}

/** The two quote-sent tags off, so the follow-up workflows stop. Best effort: what happened goes in the notes. */
async function untag(c: Current, notes: string[]) {
  if (!c.contactId) return notes.push("No GHL contact on this quote, so no follow-up tags to take off.");
  if (!makeConfigured()) return notes.push("Make isn't switched on here, so the follow-up tags weren't taken off.");
  try {
    await removeFollowUpTags(c.contactId, followUpTagBodies(null).removeBody);
    notes.push("The follow-up tags came off, so the automated texts stop.");
  } catch (e) {
    notes.push(`The follow-up tags didn't come off (${e instanceof Error ? e.message.slice(0, 100) : "error"}). Remove "quote sent: …" on the contact in GHL.`);
  }
}

/** The optional note as an internal comment on the customer's conversation. Best effort. */
async function comment(c: Current, words: string, notes: string[]) {
  if (!c.contactId || !makeConfigured()) return;
  try {
    await sendMessage({ type: "InternalComment", contactId: c.contactId, message: words, mentions: [] });
  } catch (e) {
    notes.push(`The note didn't reach GHL (${e instanceof Error ? e.message.slice(0, 80) : "error"}).`);
  }
}

/** "I followed up": a call, a visit or a talk in the store that left nothing in GHL. */
export async function logTouch(quoteRecordId: string, seen: string, note: unknown): Promise<FollowUpResult> {
  const person = await requireQuoterPerson();
  const c = await current(quoteRecordId, seen);
  if (typeof c === "string") return { ok: false, message: c };
  const n = cleanNote(note);
  const bad = await saveState(quoteRecordId, withTouch(c.state, { at: new Date().toISOString(), by: person.email, ...(n ? { note: n } : {}) }));
  if (bad) return { ok: false, message: `Not saved: ${bad}` };
  const notes: string[] = [];
  const logBad = await logOnVersion(c, person.email, `followed up${n ? `: ${n}` : ""}`);
  if (logBad) notes.push(logBad);
  return { ok: true, notes };
}

/** "Still deciding, check again in N days": the app only, nothing in GHL. */
export async function snoozeFollowUp(quoteRecordId: string, seen: string, days: unknown): Promise<FollowUpResult> {
  const person = await requireQuoterPerson();
  const d = Number(days);
  if (!(SNOOZE_CHOICES as readonly number[]).includes(d)) return { ok: false, message: "Pick 3, 7 or 14 days." };
  const c = await current(quoteRecordId, seen);
  if (typeof c === "string") return { ok: false, message: c };
  const now = new Date();
  const bad = await saveState(quoteRecordId, withSnooze(c.state, torontoDay(now), d, now.toISOString(), person.email));
  return bad ? { ok: false, message: `Not saved: ${bad}` } : { ok: true, notes: [] };
}

/** Postpone until a date: GHL's Postponed stage and Postponed Until, the tags off, an optional note; back on the list a month before. */
export async function postponeFollowUp(quoteRecordId: string, seen: string, until: unknown, note: unknown): Promise<FollowUpResult> {
  const person = await requireQuoterPerson();
  const now = new Date();
  const today = torontoDay(now);
  const problem = postponeProblem(today, until);
  if (problem) return { ok: false, message: problem };
  const date = until as string;
  const c = await current(quoteRecordId, seen);
  if (typeof c === "string") return { ok: false, message: c };
  const n = cleanNote(note);
  const notes: string[] = [];

  if (c.contactId && c.opportunityId && makeConfigured()) {
    let stageId: string | null = null;
    try {
      stageId = postponedStageId(await pipelines());
    } catch (e) {
      return { ok: false, message: `GHL's pipelines couldn't be read (${e instanceof Error ? e.message.slice(0, 80) : "error"}), so nothing was changed. Try again.` };
    }
    if (!stageId) return { ok: false, message: "GHL's Sales pipeline has no single Postponed stage, so nothing was changed. Check the stage names in GHL." };
    const fieldId = await postponedUntilFieldId();
    try {
      await sendToGhl(buildPostpone({ contactId: c.contactId, opportunityId: c.opportunityId, stageId, untilFieldId: fieldId, until: date }));
    } catch (e) {
      return { ok: false, message: `GHL wasn't changed (${e instanceof Error ? e.message.slice(0, 100) : "error"}), so nothing was saved. Try again.` };
    }
    notes.push(fieldId ? `The opportunity is Postponed, with Postponed Until ${date}.` : `The opportunity is Postponed. Its Postponed Until field couldn't be found, so set ${date} on it in GHL.`);
  } else {
    notes.push(c.opportunityId ? "Make isn't switched on here, so GHL wasn't changed." : "This quote isn't linked to an opportunity, so GHL wasn't changed.");
  }

  const back = postponeBack(today, date);
  const bad = await saveState(quoteRecordId, withPostpone(c.state, { until: date, back, at: now.toISOString(), by: person.email, ...(n ? { note: n } : {}) }));
  if (bad) return { ok: false, message: `GHL was changed but the quote wasn't: ${bad} Press Postpone again.` };
  await untag(c, notes);
  await comment(c, `Follow-up: postponed to ${date}${c.quoteNumber ? ` (${c.quoteNumber})` : ""}, by ${person.email}.${n ? ` Note: ${n}` : ""}`, notes);
  const logBad = await logOnVersion(c, person.email, `postponed to ${date}${n ? `: ${n}` : ""}`);
  if (logBad) notes.push(logBad);
  notes.push(`It comes back on the list on ${back}.`);
  return { ok: true, notes };
}

/** Lost: GHL's own reason on the opportunity, the version Lost, the tags off, an optional note. */
export async function markLost(quoteRecordId: string, seen: string, reasonId: unknown, note: unknown): Promise<FollowUpResult> {
  const person = await requireQuoterPerson();
  const c = await current(quoteRecordId, seen);
  if (typeof c === "string") return { ok: false, message: c };
  const n = cleanNote(note);
  const notes: string[] = [];
  let reason: { id: string; name: string } | null = null;

  if (c.opportunityId && makeConfigured()) {
    const list = await lostReasons().catch(() => null);
    if (list && list.length) {
      reason = list.find((r) => r.id === reasonId) ?? null;
      if (!reason) return { ok: false, message: "Pick one of GHL's lost reasons." };
    }
    try {
      await setOpportunityStatus(c.opportunityId, lostStatusBody(reason?.id ?? null));
    } catch (e) {
      return { ok: false, message: `GHL wasn't changed (${e instanceof Error ? e.message.slice(0, 100) : "error"}), so nothing was saved. Try again.` };
    }
    notes.push(reason ? `The opportunity is Lost: ${reason.name}.` : "The opportunity is Lost. GHL's lost reasons couldn't be read, so set the reason in GHL.");
  } else {
    notes.push(c.opportunityId ? "Make isn't switched on here, so GHL wasn't changed." : "This quote isn't linked to an opportunity, so GHL wasn't changed.");
  }

  const bad = await saveState(quoteRecordId, withLost(c.state, { at: new Date().toISOString(), by: person.email, reasonId: reason?.id ?? null, reason: reason?.name ?? null, ...(n ? { note: n } : {}) }));
  if (bad) return { ok: false, message: `GHL was changed but the quote wasn't: ${bad} Press Lost again.` };
  await untag(c, notes);
  await comment(c, `Follow-up: marked lost${reason ? ` (${reason.name})` : ""}${c.quoteNumber ? ` on ${c.quoteNumber}` : ""}, by ${person.email}.${n ? ` Note: ${n}` : ""}`, notes);
  const logBad = await logOnVersion(c, person.email, `marked lost${reason ? `: ${reason.name}` : ""}${n ? `. ${n}` : ""}`, { [VERSION.status]: "Lost" });
  if (logBad) notes.push(logBad);
  return { ok: true, notes };
}
