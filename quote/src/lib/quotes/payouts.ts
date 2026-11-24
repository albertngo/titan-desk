import "server-only";
import { AirtableError, getRecord, updateRecord, uploadAttachment } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { requireQuoter, requireQuoterPerson } from "@/lib/auth";
import { camDescription, cardFileName, cardSig, cardTotal, cleanPayouts, parsePayouts, payoutsRaw, pushProblem, serializePayouts, withPush, type PayoutPush } from "@/lib/payout/cards";
import { syncCardToProjectCosts } from "@/lib/notion/projectCosts";
import { runProjectWeek } from "@/lib/projectWeek/run";
import { str } from "./values";

/**
 * Contractor payout cards (Albert, 2026-11-04). Two writes: **save** the cards (Quotes → Payouts, JSON, compare-and-swap
 * like Rooms: refused if the field changed since the page opened) and **mark one final**. Marking final keeps the card's
 * picture, drawn in the browser from the saved card, on Quotes → Payout Cards (an attachment, so the quote keeps every
 * card that went out), then (since 2026-11-24, Albert: "No ccam push payout cards"; vault
 * `05_decisions/2026-11-24-installer-project-week-boards`) writes it to the contractor's own Notion Project Costs line
 * with the picture, and rebuilds that contractor's Project Week page. Nothing goes to CompanyCam any more: a project share
 * link showed every installer's pay. The step is recorded on the card (when, who, the total, a signature of the lines)
 * so the tab can say whether Project Costs has the latest.
 */

export type SavePayoutsResult = { ok: true; saved: string } | { ok: false; message: string };
export type PushPayoutResult = { ok: true; saved: string; warning: string | null } | { ok: false; message: string; saved?: string };

const REC_ID = /^rec[A-Za-z0-9]{14}$/;
/** A card image is small (one page of text); this is well under Vercel's request limit with base64 on top. */
const MAX_IMAGE_BYTES = 2_500_000;

const gone = { ok: false as const, message: "This quote isn't in Airtable any more." };
const why = (e: unknown) => (e instanceof Error ? e.message.slice(0, 120) : "error");

async function readQuote(quoteRecordId: string) {
  try {
    return { ok: true as const, rec: await getRecord(T.quotes, quoteRecordId) };
  } catch (e) {
    if (e instanceof AirtableError && (e.status === 404 || e.status === 403)) return gone;
    return { ok: false as const, message: `Airtable couldn't be read (${why(e)}), so nothing was saved. Try again.` };
  }
}

const CHANGED = "Someone else changed the payout cards on this quote since the page opened, so yours weren't saved. Copy what you changed, reload, and make it again.";

export async function savePayouts(quoteRecordId: string, seen: string, input: unknown): Promise<SavePayoutsResult> {
  const email = await requireQuoter();
  if (!REC_ID.test(quoteRecordId)) return gone;
  const read = await readQuote(quoteRecordId);
  if (!read.ok) return read;
  const current = payoutsRaw(read.rec.fields[QUOTE.payouts]);
  if (current !== seen) return { ok: false, message: CHANGED };
  const saved = serializePayouts(cleanPayouts(input, parsePayouts(current)), email, new Date().toISOString());
  try {
    await updateRecord(T.quotes, quoteRecordId, { [QUOTE.payouts]: saved });
  } catch (e) {
    return { ok: false, message: `The payout cards weren't saved (${why(e)}). Try again.` };
  }
  return { ok: true, saved };
}

/** Whether these bytes are a JPEG (its first three bytes), the one type a card is sent as. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function attachmentUrl(v: unknown, filename: string): string | null {
  if (!Array.isArray(v)) return null;
  const hit = [...v].reverse().find((a) => a && typeof a === "object" && (a as { filename?: unknown }).filename === filename) as { url?: unknown } | undefined;
  return typeof hit?.url === "string" && /^https:\/\//.test(hit.url) ? hit.url : null;
}

export async function pushPayoutCard(quoteRecordId: string, seen: string, cardId: string, imageBase64: string): Promise<PushPayoutResult> {
  const person = await requireQuoterPerson();
  if (!REC_ID.test(quoteRecordId)) return gone;
  const read = await readQuote(quoteRecordId);
  if (!read.ok) return read;
  const f = read.rec.fields;
  const current = payoutsRaw(f[QUOTE.payouts]);
  if (current !== seen) return { ok: false, message: "The payout cards changed since the page opened. Reload, check the card, and mark it final again." };
  const set = parsePayouts(current);
  const card = set?.cards.find((c) => c.id === cardId);
  if (!set || !card) return { ok: false, message: "Save the card first, then mark it final." };
  const problem = pushProblem(card);
  if (problem) return { ok: false, message: problem };
  const projectUrl = str(f[QUOTE.notionProjectUrl]);
  if (!projectUrl) return { ok: false, message: "This quote has no Notion project yet. It's filled in once the job is won; mark the card final after that." };

  const bytes = Buffer.from(typeof imageBase64 === "string" ? imageBase64 : "", "base64");
  if (!isJpeg(bytes) || bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, message: "The card's picture didn't come through. Try again." };

  const head = { quoteNumber: str(f[QUOTE.quoteNumber]), projectNumber: str(f[QUOTE.projectNumber]) };
  const now = new Date().toISOString();
  const filename = cardFileName(card.contractor, head, now);
  let uri: string | null;
  try {
    await uploadAttachment(T.quotes, quoteRecordId, QUOTE.payoutCards, { contentType: "image/jpeg", filename, base64: bytes.toString("base64") });
    uri = attachmentUrl((await getRecord(T.quotes, quoteRecordId)).fields[QUOTE.payoutCards], filename);
  } catch (e) {
    console.error("payout card upload", why(e));
    return { ok: false, message: `The card couldn't be kept on the quote (${why(e)}), so nothing went to Project Costs. Try again.` };
  }
  if (!uri) return { ok: false, message: "Airtable took the card but gave no address for it, so nothing went to Project Costs. Try again." };

  const by = person.name ?? person.email;
  const sync = await syncCardToProjectCosts({
    quoteRecordId,
    cardId,
    contractor: card.contractor,
    total: cardTotal(card),
    ref: head.projectNumber ?? head.quoteNumber,
    projectUrl,
    by,
    jpeg: new Uint8Array(bytes),
    filename,
    summary: camDescription(card, head, by),
  });
  if (!sync.ok) return { ok: false, message: `${sync.message} The card is kept on the quote in Airtable (Payout Cards).` };
  // The contractor's own page follows the card; a text only ever goes on a Send press.
  const refresh = await runProjectWeek({ kind: "refresh", memberId: sync.memberId }).catch(() => null);
  const pageNote = refresh?.ok && refresh.pages.length ? null : "Their Project Week page will catch up tonight.";
  const note = [sync.warning, pageNote].filter(Boolean).join(" ") || null;

  const push: PayoutPush = { at: now, by: person.email, total: cardTotal(card), sig: cardSig(card), file: filename, camPhotoId: null, notionPageId: sync.pageId };
  // Record the push on the cards as they are now: someone may have saved in the seconds this took.
  let latest = current;
  try {
    latest = payoutsRaw((await getRecord(T.quotes, quoteRecordId)).fields[QUOTE.payouts]);
  } catch {
    // fall back to what was checked above
  }
  const base = parsePayouts(latest);
  if (!base?.cards.some((c) => c.id === cardId)) return { ok: true, saved: latest, warning: "It's in Project Costs, but the card changed meanwhile, so that isn't marked on it." };
  const saved = serializePayouts(withPush(base, cardId, push), base.by ?? person.email, base.at ?? now);
  try {
    await updateRecord(T.quotes, quoteRecordId, { [QUOTE.payouts]: saved });
  } catch (e) {
    return { ok: true, saved: latest, warning: `It's in Project Costs, but that couldn't be marked on the card (${why(e)}).` };
  }
  return { ok: true, saved, warning: note };
}
