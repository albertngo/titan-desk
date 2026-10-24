import "server-only";
import { listByIds, updateRecord, updateRecords } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { requireQuoter, requireQuoterPerson } from "@/lib/auth";
import { fromQuote } from "@/lib/editor/model";
import { BOOKING_URLS } from "@/lib/ghl/ids";
import { makeConfigured, sendMessage } from "@/lib/make/client";
import { COPY_MAX_CHARS, customerCopy, parseCopy, pdfName, serializeCopy, torontoToday, type CustomerCopy, type Letterhead } from "@/lib/send/copy";
import { customerLinks, emailFromFor, emailMessage, isToken, newToken, sendProblems, smsMessage, type Channels, type Sender } from "@/lib/send/plan";
import { authorFields, firstNameOf, type Person } from "./history";
import { getQuote } from "./load";
import { refreshFromGhl } from "./refresh";
import { fingerprint } from "./savePlan";
import type { SendResult } from "./types";
import { ids, str } from "./values";

/**
 * Sending a quote to the customer (milestone 4, Albert 2026-10-15). What may be sent and the
 * message bodies are decided in src/lib/send/ (pure, tested in tests/send.test.ts); this carries
 * it out:
 *
 *   1. checks, against Airtable as it is now and the fingerprint of what the person saw;
 *   2. freezes the customer copy on the version and marks it Sent, in one write, so the version
 *      is locked before anything leaves and a second send is refused;
 *   3. sends the email and/or the text through Make (GHL), each confirmed on its own. The email
 *      goes out from the signed-in quoter's address (2026-10-22, Albert): GHL's `emailFrom`, tried
 *      first as "Albert @ Titan Flooring <albert@…>", then as the bare address, then the location
 *      default, so a sender GHL won't accept never stops a quote going out — the warning says so;
 *   4. if neither went, puts the version back to Draft; if one did, it stays Sent and says which
 *      failed. Older sent versions of the same quote become Superseded, so their links say so.
 */


const REC_ID = /^rec[A-Za-z0-9]{14}$/;

/** Where customer links point: the customer deployment's address. Unset = sending is off. */
function customerBase(): string | null {
  const u = process.env.QUOTE_CUSTOMER_URL?.trim();
  return u && /^https:\/\/[^\s/]+/.test(u) ? u : null;
}

/** The letterhead printed on every quote, from this deployment's settings (no real details live in the repo). */
function letterhead(): Letterhead {
  const v = (k: string) => process.env[k]?.trim() || null;
  return {
    name: v("QUOTE_COMPANY_NAME") ?? "Titan Flooring",
    address: v("QUOTE_COMPANY_ADDRESS"),
    phone: v("QUOTE_COMPANY_PHONE"),
    email: v("QUOTE_COMPANY_EMAIL"),
    website: v("QUOTE_COMPANY_WEBSITE"),
    hstNumber: v("QUOTE_COMPANY_HST"),
    logoUrl: logoUrl(),
  };
}

/**
 * The logo in the email's header (2026-10-23): the brand kit's horizontal lockup, shipped in
 * public/brand/ and served by the customer deployment (the public host, no sign-in on /brand/).
 * QUOTE_LOGO_URL overrides it; with neither, the header shows the company name as a wordmark.
 */
function logoUrl(): string | null {
  const override = process.env.QUOTE_LOGO_URL?.trim();
  if (override && /^https:\/\//.test(override)) return override;
  const base = customerBase();
  return base ? `${base.replace(/\/+$/, "")}/brand/titan-flooring-logo.png` : null;
}

/** The in-store and in-home booking pages a preliminary's email offers: the GHL calendars in src/lib/ghl/ids.ts. */
const booking = () => BOOKING_URLS;

const senderOf = (p: Person): Sender => ({ email: p.email, firstName: firstNameOf(p) });

/** For the Send card: the address the email will go out from, or null when GHL's default sender will be used. */
export async function sendsFrom(): Promise<string | null> {
  const person = await requireQuoterPerson();
  return emailFromFor(senderOf(person), letterhead().email, false);
}

export type SendReady = { ready: boolean; why: string | null };

/** Whether this deployment can send at all, for the quote page. */
export async function sendingReady(): Promise<SendReady> {
  await requireQuoter();
  if (!makeConfigured()) return { ready: false, why: "The Make step isn't switched on for this deployment." };
  if (!customerBase()) return { ready: false, why: "The customer link address (QUOTE_CUSTOMER_URL) isn't set for this deployment." };
  return { ready: true, why: null };
}

/** The customer link of a version already sent, for the quote page. */
export async function sentLink(token: string | null): Promise<string | null> {
  await requireQuoter();
  const base = customerBase();
  return base && isToken(token) ? customerLinks(base, token, "x").link : null;
}

/**
 * What the customer gets: for a version already sent, the copy frozen on it; for a draft, the
 * copy it would get if sent today. The preview page and PDF show this.
 */
/** `itemised`: preview the breakdown; false, the default, previews the lump sum (Albert, 2026-10-22). A sent version shows its frozen copy either way. */
export async function previewCopy(versionId: string, validUntil?: string, itemised = false): Promise<CustomerCopy | null> {
  await requireQuoter();
  const quote = await getQuote(versionId);
  if (!quote) return null;
  if (quote.status !== "Draft") {
    const stored = await listByIds(T.versions, [quote.id], [VERSION.customerCopy]);
    const frozen = parseCopy(str(stored[0]?.fields[VERSION.customerCopy]));
    if (frozen) return frozen;
  }
  const today = torontoToday(new Date());
  return customerCopy({ ...quote, itemised }, { sentOn: quote.sentAt ?? today, validUntil: validUntil ?? quote.validUntil ?? today, company: letterhead() });
}

/** The email as it would be sent today, for the staff preview (2026-10-22): placeholder links, the signed-in sender. */
export async function previewEmail(versionId: string, validUntil?: string, itemised = false, visited = false, attachPdf = false): Promise<string | null> {
  const person = await requireQuoterPerson();
  const copy = await previewCopy(versionId, validUntil, itemised);
  if (!copy) return null;
  const quote = await getQuote(versionId);
  const base = customerBase() ?? "https://example.invalid";
  const { link, pdfUrl } = customerLinks(base, isToken(quote?.customerToken) ? quote!.customerToken! : "x".repeat(32), pdfName(copy));
  const m = emailMessage(copy, { contactId: "preview", firstName: quote?.link?.firstName ?? null, link, pdfUrl }, senderOf(person), { booking: booking(), visited, attachPdf });
  return m.type === "Email" ? m.html : null;
}

function readInput(raw: unknown): { base: string; validUntil: string | null; channels: Channels; itemised: boolean; visited: boolean; attachPdf: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ch = (r.channels ?? {}) as Record<string, unknown>;
  if (typeof r.base !== "string" || (typeof r.validUntil !== "string" && r.validUntil !== null)) return null;
  // Lump sum unless the sender chose the breakdown (2026-10-22). A null date is a preliminary's; sendProblems refuses it on anything else.
  // `visited` (2026-10-24): the sender says whether we have been to the home; a preliminary's opening words follow it.
  return { base: r.base, validUntil: typeof r.validUntil === "string" ? r.validUntil : null, channels: { email: ch.email === true, sms: ch.sms === true }, itemised: r.itemised === true, visited: r.visited === true, attachPdf: r.attachPdf === true };
}

export async function sendQuote(versionId: string, raw: unknown): Promise<SendResult> {
  const person = await requireQuoterPerson();
  const sender = person.email;
  const input = readInput(raw);
  if (!REC_ID.test(versionId) || !input) return { ok: false, message: "That request didn't make sense. Reload the page." };
  const ready = await sendingReady();
  const base = customerBase();
  if (!ready.ready || !base) return { ok: false, message: ready.why ?? "Sending isn't switched on." };

  const loaded = await getQuote(versionId);
  if (!loaded) return { ok: false, message: "This version no longer exists." };
  // The freshest email and phone from GHL: that is where GHL will send it.
  const quote = await refreshFromGhl(loaded);
  const today = torontoToday(new Date());
  const problems = sendProblems(quote, input, { today, fingerprint: fingerprint(fromQuote(quote)) });
  if (problems.length) return { ok: false, message: "Not sent.", problems };

  // A preliminary has no good-until date whatever was sent (Albert, 2026-10-22); its link never expires.
  const validUntil = quote.basis === "Preliminary" ? null : input.validUntil;
  const copy = customerCopy({ ...quote, itemised: input.itemised }, { sentOn: today, validUntil, company: letterhead() });
  const text = serializeCopy(copy);
  if (text.length > COPY_MAX_CHARS) return { ok: false, message: "This quote is too long to send as one copy. Split it into fewer options." };
  const token = isToken(quote.customerToken) ? quote.customerToken : newToken();
  const contactId = quote.link!.ghlContactId!;
  const { link, pdfUrl } = customerLinks(base, token, pdfName(copy));

  // Locked and live before anything leaves: the link works the moment a message lands.
  await updateRecord(T.versions, quote.id, {
    [VERSION.customerToken]: token,
    [VERSION.customerCopy]: text,
    [VERSION.itemised]: input.itemised,
    [VERSION.validUntil]: validUntil,
    [VERSION.status]: "Sent",
    [VERSION.sentAt]: today,
    [VERSION.sentBy]: sender,
    [VERSION.sentTo]: null,
  });

  const sentTo: string[] = [];
  const failed: string[] = [];
  const notes: string[] = [];
  const firstName = quote.link?.firstName ?? null;
  const from = senderOf(person);
  let sentFrom: string | null = null;
  if (input.channels.email) {
    // From the quoter, named, then bare, then GHL's default: a refused sender costs a retry, never the send.
    const attempts = [...new Set([emailFromFor(from, copy.company.email, true), emailFromFor(from, copy.company.email, false), null])];
    let last: unknown = null;
    for (const emailFrom of attempts) {
      try {
        await sendMessage(emailMessage(copy, { contactId, firstName, link, pdfUrl }, from, { emailFrom, booking: booking(), visited: input.visited, attachPdf: input.attachPdf }));
        sentTo.push("Email");
        sentFrom = emailFrom;
        if (emailFrom === null && attempts[0] !== null) notes.push(`GHL would not send from ${from.email}, so the email went out from the location's default address.`);
        last = null;
        break;
      } catch (e) {
        last = e;
      }
    }
    if (last) failed.push(`Email: ${last instanceof Error ? last.message : String(last)}`);
  }
  if (input.channels.sms) {
    try {
      await sendMessage(smsMessage(copy, { contactId, firstName, link }, from, { visited: input.visited }));
      sentTo.push("Text");
    } catch (e) {
      failed.push(`Text: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (sentTo.length === 0) {
    await updateRecord(T.versions, quote.id, {
      [VERSION.status]: "Draft",
      [VERSION.sentAt]: null,
      [VERSION.sentBy]: null,
    }).catch(() => undefined);
    return { ok: false, message: `Nothing was sent, and the version is still a draft. ${failed.join(" ")}` };
  }

  try {
    const how = `sent by ${sentTo.join(" and ").toLowerCase()}${sentFrom ? ` from ${sentFrom}` : sentTo.includes("Email") ? " from the location's default address" : ""}${sentTo.includes("Email") && input.attachPdf ? ", PDF attached" : ""}`;
    await updateRecord(T.versions, quote.id, { [VERSION.sentTo]: sentTo.join(", "), ...authorFields(person, new Date(), how, quote.editLog) });
  } catch {
    notes.push("Airtable didn't record how it was sent.");
  }
  try {
    await supersedeOlder(quote.link!.quoteRecordId, quote.id);
  } catch {
    notes.push("Older sent versions could not be marked Superseded; do that in Airtable.");
  }
  const warning = [...failed.map((f) => `Not sent by ${f}`), ...notes].join(" ") || null;
  return { ok: true, link, sentTo, warning };
}

/** The quote's other versions that were sent: their links now say a newer quote replaced them. */
async function supersedeOlder(quoteRecordId: string, keep: string): Promise<void> {
  const quote = await listByIds(T.quotes, [quoteRecordId], [QUOTE.versions]);
  const versionIds = ids(quote[0]?.fields[QUOTE.versions]).filter((id) => id !== keep);
  if (versionIds.length === 0) return;
  const versions = await listByIds(T.versions, versionIds, [VERSION.status]);
  const older = versions.filter((v) => str(v.fields[VERSION.status]) === "Sent");
  if (older.length) await updateRecords(T.versions, older.map((v) => ({ id: v.id, fields: { [VERSION.status]: "Superseded" } })));
}
