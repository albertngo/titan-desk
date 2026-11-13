import "server-only";
import { AirtableError, getRecord, listByIds, listRecords, updateRecord } from "@/lib/airtable/client";
import { addOutsideOption } from "./outside";
import { OPTION, QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { requireQuoterPerson } from "@/lib/auth";
import { followUpTagBodies } from "@/lib/activity/track";
import { BRIEF_MODEL, ClaudeError, readerOn, writeJson } from "@/lib/anthropic/client";
import { briefPrompt, briefSignature, cleanBrief, type Brief, type ThreadLine } from "@/lib/followup/brief";
import { sortThread, type Message } from "@/lib/conversation/thread";
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
  SCHEDULE_DAYS,
  TYPICAL_CLOSE_DAYS,
  threadSince,
  withAlerted,
  withAutoOff,
  withSent,
  withBrief,
  withLost,
  withPostpone,
  withSnooze,
  withTouch,
  type Due,
  type FollowUpState,
  type Thread,
} from "@/lib/followup/plan";
import { calendarEvents, contactAppointments, conversationMessages, freeSlots, locationUsers, conversationsForContact, ghlConfigured, lostDetailsFieldId, lostReasons, pipelines, postponedUntilFieldId } from "@/lib/ghl/client";
import { visitFact, visitedWhere, visitOf, visitWords, type Visit } from "@/lib/followup/visit";
import { FLAG_WORDS, overCap, scoreOf, staysAuto, TIER_WORDS, TOP_VALUE, type Score, type Tier } from "@/lib/followup/score";
import { pickSlots, SLOT_DAYS } from "@/lib/followup/slots";
import { EVENTS_KEPT, newEvents, replyGaps } from "@/lib/followup/perf";
import { settings } from "@/lib/settings/settings";
import { cleanOffChannel, HOW_WORDS, offChannelNote, offChannelPlan, offChannelPrompt, priceCandidates, SENT_WORDS, sentOutside, type OffChannel } from "@/lib/followup/offchannel";
import type { Settings } from "@/lib/settings/registry";
import { autoBlock, channelFor, checkDraft, editShare, readiness, type Channel, type DraftKind } from "@/lib/followup/autosend";
import { activityEntries } from "@/lib/activity/track";
import { fromAttempts, fromTheirNumber, noNumberWords, textFromFor } from "@/lib/send/plan";
import { timingSafeEqual } from "node:crypto";
import { offerValue, type OptionMoney } from "./group";
import { VISIT_LOOKBACK_DAYS, visitsWithoutQuote, type ContactQuotes, type VisitNoQuote } from "@/lib/followup/visits";
import { BOOKING_CALENDAR_IDS, BOOKING_URLS, ghlContactUrl, ghlConversationUrl } from "@/lib/ghl/ids";
import { buildLostDetails, buildPostpone, lostDetailsText, lostStatusBody, postponedStageId } from "@/lib/link/ghlRequest";
import { makeConfigured, removeFollowUpTags, sendAlert, sendMessage, sendToGhl, setOpportunityStatus } from "@/lib/make/client";
import { torontoDay } from "./group";
import { appendLog, firstNameOf, logLine } from "./history";
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

type VersionRec = Awaited<ReturnType<typeof listRecords>>[number];

/**
 * The version a follow-up reads: the newest one the app sent that is still waiting, or, when a firm price was given by
 * text or on a call after that (2026-11-13, `sentOutside()`), the newest version (the draft), read as sent at the time
 * the price was given. Nothing is written to the version: Sent At and Status stay the app's own.
 */
function waitingOrOutside(vs: VersionRec[], state: FollowUpState): { version: VersionRec; outside: OffChannel | null } | null {
  const sorted = [...vs].sort((a, b) => (num(b.fields[VERSION.version]) ?? 0) - (num(a.fields[VERSION.version]) ?? 0));
  const sent = sorted.find((v) => WAITING.has(str(v.fields[VERSION.status]) ?? "") && !((num(v.fields[VERSION.changeNo]) ?? 0) > 0) && str(v.fields[VERSION.sentAt]));
  const lastAppSend = sorted.map((v) => str(v.fields[VERSION.sentAt])).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
  const off = state.offChannel;
  if (sentOutside(off, lastAppSend)) {
    const draft = sorted[0];
    if (draft && !["Accepted", "Won", "Lost"].includes(str(draft.fields[VERSION.status]) ?? "")) {
      return { version: { ...draft, fields: { ...draft.fields, [VERSION.sentAt]: off.at, [VERSION.status]: "Sent", [VERSION.basis]: str(draft.fields[VERSION.basis]) ?? "Measured" } }, outside: off };
    }
  }
  return sent ? { version: sent, outside: null } : null;
}
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
  /** The sender's first name, for the Last sent by filter and column ("Joey" for info@). */
  ownerName: string | null;
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
  /** Where the lead is: no visit yet, booked, visited, missed; null when GHL's appointments couldn't be read. */
  visit: Visit | null;
  visitText: string | null;
  /** The kept brief when it was written for the thread as it stands, else null and briefStale. */
  brief: Brief | null;
  briefStale: boolean;
  /** How much it needs a person (2026-11-09): the 0 to 100 score, its tier and why. */
  score: Score;
  /** The quote's likely total with HST (what the customer would most likely take), or null. */
  value: number | null;
  /** A Needs you row past the sender's daily cap: shown under Next up, not counted in the badge. */
  waiting: boolean;
  /** Measured quotes the app follows up itself (2026-11-09, round 3): the channel it would use, or null when none. */
  channel: Channel | null;
  /** Why the app wouldn't send this one on its own right now (null = it would, once the app's switch is on). */
  autoWhy: string | null;
  /** Customer messages since a month before the send, with hours to our first human reply (2026-11-10, Performance). */
  replies: { at: string; hours: number | null }[];
  /** Who a Send goes to, for the confirm box (2026-11-09): the phone's last 4 digits, or the email. */
  toWords: string | null;
  /** A firm price given by text or on a call and nothing sent from the app since (2026-11-13): the row reads "Sent by text". */
  outside: { how: OffChannel["how"]; words: string; note: string } | null;
};

export type FollowUpPage = {
  me: string;
  rows: FollowUpRow[];
  lostReasons: { id: string; name: string }[] | null;
  inHomeUrl: string;
  ghlOn: boolean;
  makeOn: boolean;
  /** Claude is set up here, so briefs can be written. */
  briefsOn: boolean;
  /** "Visited, no quote yet" (2026-11-07); null when GHL's calendars couldn't be read. */
  visits: (VisitNoQuote & { visitorName: string | null; ghlUrl: string })[] | null;
  today: string;
  /** The Stage 2 report: taps so far and how many went out as written (Albert flips the switch on it). */
  sending: { taps: number; light: number; share: number; ready: boolean; autoOn: boolean };
  /** The Settings page's thresholds, for the score bar's marks and the group hints. */
  dials: { needsYouAt: number; watchAt: number; dailyCap: number };
};

function customerOf(f: Record<string, unknown>): string | null {
  const name = [str(f[QUOTE.firstName]), str(f[QUOTE.lastName])].filter(Boolean).join(" ");
  return name || str(f[QUOTE.customerName]);
}

async function readMessages(contactId: string) {
  const [conversations, appts] = await Promise.all([
    conversationsForContact(contactId).then((c) => c.slice(0, 2)),
    // The visit chip (2026-11-07). Appointments that can't be read leave the chip unknown, never "No visit yet".
    contactAppointments(contactId).catch((e) => (console.error("contactAppointments", e), null)),
  ]);
  const pages = await Promise.all(conversations.map((c) => conversationMessages(c.id, 60)));
  return { messages: sortThread(pages.flatMap((p) => p.messages)), conversationId: conversations[0]?.id ?? null, appts };
}

const visitNow = (t: { appts: Parameters<typeof visitOf>[0] } | null, now: Date) => (t ? visitOf(t.appts, now, torontoDay, BOOKING_CALENDAR_IDS) : null);

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
  return { ...(await readFollowUps(new Date())), me: person.email.toLowerCase() };
}

/** Auto follow-ups switched on for the app (Albert's switch, 2026-11-09). Off unless exactly "on". */
const autoSwitchOn = (st: Settings) => st.autoFollowUps;

/** The page's rows, with no sign-in check: called by loadFollowUps (signed in) and the key-gated Stage 2 run only. */
async function readFollowUps(now: Date): Promise<Omit<FollowUpPage, "me">> {
  const st = await settings();
  const [versions, quotes] = await Promise.all([
    listRecords(T.versions, { fields: [VERSION.quote, VERSION.version, VERSION.status, VERSION.basis, VERSION.sentAt, VERSION.validUntil, VERSION.sentBy, VERSION.createdBy, VERSION.changeNo, VERSION.openedCount, VERSION.lastOpenedAt, VERSION.firstOpenedAt, VERSION.activityLog] }),
    listRecords(T.quotes, { fields: [QUOTE.quoteNumber, QUOTE.customerName, QUOTE.firstName, QUOTE.lastName, QUOTE.projectNumber, QUOTE.description, QUOTE.ghlContactId, QUOTE.ghlOpportunityId, QUOTE.followUp, QUOTE.phone, QUOTE.email] }),
  ]);
  const optionsOf = await optionMoney().catch((e) => (console.error("followUp options", e), new Map<string, OptionMoney[]>()));
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
    const seen = str(q.fields[QUOTE.followUp]) ?? "";
    const state = parseState(seen);
    if (state.lost) return [];
    const sent = waitingOrOutside(vs, state);
    if (!sent) return [];
    return [{ q, sent: sent.version, outside: sent.outside, seen, state }];
  });

  const ghlOn = ghlConfigured();
  const visitsP = ghlOn ? visitsNoQuote(quotes, byQuote, now) : Promise.resolve(null);
  const threads = await inBatches(candidates, GHL_PARALLEL, async (c) => {
    const contactId = str(c.q.fields[QUOTE.ghlContactId]);
    return ghlOn && contactId && /^[A-Za-z0-9]+$/.test(contactId) ? threadOf(contactId) : null;
  });

  const rows: FollowUpRow[] = candidates.flatMap((c, i) => {
    const sentAt = str(c.sent.fields[VERSION.sentAt]) as string;
    const t = threads[i];
    const thread: Thread | null = t ? threadSince(t.messages, sentAt) : null;
    const visit = visitNow(t, now);
    const sig = signatureOf(t?.messages ?? null, num(c.sent.fields[VERSION.openedCount]) ?? 0, c.state, sentAt, visit);
    // Current = written for the thread as it stands, and today (Albert, 2026-11-09: "updated every so often").
    const brief = c.state.brief && sig && c.state.brief.basedOn === sig && writtenToday(c.state.brief, now) ? c.state.brief : null;
    const named = brief?.nextDay ? { day: brief.nextDay, quote: brief.nextQuote } : null;
    const preliminary = str(c.sent.fields[VERSION.basis]) === "Preliminary";
    const due = dueOf({ sentAt, validUntil: str(c.sent.fields[VERSION.validUntil]), state: c.state, thread, now, torontoDay, named, visit, preliminary, firstOpened: str(c.sent.fields[VERSION.firstOpenedAt]) });
    if (!due) return [];
    // The score (2026-11-09). A brief written before something new still says what the conversation was like, so its signals count until the rewrite.
    const signals = (brief ?? c.state.brief)?.signals ?? null;
    const value = offerValue(optionsOf.get(c.sent.id))?.likely ?? null;
    const score = scoreOf({
      dials: { needsYouAt: st.needsYouAt, watchAt: st.watchAt, hotAt: st.hotAt },
      messages: t?.messages ?? null,
      sentAt,
      preliminary,
      visit,
      visited: t ? visitedWhere(t.appts, now, BOOKING_CALENDAR_IDS) : [],
      value,
      opens: num(c.sent.fields[VERSION.openedCount]) ?? 0,
      lastOpened: str(c.sent.fields[VERSION.lastOpenedAt]),
      openDays: openDaysOf(str(c.sent.fields[VERSION.activityLog])),
      signals,
      namedDay: named?.day ?? null,
      now,
      torontoDay,
    });
    // An Auto preliminary is GHL's texts' to handle (Albert, 2026-11-09); it comes back the moment it needs a person.
    if ((due.bucket === "due" || due.bucket === "upcoming") && staysAuto({ preliminary, tier: score.tier, reason: due.reason.kind, signals })) due.bucket = "auto";
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
        ownerName: nameOf(ownerOf(str(c.sent.fields[VERSION.sentBy]), str(c.sent.fields[VERSION.createdBy]))),
        due,
        why: dueWords(due),
        age: ageWords(due.age),
        state: c.state,
        seen: c.seen,
        contactId,
        opportunityId: str(c.q.fields[QUOTE.ghlOpportunityId]),
        ghlUrl: t?.conversationId ? ghlConversationUrl(t.conversationId) : contactId ? ghlContactUrl(contactId) : null,
        ghlRead: Boolean(t),
        visit,
        visitText: visit ? visitWords(visit) : null,
        // Shown even when stale (with "new activity since"), until the rewrite lands.
        brief: brief ?? c.state.brief ?? null,
        briefStale: !brief && Boolean(sig),
        score,
        value,
        waiting: false,
        ...(() => {
          const channel = channelFor(lastCustomerChannel(t?.messages ?? null, sentAt), Boolean(str(c.q.fields[QUOTE.phone])), Boolean(str(c.q.fields[QUOTE.email])));
          const b = brief;
          const lastIn = t?.messages ? [...t.messages].reverse().find((m) => !m.automated && m.channel !== "note" && m.channel !== "activity") : null;
          const autoWhy = c.outside
            ? `The price was given ${HOW_WORDS[c.outside.how]}, not from the app: send the formal copy first.`
            : preliminary
              ? "Preliminaries stay with GHL's texts."
            : !channel
              ? "No phone or email on the quote."
              : autoBlock({
                  switchOn: autoSwitchOn(st),
                  limits: { valueLimit: st.autoValueLimit, maxMessages: st.autoMaxMessages, gapHours: st.autoGapHours, sendFrom: st.sendFrom, sendTo: st.sendTo },
                  quoteOn: !c.state.autoOff,
                  measured: true,
                  dueNow: due.bucket === "due",
                  briefCurrent: Boolean(b),
                  kind: b?.draftKind ?? null,
                  stepKind: b?.step.kind ?? null,
                  draft: b?.draft ?? "",
                  flags: score.flags,
                  unanswered: lastIn?.direction === "in",
                  value,
                  sent: c.state.sent ?? [],
                  now,
                });
          const phone = str(c.q.fields[QUOTE.phone])?.replace(/\D/g, "") ?? "";
          const email = str(c.q.fields[QUOTE.email]);
          const toWords = channel === "sms" && phone ? `the number ending ${phone.slice(-4)}` : channel === "email" && email ? email : null;
          const replies = t?.messages ? replyGaps(t.messages, new Date(Date.parse(sentAt) - 30 * 86_400_000).toISOString()) : [];
          return { channel, autoWhy, toWords, replies };
        })(),
        outside: c.outside ? { how: c.outside.how, words: SENT_WORDS[c.outside.how], note: offChannelNote(c.outside, torontoDay) } : null,
      },
    ];
  });
  // The daily cap counts what is due now, per sender.
  const wait = overCap(rows.filter((r) => r.due.bucket === "due").map((r) => ({ id: r.quoteRecordId, owner: r.owner, score: r.score })), st.dailyCap);
  for (const r of rows) r.waiting = wait.has(r.quoteRecordId);
  rows.sort(byNeed);
  await logStates(rows, now);
  await alertHot(rows, now, st);

  let reasons: { id: string; name: string }[] | null = null;
  if (ghlOn) reasons = await lostReasons().catch((e) => (console.error("lostReasons", e), null));
  const visits = await visitsP;
  dueCache = { at: Date.now(), count: badgeCount(rows) + (visits?.length ?? 0) };
  const sending = { ...readiness(candidates.flatMap((c) => c.state.sent ?? [])), autoOn: autoSwitchOn(st) };
  return { rows, lostReasons: reasons, inHomeUrl: BOOKING_URLS.inHome, ghlOn, makeOn: makeConfigured(), briefsOn: readerOn(), today: torontoDay(now), visits, sending, dials: { needsYouAt: st.needsYouAt, watchAt: st.watchAt, dailyCap: st.dailyCap } };
}

/** The Toronto days a version was opened on, from its Activity Log ("2026-11-09 14:05 · opened · iPhone"). */
const openDaysOf = (log: string | null) => [...new Set(activityEntries(log).filter((e) => e.what === "opened").map((e) => e.when.slice(0, 10)))].sort();

/** The channel the customer last wrote on (their own message, not ours), from a month before the send. */
function lastCustomerChannel(messages: Message[] | null, sentAt: string): string | null {
  if (!messages) return null;
  const from = new Date(Date.parse(sentAt) - 30 * 86_400_000).toISOString();
  const m = [...messages].reverse().find((x) => x.direction === "in" && !x.automated && x.at && x.at >= from && (x.channel === "sms" || x.channel === "email"));
  return m?.channel ?? null;
}

type Rec = Awaited<ReturnType<typeof listRecords>>[number];

/** Each version's options as money (the Value column's rule, src/lib/quotes/group.ts): customer totals only, never a cost. */
async function optionMoney(): Promise<Map<string, OptionMoney[]>> {
  const options = await listRecords(T.options, { fields: [OPTION.total, OPTION.recommended, OPTION.notOffered, OPTION.scope, OPTION.part, OPTION.sortOrder, OPTION.version] });
  const out = new Map<string, OptionMoney[]>();
  for (const o of options) {
    const v = ids(o.fields[OPTION.version])[0];
    if (!v) continue;
    out.set(v, [
      ...(out.get(v) ?? []),
      { id: o.id, total: num(o.fields[OPTION.total]), recommended: o.fields[OPTION.recommended] === true, notOffered: o.fields[OPTION.notOffered] === true, part: str(o.fields[OPTION.part]), scope: str(o.fields[OPTION.scope]), sortOrder: num(o.fields[OPTION.sortOrder]) },
    ]);
  }
  return out;
}

const TIER_RANK: Record<Tier, number> = { needs: 0, watch: 1, auto: 2 };

/** Due now: Needs you (highest score first), then Watch, then what waits past the cap; the other sections by urgency. */
function byNeed(a: FollowUpRow, b: FollowUpRow): number {
  if (a.due.bucket === "due" && b.due.bucket === "due") {
    const ra = a.waiting ? 3 : TIER_RANK[a.score.tier];
    const rb = b.waiting ? 3 : TIER_RANK[b.score.tier];
    return ra - rb || b.score.score - a.score.score || byUrgency(a, b);
  }
  return byUrgency(a, b) || b.score.score - a.score.score;
}

/** The red count (2026-11-09): only what needs a person now, inside the cap. */
const badgeCount = (rows: FollowUpRow[]) => rows.filter((r) => r.due.bucket === "due" && r.score.tier === "needs" && !r.waiting).length;

/** A quote alerts again only after this long, and only when the customer has written since. */
const ALERT_AGAIN_DAYS = 7;

/**
 * The hot-tier WhatsApp (Albert, 2026-11-09). Once per rise: a quote that alerted alerts again only when the customer
 * has written since and a week has passed. Kept on Quotes → Follow Up with a compare-and-swap, so two readers can't
 * both send. Best effort: a failure is logged and tried on the next read.
 */
/** State log writes in one page read, at most, so a first read of a full list stays quick. */
const STATE_WRITES_AT_ONCE = 25;

/**
 * The state log (Albert, 2026-11-10: "log how long a lead is in a certain state"): each read appends a tier event when
 * a quote's tier changed and a due event the first day it falls due, on Quotes → Follow Up, compare-and-swap. What
 * isn't written this read is written on the next (the hourly run reads too).
 */
async function logStates(rows: FollowUpRow[], now: Date) {
  const today = torontoDay(now);
  let writes = 0;
  for (const r of rows) {
    if (writes >= STATE_WRITES_AT_ONCE) break;
    const add = newEvents(r.state.events ?? [], { at: now.toISOString(), tier: r.score.tier, score: r.score.score, dueToday: r.due.bucket === "due" ? r.due.day <= today ? r.due.day : null : null, lastTouch: r.due.lastTouch });
    if (!add.length) continue;
    try {
      const fresh = await getRecord(T.quotes, r.quoteRecordId);
      if ((str(fresh.fields[QUOTE.followUp]) ?? "") !== r.seen) continue;
      const next = serializeState({ ...r.state, events: [...(r.state.events ?? []), ...add].slice(-EVENTS_KEPT) });
      await updateRecord(T.quotes, r.quoteRecordId, { [QUOTE.followUp]: next });
      r.seen = next;
      r.state = parseState(next);
      writes++;
    } catch (e) {
      console.error("followUp state log", e);
    }
  }
}

async function alertHot(rows: FollowUpRow[], now: Date, st: Settings) {
  if (!st.alertsOn || !st.alertTo || !makeConfigured()) return;
  const due = rows.filter((r) => {
    if (!r.score.hot || r.due.bucket === "snoozed" || r.due.bucket === "postponed") return false;
    const a = r.state.alerted;
    if (!a) return true;
    const last = r.ghlRead ? r.due.lastTouch : null;
    return now.getTime() - Date.parse(a.at) >= ALERT_AGAIN_DAYS * 86_400_000 && Boolean(last && last > a.at.slice(0, 10));
  });
  for (const r of due.slice(0, st.alertsPerRead)) {
    try {
      const fresh = await getRecord(T.quotes, r.quoteRecordId);
      const raw = str(fresh.fields[QUOTE.followUp]) ?? "";
      if (raw !== r.seen) continue; // someone acted on it since the page read it
      const big = (r.value ?? 0) >= TOP_VALUE || r.basis === "Measured";
      const text = [
        `${TIER_WORDS.needs} · ${r.score.score}: ${r.customer ?? "a customer"} (${r.quoteNumber ?? "quote"}, ${r.basis ?? "quote"})`,
        r.score.flags.length ? r.score.flags.map((f) => FLAG_WORDS[f]).join("; ") : r.score.reasons.join(" · "),
        `With ${r.ownerName ?? "nobody yet"}${big ? " · Albert cc" : ""}. Open Follow up in the quote app.`,
      ].join("\n");
      await sendAlert({ to: st.alertTo, forEmail: r.owner, text });
      const next = serializeState(withAlerted(r.state, { at: now.toISOString(), score: r.score.score }));
      await updateRecord(T.quotes, r.quoteRecordId, { [QUOTE.followUp]: next });
      r.seen = next;
      r.state = parseState(next);
    } catch (e) {
      console.error("followUp alert", e);
    }
  }
}

/**
 * "Visited, no quote yet" (Albert, 2026-11-07): the last VISIT_LOOKBACK_DAYS of the two booking calendars, against every
 * quote's GHL contact. Null when a calendar couldn't be read, so the page says so instead of showing nothing owed.
 */
async function visitsNoQuote(quotes: Rec[], byQuote: Map<string, Rec[]>, now: Date) {
  const from = new Date(now.getTime() - VISIT_LOOKBACK_DAYS * 86_400_000);
  let events;
  try {
    events = (await Promise.all([calendarEvents(BOOKING_CALENDAR_IDS.inHome, from, now), calendarEvents(BOOKING_CALENDAR_IDS.inStore, from, now)])).flat();
  } catch (e) {
    console.error("visitsNoQuote calendars", e);
    return null;
  }
  const quotesOf = new Map<string, ContactQuotes[]>();
  for (const q of [...quotes].sort((a, b) => b.createdTime.localeCompare(a.createdTime))) {
    const contact = str(q.fields[QUOTE.ghlContactId]);
    if (!contact) continue;
    const vs = (byQuote.get(q.id) ?? []).sort((a, b) => (num(b.fields[VERSION.version]) ?? 0) - (num(a.fields[VERSION.version]) ?? 0));
    const statuses = vs.map((v) => str(v.fields[VERSION.status]));
    const closed = Boolean(str(q.fields[QUOTE.projectNumber])) || statuses.some((x) => x === "Accepted" || x === "Won") || statuses[0] === "Lost" || Boolean(parseState(str(q.fields[QUOTE.followUp])).lost);
    const measuredSent = vs.filter((v) => str(v.fields[VERSION.basis]) === "Measured" && str(v.fields[VERSION.sentAt])).map((v) => torontoDay(str(v.fields[VERSION.sentAt]) as string));
    quotesOf.set(contact, [...(quotesOf.get(contact) ?? []), { quoteRecordId: q.id, quoteNumber: str(q.fields[QUOTE.quoteNumber]), customer: customerOf(q.fields), versionId: vs[0]?.id ?? null, measuredSent, closed }]);
  }
  const found = visitsWithoutQuote(events, quotesOf, now, torontoDay, BOOKING_CALENDAR_IDS);
  const users = found.some((v) => v.visitorId) ? await locationUsers().catch(() => []) : [];
  const first = (id: string | null) => {
    const u = id ? users.find((x) => x.id === id) : null;
    return u ? (u.email ? nameOf(u.email) : null) ?? u.name?.split(/\s+/)[0] ?? null : null;
  };
  return found.map((v) => ({ ...v, visitorName: first(v.visitorId), ghlUrl: ghlContactUrl(v.contactId) }));
}

const nameOf = (email: string | null) => (email ? (firstNameOf({ email, name: null }) ?? email.split("@")[0]) : null);

/** What a brief was written from (src/lib/followup/brief.ts); null when GHL couldn't be read, so no brief is judged stale. */
function signatureOf(messages: Message[] | null, opens: number, state: FollowUpState, sentAt: string, visit: Visit | null): string | null {
  if (!messages) return null;
  const last = messages.at(-1) ?? null;
  return briefSignature({ lastMessage: last ? { id: last.id, at: last.at } : null, opens, touches: state.touches.length, postponeUntil: state.postpone?.until ?? null, sentAt, visit: visit ? visitWords(visit) : null });
}

/* ---------- the top bar's red count (Albert, 2026-11-07: "a red notif on the top bar for number of ones due now") ---------- */

let dueCache: { at: number; count: number } | null = null;
const DUE_CACHE_MS = 180_000;

/** Quotes due now, everyone's: kept from the last Follow up read for three minutes, else read again. Zero when it can't be read. */
export async function dueCountNow(): Promise<number> {
  await requireQuoterPerson();
  if (dueCache && Date.now() - dueCache.at < DUE_CACHE_MS) return dueCache.count;
  try {
    const page = await loadFollowUps();
    return badgeCount(page.rows) + (page.visits?.length ?? 0);
  } catch (e) {
    console.error("dueCountNow", e);
    return 0;
  }
}

/* ---------- the brief (step 2, 2026-11-07) ---------- */

export type BriefResult = { ok: true; brief: Brief; fresh: boolean } | { ok: false; message: string };

/** Messages from a month before the send on, as the brief reads them; the newest 60. */
function linesOf(messages: Message[], sentAt: string): ThreadLine[] {
  const from = new Date(Date.parse(sentAt) - 30 * 86_400_000).toISOString();
  return messages
    .filter((m) => !m.at || m.at >= from)
    .slice(-60)
    .map((m) => ({
      id: m.id,
      at: m.at,
      who: m.channel === "note" ? "note" : m.automated ? "automated" : m.direction === "in" ? "customer" : "staff",
      channel: m.channel,
      body: m.body,
      subject: m.subject,
      callSeconds: m.callSeconds,
      status: m.status,
    }));
}

/**
 * The quote's brief: the kept one when nothing has happened since it was written, else a new one from Claude, kept on
 * Quotes → Follow Up for next time. `force` writes a new one anyway (the row's Rewrite).
 */
export async function writeBrief(quoteRecordId: string, force: boolean): Promise<BriefResult> {
  await requireQuoterPerson();
  return briefFor(quoteRecordId, force);
}

/** A brief written before today (Toronto) is rewritten even when nothing happened: the age, slots and next step move on. */
const writtenToday = (b: Brief, now: Date) => torontoDay(b.at) === torontoDay(now);


/** writeBrief's work, without the sign-in check: reached from writeBrief (signed in) and the key-gated hourly run only. */
async function briefFor(quoteRecordId: string, force: boolean): Promise<BriefResult> {
  if (!readerOn()) return { ok: false, message: "Briefs aren't set up on this deployment (the Claude key isn't set)." };
  if (!REC_ID.test(quoteRecordId)) return { ok: false, message: GONE };
  let q;
  try {
    q = await getRecord(T.quotes, quoteRecordId);
  } catch {
    return { ok: false, message: GONE };
  }
  const versions = await listByIds(T.versions, ids(q.fields[QUOTE.versions]), [VERSION.version, VERSION.status, VERSION.basis, VERSION.sentAt, VERSION.validUntil, VERSION.sentBy, VERSION.createdBy, VERSION.changeNo, VERSION.openedCount, VERSION.lastOpenedAt, VERSION.options]).catch(() => []);
  const state = parseState(str(q.fields[QUOTE.followUp]));
  const sent = waitingOrOutside(versions, state)?.version;
  if (!sent) return { ok: false, message: "This quote has no sent version waiting on the customer." };
  const contactId = str(q.fields[QUOTE.ghlContactId]);
  const t = contactId && /^[A-Za-z0-9]+$/.test(contactId) && ghlConfigured() ? await threadOf(contactId) : null;
  if (contactId && !t) return { ok: false, message: "GHL didn't answer, so there's nothing new to read. Try again in a moment." };
  const sentAt = str(sent.fields[VERSION.sentAt]) as string;
  const opens = num(sent.fields[VERSION.openedCount]) ?? 0;
  const visit = visitNow(t, new Date());
  const sig = signatureOf(t?.messages ?? [], opens, state, sentAt, visit) as string;
  if (!force && state.brief && state.brief.basedOn === sig && writtenToday(state.brief, new Date())) return { ok: true, brief: state.brief, fresh: false };

  const opts = await listByIds(T.options, ids(sent.fields[VERSION.options]), [OPTION.name, OPTION.total, OPTION.notOffered]).catch(() => []);
  const now = new Date();
  const today = torontoDay(now);
  const sender = nameOf(str(sent.fields[VERSION.sentBy]));
  const prompt = briefPrompt(
    {
      today,
      customer: customerOf(q.fields),
      quoteNumber: str(q.fields[QUOTE.quoteNumber]),
      basis: str(sent.fields[VERSION.basis]),
      sentDay: torontoDay(sentAt),
      age: Math.round((Date.parse(today) - Date.parse(torontoDay(sentAt))) / 86_400_000),
      validUntil: str(sent.fields[VERSION.validUntil]),
      opens,
      lastOpened: str(sent.fields[VERSION.lastOpenedAt]),
      options: opts.filter((o) => o.fields[OPTION.notOffered] !== true).map((o) => ({ name: str(o.fields[OPTION.name]) ?? "Option", total: num(o.fields[OPTION.total]) })),
      sender,
      typicalCloseDay: TYPICAL_CLOSE_DAYS,
      scheduleDays: SCHEDULE_DAYS,
      postponedTo: state.postpone?.until ?? null,
      loggedHere: state.touches.map((x) => ({ at: x.at, ...(x.note ? { note: x.note } : {}) })),
      visit: visitFact(visit),
      lostReasons: (await lostReasons()).map((r) => r.name),
      visitedWhere: t ? visitedWhere(t.appts, now, BOOKING_CALENDAR_IDS) : [],
      // A firm date to offer (2026-11-09): only where a visit is the next step, from the calendar as it is now.
      openSlots: !visit || visit.kind === "none" || visit.kind === "missed" ? (await openSlots(now)).map((x) => ({ label: x.label, near: x.near })) : [],
      channel: str(sent.fields[VERSION.basis]) === "Preliminary" ? null : channelFor(lastCustomerChannel(t?.messages ?? null, sentAt), Boolean(str(q.fields[QUOTE.phone])), Boolean(str(q.fields[QUOTE.email]))),
      appSent: state.sent?.length ?? 0,
    },
    linesOf(t?.messages ?? [], sentAt),
  );
  let raw: unknown;
  try {
    raw = await writeJson(prompt);
  } catch (e) {
    return { ok: false, message: e instanceof ClaudeError ? e.message : "The brief couldn't be written. Try again." };
  }
  const brief = cleanBrief(raw, { basedOn: sig, at: now.toISOString(), model: BRIEF_MODEL, today, lostReasons: (await lostReasons()).map((r) => r.name) });
  if (!brief) return { ok: false, message: "Claude's answer wasn't a brief. Try again." };
  // Kept on top of whatever the field holds now, so a button pressed meanwhile is never undone.
  try {
    const fresh = await getRecord(T.quotes, quoteRecordId);
    await updateRecord(T.quotes, quoteRecordId, { [QUOTE.followUp]: serializeState(withBrief(parseState(str(fresh.fields[QUOTE.followUp])), brief)) });
  } catch (e) {
    console.error("brief keep", e);
  }
  return { ok: true, brief, fresh: true };
}

let slotCache: { at: number; slots: ReturnType<typeof pickSlots> } | null = null;
const SLOT_CACHE_MS = 300_000;

/** The in-home calendar's real open slots over the next week, the ones next to a booked visit first; [] when it can't be read. */
async function openSlots(now: Date): Promise<ReturnType<typeof pickSlots>> {
  if (slotCache && Date.now() - slotCache.at < SLOT_CACHE_MS) return slotCache.slots;
  const to = new Date(now.getTime() + SLOT_DAYS * 86_400_000);
  try {
    const [free, booked] = await Promise.all([freeSlots(BOOKING_CALENDAR_IDS.inHome, now, to), calendarEvents(BOOKING_CALENDAR_IDS.inHome, now, to)]);
    const slots = pickSlots(free, booked.filter((e) => !/cancel|no.?show|invalid/.test(e.status ?? "")).map((e) => e.start), now, torontoDay);
    slotCache = { at: Date.now(), slots };
    return slots;
  } catch (e) {
    console.error("openSlots", e);
    return [];
  }
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

/* ---------- the app sends measured follow-ups (Albert, 2026-11-09, round 3) ---------- */

/** What a send needs to know about the quote, read fresh. */
async function sendable(quoteRecordId: string, seen: string): Promise<{ c: Current; phone: boolean; email: boolean; allowed: number[]; sentAt: string; senderEmail: string | null } | string> {
  const c = await current(quoteRecordId, seen);
  if (typeof c === "string") return c;
  if (!c.version) return "This quote has no sent version waiting on the customer.";
  if (c.version.basis === "Preliminary") return "Preliminaries stay with GHL's texts for now: copy the draft into GHL.";
  if (!c.contactId) return "No GHL contact on this quote, so nothing can be sent from here.";
  if (!makeConfigured()) return "Make isn't switched on here, so the app can't send.";
  const [q, v] = await Promise.all([getRecord(T.quotes, quoteRecordId), getRecord(T.versions, c.version.id)]);
  const opts = await listByIds(T.options, ids(v.fields[VERSION.options]), [OPTION.total, OPTION.recommended, OPTION.notOffered, OPTION.scope, OPTION.part, OPTION.sortOrder]).catch(() => []);
  const money = opts.filter((o) => o.fields[OPTION.notOffered] !== true).map((o) => num(o.fields[OPTION.total])).filter((n): n is number => n != null);
  const offer = offerValue(opts.map((o) => ({ id: o.id, total: num(o.fields[OPTION.total]), recommended: o.fields[OPTION.recommended] === true, notOffered: o.fields[OPTION.notOffered] === true, part: str(o.fields[OPTION.part]), scope: str(o.fields[OPTION.scope]), sortOrder: num(o.fields[OPTION.sortOrder]) })));
  return {
    c,
    phone: Boolean(str(q.fields[QUOTE.phone])),
    email: Boolean(str(q.fields[QUOTE.email])),
    allowed: [...money, ...(offer ? [offer.low, offer.high, offer.likely] : [])],
    sentAt: str(v.fields[VERSION.sentAt]) ?? new Date().toISOString(),
    senderEmail: str(v.fields[VERSION.sentBy]),
  };
}

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const emailHtml = (text: string) => text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");

/** Send one message to the customer through Make, from `from`'s own number or address. Throws with words for staff. */
async function deliver(contactId: string, channel: Channel, text: string, subject: string | null, from: { email: string; firstName: string | null }) {
  if (channel === "sms") {
    const users = await locationUsers().catch(() => []);
    const number = textFromFor(from.email, users);
    if (!number) throw new Error(noNumberWords(from.email));
    await sendMessage(fromTheirNumber({ type: "SMS", contactId, message: text.trim() }, number));
    return;
  }
  const attempts = fromAttempts(from, null);
  if (!attempts.length) throw new Error(`The email can't go from ${from.email}.`);
  let last: unknown = null;
  for (const emailFrom of attempts) {
    try {
      await sendMessage({ type: "Email", contactId, subject: (subject ?? "Your Titan Flooring quote").trim(), html: emailHtml(text.trim()), emailFrom });
      return;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("The email didn't go.");
}

/** Record a send on Quotes → Follow Up (it counts as a follow-up) and in the quote's History. */
async function recordSend(quoteRecordId: string, c: Current, entry: Parameters<typeof withSent>[1], who: string): Promise<string[]> {
  const notes: string[] = [];
  // Read again: the message has gone, so the record must land on whatever the field holds now.
  try {
    const fresh = await getRecord(T.quotes, quoteRecordId);
    const bad = await saveState(quoteRecordId, withSent(parseState(str(fresh.fields[QUOTE.followUp])), entry));
    if (bad) notes.push(`Sent, but not recorded here: ${bad}`);
  } catch (e) {
    notes.push(`Sent, but not recorded here (${e instanceof Error ? e.message.slice(0, 80) : "error"}).`);
  }
  const logBad = await logOnVersion(c, who, `follow-up ${entry.how === "auto" ? "sent by the app on its own" : "sent from the app"} (${entry.channel === "email" ? "email" : "text"}, ${entry.kind})`);
  if (logBad) notes.push(logBad);
  return notes;
}

/**
 * Stage 1: staff tap Send on a measured quote's draft (they may edit it first). It goes from the person signed in
 * ("Sent from the person signed in", 2026-10-22), on the channel the app picked, after the same check an automatic
 * send passes: no price that isn't on the quote.
 */
export async function sendFollowUp(quoteRecordId: string, seen: string, text: unknown, subject: unknown): Promise<FollowUpResult> {
  const person = await requireQuoterPerson();
  const r = await sendable(quoteRecordId, seen);
  if (typeof r === "string") return { ok: false, message: r };
  const words = typeof text === "string" ? text.replace(/\r/g, "").trim() : "";
  const subj = typeof subject === "string" ? subject.trim().slice(0, 120) : null;
  const t = await threadOf(r.c.contactId as string);
  const channel = channelFor(lastCustomerChannel(t?.messages ?? null, r.sentAt), r.phone, r.email);
  if (!channel) return { ok: false, message: "There's no phone or email on this quote." };
  const problem = checkDraft({ text: words, channel, subject: subj }, r.allowed);
  if (problem) return { ok: false, message: problem };
  const brief = r.c.state.brief ?? null;
  try {
    await deliver(r.c.contactId as string, channel, words, subj, { email: person.email, firstName: firstNameOf(person) });
  } catch (e) {
    return { ok: false, message: `Not sent: ${e instanceof Error ? e.message.slice(0, 200) : "error"}` };
  }
  threadCache.delete(r.c.contactId as string);
  const notes = await recordSend(quoteRecordId, r.c, { at: new Date().toISOString(), kind: brief?.draftKind ?? "other", how: "tap", channel, by: person.email, edited: brief?.draft ? editShare(brief.draft, words) : 1 }, person.email);
  return { ok: true, notes: [`Sent by ${channel === "email" ? "email" : "text"}.`, ...notes] };
}

/** This quote's own Auto follow-ups switch (on unless turned off). */
export async function setAutoFollowUps(quoteRecordId: string, seen: string, on: unknown): Promise<FollowUpResult> {
  await requireQuoterPerson();
  const c = await current(quoteRecordId, seen);
  if (typeof c === "string") return { ok: false, message: c };
  const bad = await saveState(quoteRecordId, withAutoOff(c.state, on !== true));
  return bad ? { ok: false, message: `Not saved: ${bad}` } : { ok: true, notes: [] };
}

/** /api/followups's key (QUOTE_FOLLOWUP_KEY), constant-time; a missing key turns the run off, never opens it. */
export function followUpKeyOk(given: string | null): boolean {
  const want = process.env.QUOTE_FOLLOWUP_KEY;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Sends in one run, at most. */
const AUTO_PER_RUN = 10;

/**
 * Stage 2 (built 2026-11-09, off until Albert switches QUOTE_AUTO_FOLLOWUPS on): the routine measured follow-ups go
 * on their own, each only when `autoBlock()` finds nothing in the way, written from a brief that is current, from
 * the quote's last sender. Called hourly by .github/workflows/quote-followups.yml.
 */
export type AutoRunResult = { ok: true; sent: number; skipped: number; notes: string[] } | { ok: false; status: number; message: string };

export async function runAutoFollowUps(key: string | null): Promise<AutoRunResult> {
  if (!followUpKeyOk(key)) return { ok: false, status: 401, message: "Wrong or missing key." };
  // Briefs first, whatever the switch (Albert, 2026-11-09: "updated every so often"): stale ones for what is due or
  // coming up are rewritten here, so the page opens ready.
  const before = await readFollowUps(new Date());
  const st = await settings();
  const stale = before.rows.filter((r) => r.briefStale && (r.due.bucket === "due" || r.due.bucket === "upcoming")).slice(0, st.briefsPerRun);
  let briefs = 0;
  if (readerOn()) {
    for (const r of stale) {
      const b = await briefFor(r.quoteRecordId, false).catch((e) => ({ ok: false as const, message: e instanceof Error ? e.message : "error" }));
      if (b.ok) briefs++;
    }
  }
  const briefNote = `${briefs} brief${briefs === 1 ? "" : "s"} rewritten.`;
  if (!autoSwitchOn(st)) return { ok: true, sent: 0, skipped: 0, notes: [briefNote, "Auto follow-ups are off for the app (Albert's switch)."] };
  const page = await readFollowUps(new Date());
  const ready = page.rows.filter((r) => r.autoWhy === null && r.channel && r.brief && r.owner).slice(0, AUTO_PER_RUN);
  const notes: string[] = [];
  let sent = 0;
  for (const row of ready) {
    const r = await sendable(row.quoteRecordId, row.seen);
    if (typeof r === "string") {
      notes.push(`${row.quoteNumber}: ${r}`);
      continue;
    }
    const b = row.brief as Brief;
    const problem = checkDraft({ text: b.draft, channel: row.channel as Channel, subject: b.subject ?? null }, r.allowed);
    if (problem) {
      notes.push(`${row.quoteNumber}: held, ${problem}`);
      continue;
    }
    const from = { email: row.owner as string, firstName: row.ownerName };
    try {
      await deliver(r.c.contactId as string, row.channel as Channel, b.draft, b.subject ?? null, from);
    } catch (e) {
      notes.push(`${row.quoteNumber}: not sent, ${e instanceof Error ? e.message.slice(0, 120) : "error"}`);
      continue;
    }
    threadCache.delete(r.c.contactId as string);
    notes.push(...(await recordSend(row.quoteRecordId, r.c, { at: new Date().toISOString(), kind: (b.draftKind ?? "other") as DraftKind, how: "auto", channel: row.channel as Channel, by: "app", edited: 0 }, "app")));
    sent++;
  }
  return { ok: true, sent, skipped: page.rows.length - sent, notes: [briefNote, ...notes] };
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
    // A reason is required (2026-11-07): sent without one, GHL put its own ("Not price") on Sharon's opportunity.
    const list = await lostReasons().catch((e) => (console.error("lostReasons", e), null));
    if (!list || list.length === 0) return { ok: false, message: "GHL's lost reasons couldn't be read, so nothing was changed. Try again in a moment, or mark it lost in GHL." };
    reason = list.find((r) => r.id === reasonId) ?? null;
    if (!reason) return { ok: false, message: "Pick one of GHL's lost reasons." };
    try {
      await setOpportunityStatus(c.opportunityId, lostStatusBody(reason?.id ?? null));
    } catch (e) {
      return { ok: false, message: `GHL wasn't changed (${e instanceof Error ? e.message.slice(0, 100) : "error"}), so nothing was saved. Try again.` };
    }
    notes.push(`The opportunity is Lost: ${reason.name}.`);
    // Lost Details (Albert, 2026-11-07): the full story on the opportunity itself. Best effort: the loss stands either way.
    const detailsId = c.contactId ? await lostDetailsFieldId() : null;
    if (detailsId && c.contactId) {
      try {
        await sendToGhl(buildLostDetails({ contactId: c.contactId, opportunityId: c.opportunityId, fieldId: detailsId, text: lostDetailsText({ reason: reason.name, note: n, day: torontoDay(new Date()), by: nameOf(person.email) ?? person.email }) }));
        notes.push("Lost Details is filled in on the opportunity.");
      } catch (e) {
        notes.push(`Lost Details wasn't written (${e instanceof Error ? e.message.slice(0, 80) : "error"}).`);
      }
    } else notes.push("The opportunity's Lost Details field couldn't be found, so the note is only in the conversation.");
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

/* ---------- the twice-a-day recheck (Albert, 2026-11-13) ---------- */

/**
 * Albert, 2026-11-13: "read the context and update 2x a day to ensure the context of each conversation has been
 * accounted for (internal comments, appts, 'ill let you knows' etc) before categorizing". Vault
 * 05_decisions/2026-11-13-quote-price-given-outside-app. Called at about 8am and 2pm Toronto by
 * .github/workflows/quote-recheck.yml, key-gated like the hourly run (QUOTE_FOLLOWUP_KEY).
 *
 * 1. Every quote on Follow up, whatever its section (snoozed and on-auto included), gets its brief rewritten from the
 *    whole thread when the last one is more than RECHECK_FRESH_HOURS old, so a staff comment, a call summary, a
 *    booked visit or an "I'll let you know" is read before the row is sorted.
 * 2. Quotes still open get their thread read for a price staff gave by text or on a call. A firm one on a quote whose
 *    newest version is a Draft uses the option that already carries it, or adds one custom option with one Install
 *    line at that price; either way the quote reads "Sent by text" / "Given on a call" with a note. A ballpark is a
 *    note only. On a version the app already sent, nothing is added (a sent version is never edited here).
 *
 * It sends nothing to anyone: no quote, no text, no email (Albert: "As of right now; no quote should auto sent").
 */
const RECHECK_FRESH_HOURS = 4;
const RECHECK_BRIEFS = 40;
const RECHECK_SCANS = 25;
const RECHECK_THREADS = 80;
const SCAN_BACK_DAYS = 60;

export type RecheckResult = { ok: true; briefs: number; scanned: number; found: { quote: string | null; did: OffChannel["did"]; words: string }[]; notes: string[] } | { ok: false; status: number; message: string };

export async function runRecheck(key: string | null): Promise<RecheckResult> {
  if (!followUpKeyOk(key)) return { ok: false, status: 401, message: "Wrong or missing key." };
  const now = new Date();
  const notes: string[] = [];
  const found: { quote: string | null; did: OffChannel["did"]; words: string }[] = [];

  // 2 first, so a quote a text just marked sent is on the list when its brief is written.
  let scanned = 0;
  if (ghlConfigured() && readerOn()) {
    const [quotes, versions] = await Promise.all([
      listRecords(T.quotes, { fields: [QUOTE.quoteNumber, QUOTE.customerName, QUOTE.firstName, QUOTE.lastName, QUOTE.projectNumber, QUOTE.ghlContactId, QUOTE.followUp, QUOTE.versions] }),
      listRecords(T.versions, { fields: [VERSION.quote, VERSION.version, VERSION.status, VERSION.sentAt, VERSION.options, VERSION.editLog, VERSION.basis] }),
    ]);
    const byQuote = new Map<string, VersionRec[]>();
    for (const v of versions) {
      const q = ids(v.fields[VERSION.quote])[0];
      if (q) byQuote.set(q, [...(byQuote.get(q) ?? []), v]);
    }
    const since = new Date(now.getTime() - SCAN_BACK_DAYS * 86_400_000).toISOString();
    const open = quotes
      .filter((q) => !str(q.fields[QUOTE.projectNumber]) && /^[A-Za-z0-9]+$/.test(str(q.fields[QUOTE.ghlContactId]) ?? ""))
      .map((q) => ({ q, vs: (byQuote.get(q.id) ?? []).sort((a, b) => (num(b.fields[VERSION.version]) ?? 0) - (num(a.fields[VERSION.version]) ?? 0)), state: parseState(str(q.fields[QUOTE.followUp])) }))
      .filter((x) => x.vs.length && !x.state.lost && !x.vs.some((v) => ["Accepted", "Won"].includes(str(v.fields[VERSION.status]) ?? "")) && str(x.vs[0].fields[VERSION.status]) !== "Lost")
      // Newest first by record, so the run reaches the live ones before old drafts.
      .sort((a, b) => (b.q.createdTime ?? "").localeCompare(a.q.createdTime ?? ""))
      .slice(0, RECHECK_THREADS);
    const threads = await inBatches(open, GHL_PARALLEL, (x) => threadOf(str(x.q.fields[QUOTE.ghlContactId]) as string));
    for (let i = 0; i < open.length && scanned < RECHECK_SCANS; i++) {
      const t = threads[i];
      if (!t) continue;
      const x = open[i];
      const from = [since, x.q.createdTime ?? since, x.state.offChannel?.at ?? since].sort().at(-1) as string;
      const cands = priceCandidates(t.messages, from).filter((m) => m.id !== x.state.offChannel?.messageId);
      if (!cands.length) continue;
      scanned++;
      try {
        const r = await offChannelFor(x, t.messages, cands.map((m) => m.id), now);
        if (r) found.push(r);
      } catch (e) {
        notes.push(`${str(x.q.fields[QUOTE.quoteNumber]) ?? x.q.id}: price check failed (${e instanceof Error ? e.message.slice(0, 80) : "error"}).`);
      }
    }
  } else notes.push("GHL or Claude isn't set up here, so no prices were looked for.");

  // 1. Briefs, every section.
  let briefs = 0;
  if (readerOn()) {
    const page = await readFollowUps(now);
    const old = page.rows.filter((r) => !r.state.brief || now.getTime() - Date.parse(r.state.brief.at) > RECHECK_FRESH_HOURS * 3_600_000 || r.briefStale).slice(0, RECHECK_BRIEFS);
    for (const r of old) {
      const b = await briefFor(r.quoteRecordId, true).catch((e) => ({ ok: false as const, message: e instanceof Error ? e.message : "error" }));
      if (b.ok) briefs++;
      else notes.push(`${r.quoteNumber ?? r.quoteRecordId}: brief not rewritten (${b.message.slice(0, 80)}).`);
    }
  }
  return { ok: true, briefs, scanned, found, notes };
}

/** One quote's price check and what follows from it. Returns what it did, or null when Claude found no price. */
async function offChannelFor(x: { q: VersionRec; vs: VersionRec[]; state: FollowUpState }, messages: Message[], candidateIds: string[], now: Date) {
  const newest = x.vs[0];
  const opts = await listByIds(T.options, ids(newest.fields[VERSION.options]), [OPTION.name, OPTION.total, OPTION.subtotal, OPTION.notOffered]).catch(() => []);
  const prompt = offChannelPrompt(
    { today: torontoDay(now), customer: customerOf(x.q.fields), quoteNumber: str(x.q.fields[QUOTE.quoteNumber]), options: opts.filter((o) => o.fields[OPTION.notOffered] !== true).map((o) => ({ name: str(o.fields[OPTION.name]) ?? "Option", total: num(o.fields[OPTION.total]) })) },
    messages,
    candidateIds,
  );
  const f = cleanOffChannel(await writeJson(prompt), messages, candidateIds);
  if (!f) return null;
  const isDraft = (str(newest.fields[VERSION.status]) ?? "Draft") === "Draft";
  let plan = offChannelPlan(f, opts.map((o) => ({ id: o.id, total: num(o.fields[OPTION.total]), preHst: num(o.fields[OPTION.subtotal]), notOffered: o.fields[OPTION.notOffered] === true })));
  // A version the app sent is never edited here: an unmatched price on one is a note, for staff to add by hand.
  if (plan.did === "added" && !isDraft) plan = { did: "noted", optionId: null };
  let optionId = plan.optionId;
  if (plan.did === "added") {
    optionId = await addOutsideOption(newest.id, f);
    if (!optionId) plan = { did: "noted", optionId: null };
  }
  const off: OffChannel = { ...f, did: plan.did, optionId, found: now.toISOString() };
  // Compare-and-swap on top of what the field holds now, so a button pressed meanwhile is never undone.
  const fresh = await getRecord(T.quotes, x.q.id);
  const state = parseState(str(fresh.fields[QUOTE.followUp]));
  await updateRecord(T.quotes, x.q.id, { [QUOTE.followUp]: serializeState({ ...state, offChannel: off, recheckedAt: now.toISOString() }) });
  const what = plan.did === "added" ? "added as a custom option and marked sent outside the app" : plan.did === "matched" ? "matched an option and marked sent outside the app" : f.kind === "firm" ? "noted (the newest version was already sent from the app, so nothing was added)" : "noted (a ballpark is never marked sent)";
  const words = `${offChannelNote(f, torontoDay)} ${what[0].toUpperCase()}${what.slice(1)}.`;
  try {
    await updateRecord(T.versions, newest.id, { [VERSION.editLog]: appendLog(str(newest.fields[VERSION.editLog]), logLine(now, "app", `price check: ${words}`)) });
  } catch (e) {
    console.error("offChannel history", e);
  }
  return { quote: str(x.q.fields[QUOTE.quoteNumber]), did: plan.did, words };
}

/**
 * For the Send card (2026-11-13): the price given outside the app on this quote, when a firm one was given after the
 * app's last send, else null. Signed in.
 */
export type OutsideCard = { words: string; note: string };
export async function outsideFor(quoteRecordId: string | null): Promise<OutsideCard | null> {
  await requireQuoterPerson();
  if (!quoteRecordId || !REC_ID.test(quoteRecordId)) return null;
  try {
    const q = await getRecord(T.quotes, quoteRecordId);
    const state = parseState(str(q.fields[QUOTE.followUp]));
    if (!state.offChannel) return null;
    const vs = await listByIds(T.versions, ids(q.fields[QUOTE.versions]), [VERSION.version, VERSION.status, VERSION.sentAt, VERSION.changeNo, VERSION.basis]);
    const w = waitingOrOutside(vs, state);
    return w?.outside ? { words: SENT_WORDS[w.outside.how], note: offChannelNote(w.outside, torontoDay) } : null;
  } catch (e) {
    console.error("outsideFor", e);
    return null;
  }
}
