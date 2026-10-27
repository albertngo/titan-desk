import "server-only";
import { timingSafeEqual } from "node:crypto";
import { listByIds, listRecords, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { applyActivity, firstOpenComment, mentionsFor, parseActivity, summaryComment, summaryDue, type ActivityInfo, type TrackState } from "@/lib/activity/track";
import { contactOwner, ghlConfigured, locationUsers, opportunityOwner } from "@/lib/ghl/client";
import { FALLBACK_MENTION_USER_ID } from "@/lib/ghl/ids";
import { makeConfigured, sendMessage } from "@/lib/make/client";
import { torontoToday } from "@/lib/send/copy";
import { firstNameOf } from "./history";
import { bool, ids, num, str } from "./values";

/**
 * Open tracking on the staff app (Albert, 2026-10-27), called through /api/activity, never by a
 * person: there is no sign-in, so every export checks the shared QUOTE_ACTIVITY_KEY first.
 *
 *   recordActivity: the customer deployment reports an open or a PDF download by the link's token.
 *     The version's counters and Activity Log move (src/lib/activity/track.ts decides how), and the
 *     first open of a sent version posts an internal comment on the customer's GHL conversation.
 *   noteSummaries: once a day (GitHub Actions), every version sent three or more days ago, still
 *     Sent (not replaced by a newer one) and tracked, gets one summary comment.
 *
 * A comment's "noted" stamp is written before the comment goes and taken back if it fails, so a
 * comment goes at most once and a failed one is tried again. A measured quote's comments tag the
 * contact's assigned user, and the sender too when that is someone else; a preliminary's tag nobody.
 */

/** Constant-time check of the key the customer deployment and the daily run send. No key configured means tracking is off. */
export function activityKeyOk(given: string | null): boolean {
  const want = process.env.QUOTE_ACTIVITY_KEY;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type ActivityResult = { ok: true; counted: boolean; noted: boolean } | { ok: false; status: number; message: string };

const TRACK_FIELDS = [
  VERSION.status,
  VERSION.basis,
  VERSION.version,
  VERSION.sentAt,
  VERSION.sentBy,
  VERSION.sentTo,
  VERSION.quote,
  VERSION.trackActivity,
  VERSION.openedCount,
  VERSION.firstOpenedAt,
  VERSION.lastOpenedAt,
  VERSION.pdfDownloads,
  VERSION.activityLog,
  VERSION.firstOpenNotedAt,
  VERSION.summaryNotedAt,
];

type Row = { id: string; fields: Record<string, unknown> };

const stateOf = (f: Record<string, unknown>): TrackState => ({
  openedCount: num(f[VERSION.openedCount]) ?? 0,
  firstOpenedAt: str(f[VERSION.firstOpenedAt]),
  lastOpenedAt: str(f[VERSION.lastOpenedAt]),
  pdfDownloads: num(f[VERSION.pdfDownloads]) ?? 0,
  activityLog: str(f[VERSION.activityLog]),
});

/** Record one open or PDF download reported by the customer deployment. */
export async function recordActivity(key: string | null, raw: unknown, now = new Date()): Promise<ActivityResult> {
  if (!activityKeyOk(key)) return { ok: false, status: 401, message: "Wrong or missing key." };
  const report = parseActivity(raw);
  if (!report) return { ok: false, status: 400, message: "That report didn't make sense." };
  const found = await listRecords(T.versions, { fields: TRACK_FIELDS, filterByFormula: `{${VERSION.customerToken}}='${report.token}'` });
  if (found.length !== 1) return { ok: false, status: 404, message: "No such quote." };
  const row = found[0];
  const f = row.fields;
  // Only a version that really went out is tracked; a draft holding a token from a failed send is not.
  if (!["Sent", "Superseded", "Accepted", "Won"].includes(str(f[VERSION.status]) ?? "")) return { ok: true, counted: false, noted: false };

  const { next, counted, firstOpen } = applyActivity(stateOf(f), report.kind, report.device, now);
  const note = firstOpen && str(f[VERSION.status]) === "Sent" && bool(f[VERSION.trackActivity]) && !str(f[VERSION.firstOpenNotedAt]);
  await updateRecord(T.versions, row.id, {
    [VERSION.openedCount]: next.openedCount,
    [VERSION.firstOpenedAt]: next.firstOpenedAt,
    [VERSION.lastOpenedAt]: next.lastOpenedAt,
    [VERSION.pdfDownloads]: next.pdfDownloads,
    [VERSION.activityLog]: next.activityLog,
    ...(note ? { [VERSION.firstOpenNotedAt]: now.toISOString() } : {}),
  });
  if (!note) return { ok: true, counted, noted: false };
  const posted = await comment(row, (info, names) => firstOpenComment(info, now, report.device, names));
  if (!posted) await updateRecord(T.versions, row.id, { [VERSION.firstOpenNotedAt]: null }).catch(() => undefined);
  return { ok: true, counted, noted: posted };
}

export type SummaryResult = { ok: true; noted: number; failed: number } | { ok: false; status: number; message: string };

/** At most this many summaries per daily run; the rest go the next day. */
const SUMMARIES_PER_RUN = 10;

/** The daily run: one summary comment for each tracked version sent three or more days ago and still Sent. */
export async function noteSummaries(key: string | null, now = new Date()): Promise<SummaryResult> {
  if (!activityKeyOk(key)) return { ok: false, status: 401, message: "Wrong or missing key." };
  const today = torontoToday(now);
  const due = await listRecords(T.versions, {
    fields: TRACK_FIELDS,
    filterByFormula: `AND({${VERSION.status}}='Sent', {${VERSION.trackActivity}}, {${VERSION.summaryNotedAt}}=BLANK(), {${VERSION.sentAt}}!=BLANK())`,
  });
  let noted = 0;
  let failed = 0;
  const people = await users();
  for (const row of due.filter((r) => summaryDue(str(r.fields[VERSION.sentAt]), today)).slice(0, SUMMARIES_PER_RUN)) {
    await updateRecord(T.versions, row.id, { [VERSION.summaryNotedAt]: now.toISOString() });
    const posted = await comment(row, (info, names) => summaryComment(info, stateOf(row.fields), names), people);
    if (posted) noted++;
    else {
      failed++;
      await updateRecord(T.versions, row.id, { [VERSION.summaryNotedAt]: null }).catch(() => undefined);
    }
  }
  return { ok: true, noted, failed };
}

/** Post one internal comment on the version's customer conversation. False when it could not go. */
async function comment(row: Row, words: (info: ActivityInfo, names: string[]) => string, people?: Awaited<ReturnType<typeof users>>): Promise<boolean> {
  if (!makeConfigured()) return false;
  const f = row.fields;
  const quoteId = ids(f[VERSION.quote])[0];
  if (!quoteId) return false;
  const quote = (await listByIds(T.quotes, [quoteId], [QUOTE.quoteNumber, QUOTE.ghlContactId, QUOTE.ghlOpportunityId]))[0];
  const contactId = str(quote?.fields[QUOTE.ghlContactId]);
  const quoteNumber = str(quote?.fields[QUOTE.quoteNumber]);
  if (!contactId || !quoteNumber) return false;
  const basis = str(f[VERSION.basis]);
  const sentBy = str(f[VERSION.sentBy]);
  const info: ActivityInfo = {
    quoteNumber,
    version: num(f[VERSION.version]),
    basis,
    sentAt: str(f[VERSION.sentAt]),
    senderName: sentBy ? firstNameOf({ email: sentBy, name: null }) : null,
    sentTo: str(f[VERSION.sentTo]),
  };
  const tagged = mentionsFor(basis, sentBy, people ?? (await users()), await assigned(contactId, str(quote?.fields[QUOTE.ghlOpportunityId]), basis), FALLBACK_MENTION_USER_ID);
  try {
    const names = tagged.flatMap((t) => (t.name ? [t.name] : []));
    await sendMessage({ type: "InternalComment", contactId, message: words(info, names), mentions: tagged.map((t) => t.id) });
    return true;
  } catch (e) {
    console.error("activity comment", e);
    return false;
  }
}

/** The location's users, or none when the token can't list them (then only the assigned user is tagged). */
async function users() {
  if (!ghlConfigured()) return [];
  return locationUsers().catch(() => []);
}

/** The user the contact is assigned to, else the opportunity's (usually the same person); null for a preliminary or neither. */
async function assigned(contactId: string, opportunityId: string | null, basis: string | null): Promise<string | null> {
  if (basis === "Preliminary" || !ghlConfigured()) return null;
  const fromContact = await contactOwner(contactId).catch(() => null);
  if (fromContact || !opportunityId) return fromContact;
  return opportunityOwner(opportunityId).catch(() => null);
}
