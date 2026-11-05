import "server-only";
import { timingSafeEqual } from "node:crypto";
import { listByIds, listRecords, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { applyActivity, firstOpenComment, parseActivity, sentNote, summaryComment, summaryDue, type ActivityInfo, type TrackState } from "@/lib/activity/track";
import { customerUrl, staffQuoteLink } from "@/lib/accept/settings";
import { addContactNote, makeConfigured, sendMessage } from "@/lib/make/client";
import { torontoToday } from "@/lib/send/copy";
import { customerLinks, isToken } from "@/lib/send/plan";
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
 *   noteSentLinks: once, by hand (2026-11-05), the send note (a contact note with the staff link) for
 *     named versions that went out before sends added it themselves.
 *
 * A comment's "noted" stamp is written before the comment goes and taken back if it fails, so a
 * comment goes at most once and a failed one is tried again. The comments are informative and tag
 * nobody (Albert, 2026-11-05; until then a measured quote's tagged the assigned user and the sender).
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
  VERSION.customerToken,
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
  const posted = await comment(row, (info) => firstOpenComment(info, now, report.device));
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
  for (const row of due.filter((r) => summaryDue(str(r.fields[VERSION.sentAt]), today)).slice(0, SUMMARIES_PER_RUN)) {
    await updateRecord(T.versions, row.id, { [VERSION.summaryNotedAt]: now.toISOString() });
    const posted = await comment(row, (info) => summaryComment(info, stateOf(row.fields)));
    if (posted) noted++;
    else {
      failed++;
      await updateRecord(T.versions, row.id, { [VERSION.summaryNotedAt]: null }).catch(() => undefined);
    }
  }
  return { ok: true, noted, failed };
}

export type SentNotesResult = { ok: true; noted: string[]; skipped: { id: string; why: string }[]; failed: string[] } | { ok: false; status: number; message: string };

/**
 * The send note for versions sent before sends added it (Albert, 2026-11-05: "scan and write all the sent out quotes
 * so far with the note link"; a contact note, "not an internal note"). Run once by hand
 * (.github/workflows/quote-sent-notes.yml) with the exact version ids. Only a version still Sent and with a link gets
 * one, so a replaced one is skipped. Nothing is written to Airtable, so running it twice adds the notes twice.
 */
export async function noteSentLinks(key: string | null, versionIds: unknown): Promise<SentNotesResult> {
  if (!activityKeyOk(key)) return { ok: false, status: 401, message: "Wrong or missing key." };
  const wanted = Array.isArray(versionIds) ? [...new Set(versionIds)] : [];
  if (!wanted.length || wanted.length > 20 || !wanted.every((v) => typeof v === "string" && /^rec[A-Za-z0-9]{14}$/.test(v))) {
    return { ok: false, status: 400, message: "Send 1 to 20 version ids." };
  }
  const base = customerUrl();
  if (!base) return { ok: false, status: 503, message: "The customer link address (QUOTE_CUSTOMER_URL) isn't set." };
  const rows = await listByIds(T.versions, wanted as string[], TRACK_FIELDS);
  const noted: string[] = [];
  const failed: string[] = [];
  const skipped = (wanted as string[]).filter((id) => !rows.some((r) => r.id === id)).map((id) => ({ id, why: "no such version" }));
  for (const row of rows) {
    const f = row.fields;
    const token = str(f[VERSION.customerToken]);
    const sentAt = str(f[VERSION.sentAt]);
    const why =
      str(f[VERSION.status]) !== "Sent" ? `status is ${str(f[VERSION.status]) ?? "blank"}, not Sent`
      : !sentAt ? "no send date"
      : !isToken(token) ? "no customer link"
      : null;
    if (why) {
      skipped.push({ id: row.id, why });
      continue;
    }
    const { link } = customerLinks(base, token!, "x");
    const about = await infoOf(row);
    if (!about) {
      failed.push(row.id);
      continue;
    }
    try {
      await addContactNote(about.contactId, sentNote(about.info, link, staffQuoteLink(row.id)));
      noted.push(row.id);
    } catch (e) {
      console.error("sent note", e);
      failed.push(row.id);
    }
  }
  return { ok: true, noted, skipped, failed };
}

/** Post one internal comment on the version's customer conversation. False when it could not go. */
async function comment(row: Row, words: (info: ActivityInfo) => string): Promise<boolean> {
  const about = await infoOf(row);
  if (!about) return false;
  try {
    // Informative only: nobody is tagged (Albert, 2026-11-05).
    await sendMessage({ type: "InternalComment", contactId: about.contactId, message: words(about.info), mentions: [] });
    return true;
  } catch (e) {
    console.error("activity comment", e);
    return false;
  }
}

/** The version's GHL contact and what the notes say about it; null when Make is off or the quote can't be read. */
async function infoOf(row: Row): Promise<{ contactId: string; info: ActivityInfo } | null> {
  if (!makeConfigured()) return null;
  const f = row.fields;
  const quoteId = ids(f[VERSION.quote])[0];
  if (!quoteId) return null;
  const quote = (await listByIds(T.quotes, [quoteId], [QUOTE.quoteNumber, QUOTE.ghlContactId]))[0];
  const contactId = str(quote?.fields[QUOTE.ghlContactId]);
  const quoteNumber = str(quote?.fields[QUOTE.quoteNumber]);
  if (!contactId || !quoteNumber) return null;
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
  return { contactId, info };
}
