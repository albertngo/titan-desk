import "server-only";
import { listByIds, updateRecord, updateRecords } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { requireQuoter, requireQuoterPerson } from "@/lib/auth";
import { fromQuote } from "@/lib/editor/model";
import { etransferEmail } from "@/lib/accept/settings";
import { TERMS } from "@/lib/accept/terms";
import { BOOKING_URLS } from "@/lib/ghl/ids";
import { followUpTagBodies } from "@/lib/activity/track";
import { acceptedCopy, parseAcceptance } from "@/lib/accept/plan";
import { changeSummary } from "@/lib/change/diff";
import { buildContract } from "@/lib/link/ghlRequest";
import { makeConfigured, sendMessage, sendToGhl, setFollowUpTags } from "@/lib/make/client";
import { COPY_MAX_CHARS, customerCopy, parseCopy, pdfName, serializeCopy, torontoToday, type CustomerCopy, type Letterhead } from "@/lib/send/copy";
import { changeEmailMessage, changeSmsMessage, chooseOptions, chosenWords, customerLinks, emailFromFor, emailMessage, isToken, newToken, parseOptionIds, sendProblems, smsMessage, type Channels, type Sender } from "@/lib/send/plan";
import { authorFields, firstNameOf, type Person } from "./history";
import { getQuote } from "./load";
import { refreshFromGhl } from "./refresh";
import { fingerprint } from "./savePlan";
import type { Quote, SendResult } from "./types";
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
 *      failed. Older sent versions of the same quote become Superseded, so their links say so;
 *   5. sets the follow-up tag (2026-10-27) and marks the version tracked, so its first open and a
 *      three-day summary are noted in GHL (src/lib/quotes/activity.ts).
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

/**
 * Whether the email should say "press Accept" (2026-10-27): the terms are in the app and the deposit
 * address is set. The keys on both deployments go in on the same day the terms PDF does (go-live).
 */
const acceptOnline = () => TERMS !== null && etransferEmail() !== null;

/**
 * A change after acceptance (2026-10-27): its copy carries what changed since the contract it updates,
 * read from that version's own frozen copy (and its acceptance, for the accepted one). Null when the
 * contract can't be read, which stops the send.
 */
async function withChange(quote: Quote, copy: CustomerCopy): Promise<CustomerCopy | null> {
  if (!quote.changeNo) return copy;
  const contractId = quote.link?.contractVersionId;
  if (!contractId || contractId === quote.id) return null;
  const rec = (await listByIds(T.versions, [contractId], [VERSION.customerCopy, VERSION.acceptance]))[0];
  const frozen = parseCopy(str(rec?.fields[VERSION.customerCopy]));
  if (!frozen) return null;
  const a = parseAcceptance(str(rec?.fields[VERSION.acceptance]));
  const before = a && !a.cancelled ? acceptedCopy(frozen, a) : frozen;
  if (!before.options[0] || !copy.options[0]) return null;
  return { ...copy, change: changeSummary(quote.changeNo, a?.on ?? before.sentOn, before.options[0], copy.options[0]) };
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
/**
 * `itemised`: preview the breakdown; false, the default, previews the lump sum (Albert, 2026-10-22).
 * `range`: false previews a preliminary's exact price instead of its range (2026-10-27). A sent
 * version shows its frozen copy either way.
 */
export async function previewCopy(versionId: string, validUntil?: string, itemised = false, optionIds: string[] | null = null, range = true, pdf = false): Promise<CustomerCopy | null> {
  await requireQuoter();
  const quote = await getQuote(versionId);
  if (!quote) return null;
  if (quote.status !== "Draft") {
    const stored = await listByIds(T.versions, [quote.id], [VERSION.customerCopy]);
    const frozen = parseCopy(str(stored[0]?.fields[VERSION.customerCopy]));
    if (frozen) return frozen;
  }
  const today = torontoToday(new Date());
  // A draft previews only the options ticked on the Send card (2026-10-24); none matching = all.
  const chosen = chooseOptions(quote, optionIds);
  const copy = customerCopy({ ...(chosen.options.length ? chosen : quote), itemised }, { sentOn: quote.sentAt ?? today, validUntil: quote.changeNo ? null : (validUntil ?? quote.validUntil ?? today), company: letterhead(), range, pdf });
  return (await withChange(quote, copy)) ?? copy;
}

/** The email as it would be sent today, for the staff preview (2026-10-22): placeholder links, the signed-in sender. */
export async function previewEmail(versionId: string, validUntil?: string, itemised = false, pdf = false, optionIds: string[] | null = null, range = true): Promise<string | null> {
  const person = await requireQuoterPerson();
  const copy = await previewCopy(versionId, validUntil, itemised, optionIds, range, pdf);
  if (!copy) return null;
  const quote = await getQuote(versionId);
  const base = customerBase() ?? "https://example.invalid";
  const { link } = customerLinks(base, isToken(quote?.customerToken) ? quote!.customerToken! : "x".repeat(32), pdfName(copy));
  const to = { contactId: "preview", firstName: quote?.link?.firstName ?? null, link };
  // Never an attachment (Albert, 2026-10-27), a change included; only the acceptance email carries one.
  const m = copy.change ? changeEmailMessage(copy, to, senderOf(person)) : emailMessage(copy, to, senderOf(person), { booking: booking(), acceptOnline: acceptOnline() });
  return m.type === "Email" ? m.html : null;
}

function readInput(raw: unknown): { base: string; validUntil: string | null; channels: Channels; itemised: boolean; pdf: boolean; optionIds: string[] | null; range: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ch = (r.channels ?? {}) as Record<string, unknown>;
  if (typeof r.base !== "string" || (typeof r.validUntil !== "string" && r.validUntil !== null)) return null;
  // Lump sum unless the sender chose the breakdown (2026-10-22). A null date is a preliminary's; sendProblems refuses it on anything else.
  // `range` (2026-10-27): a preliminary goes as a range unless the sender says false, so a missing value is the range.
  // `pdf` (2026-10-27): the quote page offers the PDF only when the sender ticked it; it is never attached to the email.
  return { base: r.base, validUntil: typeof r.validUntil === "string" ? r.validUntil : null, channels: { email: ch.email === true, sms: ch.sms === true }, itemised: r.itemised === true, pdf: r.pdf === true, optionIds: r.optionIds === undefined || r.optionIds === null ? null : (parseOptionIds(r.optionIds) ?? []), range: r.range !== false };
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

  // A preliminary has no good-until date whatever was sent (Albert, 2026-10-22); its link never expires. Nor does a change (2026-10-27).
  const validUntil = quote.basis === "Preliminary" || quote.changeNo ? null : input.validUntil;
  // A preliminary is always a lump sum and goes as a range unless the sender chose the exact price (2026-10-27).
  const prelim = quote.basis === "Preliminary";
  const itemised = !prelim && input.itemised;
  // Only the options ticked on the Send card go to the customer, everywhere (2026-10-24).
  const plain = customerCopy({ ...chooseOptions(quote, input.optionIds), itemised }, { sentOn: today, validUntil, company: letterhead(), range: input.range, pdf: input.pdf });
  // A change carries what changed since the contract it updates (2026-10-27).
  const copy = await withChange(quote, plain);
  if (!copy) return { ok: false, message: "This change can't be sent: the accepted quote it changes couldn't be read. Open the accepted version and try Make a change again." };
  const text = serializeCopy(copy);
  if (text.length > COPY_MAX_CHARS) return { ok: false, message: "This quote is too long to send as one copy. Split it into fewer options." };
  const token = isToken(quote.customerToken) ? quote.customerToken : newToken();
  const contactId = quote.link!.ghlContactId!;
  const { link } = customerLinks(base, token, pdfName(copy));

  // Locked and live before anything leaves: the link works the moment a message lands.
  await updateRecord(T.versions, quote.id, {
    [VERSION.customerToken]: token,
    [VERSION.customerCopy]: text,
    [VERSION.itemised]: itemised,
    [VERSION.validUntil]: validUntil,
    [VERSION.status]: "Sent",
    [VERSION.sentAt]: today,
    [VERSION.sentBy]: sender,
    [VERSION.sentTo]: null,
    // Open tracking (2026-10-27): this version's first open and its three-day summary go to GHL.
    [VERSION.trackActivity]: true,
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
        await sendMessage(
          copy.change
            ? changeEmailMessage(copy, { contactId, firstName, link }, from, { emailFrom })
            : emailMessage(copy, { contactId, firstName, link }, from, { emailFrom, booking: booking(), acceptOnline: acceptOnline() }),
        );
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
      await sendMessage(copy.change ? changeSmsMessage(copy, { contactId, firstName, link }, from) : smsMessage(copy, { contactId, firstName, link }, from));
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
    const how = `sent by ${sentTo.join(" and ").toLowerCase()}${sentFrom ? ` from ${sentFrom}` : sentTo.includes("Email") ? " from the location's default address" : ""}${input.pdf ? ", PDF on the quote page" : ""}${chosenWords(quote, input.optionIds) ? `, ${chosenWords(quote, input.optionIds)}` : ""}${prelim && !input.range ? ", exact price, no range" : ""}`;
    await updateRecord(T.versions, quote.id, { [VERSION.sentTo]: sentTo.join(", "), ...authorFields(person, new Date(), how, quote.editLog) });
  } catch {
    notes.push("Airtable didn't record how it was sent.");
  }
  // The follow-up sequence (2026-10-27): both quote-sent tags off, this one's on, so a new version
  // restarts its sequence and a measured quote ends the preliminary's. Never stops a send. A change
  // after acceptance starts no follow-up: the customer already said yes (Won ends the sequences in GHL).
  if (!copy.change) {
    try {
      await setFollowUpTags(contactId, followUpTagBodies(quote.basis));
    } catch {
      notes.push("The follow-up tag couldn't be set in GHL, so no follow-up sequence started; add the quote-sent tag by hand.");
    }
  }
  try {
    await supersedeOlder(quote.link!.quoteRecordId, quote.id);
  } catch {
    notes.push("Older sent versions could not be marked Superseded; do that in Airtable.");
  }
  // A change is the contract now (2026-10-27): the quote points at it, and GHL's value (and, through Make, Notion's) follows it.
  if (copy.change) notes.push(...(await recordContract(quote, copy, link)));
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

/** After a change is sent: it is the contract; the opportunity's value is its total with HST. Returns what didn't happen, for the warning. */
async function recordContract(quote: Quote, copy: CustomerCopy, link: string): Promise<string[]> {
  const notes: string[] = [];
  try {
    await updateRecord(T.quotes, quote.link!.quoteRecordId, { [QUOTE.contractVersion]: [quote.id] });
  } catch {
    notes.push("The quote couldn't be pointed at this change as its contract; set Contract Version in Airtable.");
  }
  const contactId = quote.link?.ghlContactId;
  const opportunityId = quote.link?.ghlOpportunityId;
  if (!contactId || !opportunityId) return [...notes, "GHL's value wasn't updated: the quote isn't linked to an opportunity."];
  try {
    await sendToGhl(buildContract({ contactId, opportunityId, total: copy.options[0].totals.total, link }));
  } catch (e) {
    notes.push(`GHL's value wasn't updated (${e instanceof Error ? e.message : String(e)}). Set it to ${copy.options[0].totals.total.toFixed(2)} on the opportunity.`);
  }
  return notes;
}

