import "server-only";
import { getRecord, listRecords, updateRecord, type AirtableRecord } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { requireQuoter } from "@/lib/auth";
import { sortThread, type Channel, type Message } from "@/lib/conversation/thread";
import { conversationMessages, conversationsForContact, emailMessage, getContact, ghlConfigured, type GhlContact } from "@/lib/ghl/client";
import { addressLine, findAddress, type AddressFinding } from "@/lib/link/addressReply";
import { sameSiteAs } from "@/lib/link/booking";
import { buildContactAddress } from "@/lib/link/ghlRequest";
import { customerRefresh } from "@/lib/link/refresh";
import { makeConfigured, sendToGhl } from "@/lib/make/client";
import type { AddressHeldReason, AddressScanQuote, AddressScanResult } from "./types";
import { ids, str } from "./values";

/**
 * Address arrived (Albert, 2026-10-27: "filled auto"). A quote booked before anyone had the site
 * address says No address yet; the booking workflow then texts ADDRESS_ASK, or the customer sends it
 * on their own. When the quote list or a quote page opens, this reads the messages of quotes still
 * waiting for an address, and when exactly one address can be read (src/lib/link/addressReply.ts)
 * puts it on the customer's blank GHL contact through Make and on the quote as Unconfirmed. Staff
 * then press Confirm address, which is what writes it onto the opportunity, as before.
 *
 * - Only a blank is filled: the contact and the quote are read again right before the write.
 * - A contact that already has an address is simply copied onto the quote, as opening it would.
 * - Never a won quote (Notion owns its address), and a customer with two quotes waiting is held:
 *   nobody can tell which job the address is for.
 * - Nothing from the conversation is stored except the address and one dated line in the quote's notes.
 * - Off when GHL reading or the Make step isn't set up; GHL being slow never stops a page.
 */

/** Quotes started longer ago than this with no address are a person's to chase; the list scan leaves them. */
const SCAN_DAYS = 60;
/** How far before the quote was started their messages count: the inquiry often comes first. */
const LOOKBACK_DAYS = 30;
/** At most this many quotes are read per scan, newest first. */
const MAX_PER_SCAN = 10;
/** Quotes read at once, to stay far from GHL's rate limit. */
const PARALLEL = 3;
/** The list page scans at most once a minute per server instance. */
const RESCAN_MS = 60_000;
/** Conversations read per contact (nearly everyone has one), and emails fetched in full when the list gave no body. */
const MAX_CONVERSATIONS = 3;
const MAX_EMAIL_FETCHES = 3;

const REC_ID = /^rec[A-Za-z0-9]{14}$/;
const DAY = 86_400_000;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const appendNote = (old: unknown, line: string) => [str(old), `${today()}: ${line}`].filter(Boolean).join("\n");
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const CHANNEL_WORD: Partial<Record<Channel, string>> = { sms: "text", chat: "message", email: "email" };

/** Per server instance: the conversation's newest message time when a quote was last read and nothing could be filled. */
const unchanged = new Map<string, string>();
let lastScan = 0;

type ScanQuote = {
  id: string;
  createdTime: string;
  quoteNumber: string | null;
  customer: string | null;
  versionId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  siteAddress: string | null;
  siteCity: string | null;
  addressStatus: string | null;
  projectNumber: string | null;
};

type Outcome = { kind: "filled"; address: string } | { kind: "synced" } | { kind: "held"; reason: AddressHeldReason } | { kind: "nothing" };
const NOTHING: Outcome = { kind: "nothing" };

function scanQuote(r: AirtableRecord): ScanQuote {
  const f = r.fields;
  const name = [str(f[QUOTE.firstName]), str(f[QUOTE.lastName])].filter(Boolean).join(" ");
  return {
    id: r.id,
    createdTime: r.createdTime,
    quoteNumber: str(f[QUOTE.quoteNumber]),
    customer: name || str(f[QUOTE.customerName]),
    versionId: ids(f[QUOTE.versions]).at(-1) ?? null,
    contactId: str(f[QUOTE.ghlContactId]),
    opportunityId: str(f[QUOTE.ghlOpportunityId]),
    siteAddress: str(f[QUOTE.siteAddress]),
    siteCity: str(f[QUOTE.siteCity]),
    addressStatus: str(f[QUOTE.addressStatus]),
    projectNumber: str(f[QUOTE.projectNumber]),
  };
}

/** Still waiting for an address: none on the quote, not won, a GHL contact to read. The list scan also leaves old quotes alone. */
const waiting = (q: ScanQuote, recentOnly: boolean, now: number) =>
  !q.siteAddress && !q.projectNumber && Boolean(q.contactId) && (!recentOnly || Date.parse(q.createdTime) >= now - SCAN_DAYS * DAY);

/**
 * Read the messages of quotes still waiting for an address and fill what can be filled. With a
 * quote record id, only that quote (its page is open); without, the newest few on the list.
 */
export async function scanAddresses(only: string | null = null): Promise<AddressScanResult> {
  await requireQuoter();
  if (!ghlConfigured()) return { ok: false, message: "GHL reading isn't set up on this deployment." };
  if (only !== null && !REC_ID.test(only)) return { ok: false, message: "That isn't a quote." };
  const result: AddressScanResult & { ok: true } = { ok: true, filled: [], synced: 0, held: [], checked: 0 };
  if (only === null) {
    if (Date.now() - lastScan < RESCAN_MS) return result;
    lastScan = Date.now();
  }

  const all = (
    await listRecords(T.quotes, {
      fields: [QUOTE.quoteNumber, QUOTE.firstName, QUOTE.lastName, QUOTE.customerName, QUOTE.versions, QUOTE.ghlContactId, QUOTE.ghlOpportunityId, QUOTE.siteAddress, QUOTE.siteCity, QUOTE.addressStatus, QUOTE.projectNumber],
    })
  ).map(scanQuote);
  const now = Date.now();
  const open = all.filter((q) => waiting(q, false, now));
  const recent = open.filter((q) => waiting(q, true, now));
  const due = (only ? open.filter((q) => q.id === only) : recent)
    .sort((a, b) => b.createdTime.localeCompare(a.createdTime))
    .slice(0, MAX_PER_SCAN);
  result.checked = due.length;

  await pool(due, PARALLEL, async (q) => {
    const head: AddressScanQuote = { quoteNumber: q.quoteNumber, customer: q.customer, versionId: q.versionId };
    try {
      const twoWaiting = recent.filter((o) => o.id !== q.id && o.contactId === q.contactId).length > 0;
      const r = await scanOne(q, all, twoWaiting);
      if (r.kind === "filled") result.filled.push({ ...head, address: r.address });
      else if (r.kind === "synced") result.synced++;
      else if (r.kind === "held") result.held.push({ ...head, reason: r.reason });
    } catch (e) {
      // One quote's trouble never stops the others; no customer detail goes in the log.
      console.error("scanAddresses", q.id, e instanceof Error ? e.message.slice(0, 200) : "error");
    }
  });
  return result;
}

async function scanOne(q: ScanQuote, all: ScanQuote[], twoWaiting: boolean): Promise<Outcome> {
  const contactId = q.contactId as string;
  const contact = await getContact(contactId);
  if (!contact) return NOTHING;
  if (contact.address) return (await syncFromContact(q, contact)) ? { kind: "synced" } : NOTHING;

  const conversations = (await conversationsForContact(contactId)).slice(0, MAX_CONVERSATIONS);
  if (conversations.length === 0) return NOTHING;
  // A thread with nothing new since it was last read is not read again (a missing time is always read).
  const stamp = conversations.map((c) => c.lastMessageAt ?? "").sort().at(-1) ?? "";
  if (stamp && unchanged.get(q.id) === stamp) return NOTHING;
  const remember = () => {
    if (stamp) unchanged.set(q.id, stamp);
  };
  const pages = await Promise.all(conversations.map((c) => conversationMessages(c.id)));
  const messages = await withEmailBodies(sortThread(pages.flatMap((p) => p.messages)));
  const since = new Date(Date.parse(q.createdTime) - LOOKBACK_DAYS * DAY).toISOString();
  const finding = findAddress(messages, { since, ours: [process.env.QUOTE_COMPANY_ADDRESS?.trim() || null] });

  if (finding.kind !== "found") {
    remember();
    return finding.kind === "several" ? { kind: "held", reason: "several" } : NOTHING;
  }
  if (twoWaiting) {
    remember();
    return { kind: "held", reason: "jobs" };
  }
  // GHL changes go through Make's link route, which needs the job's opportunity: an unlinked quote waits until it is linked.
  if (!q.opportunityId || !q.quoteNumber) return { kind: "held", reason: "unlinked" };
  if (!makeConfigured()) return NOTHING;
  return fill(q, finding, all);
}

/** Put the address on the blank contact, then on the quote as Unconfirmed, with a dated note saying where it came from. */
async function fill(q: ScanQuote, finding: AddressFinding & { kind: "found" }, all: ScanQuote[]): Promise<Outcome> {
  const contactId = q.contactId as string;
  // Compare and swap: both must still be without an address at the moment of writing.
  const [contact, current] = await Promise.all([getContact(contactId), getRecord(T.quotes, q.id)]);
  if (!contact || contact.address) return NOTHING;
  if (str(current.fields[QUOTE.siteAddress]) || str(current.fields[QUOTE.projectNumber])) return NOTHING;

  const line = addressLine(finding.address);
  await sendToGhl(
    buildContactAddress({
      contactId,
      opportunityId: q.opportunityId as string,
      quoteNumber: q.quoteNumber as string,
      address: { line1: line, city: finding.address.city, postalCode: finding.address.postalCode },
      contact,
    }),
  );

  // If this write fails, the contact already has the address and the quote copies it the next time it opens.
  const city = contact.city ?? finding.address.city;
  const where = [line, city].filter(Boolean).join(", ");
  const twins = sameSiteAs(
    all.map((o) => ({ id: o.id, quoteNumber: o.quoteNumber, contactId: o.contactId, opportunityId: o.opportunityId, siteAddress: o.siteAddress, addressStatus: o.addressStatus, won: Boolean(o.projectNumber) })),
    { quoteId: q.id, contactId },
    line,
  );
  const note = [
    `address read from their ${CHANNEL_WORD[finding.channel] ?? "message"} of ${when(finding.at)}${finding.afterAsk ? ", answering the address ask" : ""}: ${where}.`,
    "Put on the GHL contact; check it and press Confirm address.",
    twins.length ? `Same address as ${twins.join(", ")}: check it is this job's.` : null,
  ];
  await updateRecord(T.quotes, q.id, {
    [QUOTE.siteAddress]: line,
    ...(city ? { [QUOTE.siteCity]: city } : {}),
    [QUOTE.addressStatus]: "Unconfirmed",
    [QUOTE.notes]: appendNote(current.fields[QUOTE.notes], note.filter(Boolean).join(" ")),
  });
  unchanged.delete(q.id);
  return { kind: "filled", address: where };
}

/** The contact already has an address (staff typed it, or GHL had it): the quote copies it, by the same rule as opening the quote. */
async function syncFromContact(q: ScanQuote, contact: GhlContact): Promise<boolean> {
  const patch = customerRefresh(
    { firstName: null, lastName: null, phone: null, email: null, siteAddress: q.siteAddress, siteCity: q.siteCity, addressStatus: q.addressStatus, projectNumber: q.projectNumber },
    contact,
    null,
  );
  if (!patch.siteAddress) return false;
  await updateRecord(T.quotes, q.id, {
    [QUOTE.siteAddress]: patch.siteAddress,
    ...(patch.siteCity ? { [QUOTE.siteCity]: patch.siteCity } : {}),
    ...(patch.addressStatus ? { [QUOTE.addressStatus]: patch.addressStatus } : {}),
  });
  return true;
}

/** Inbound emails the list gave no body for are fetched in full, newest first, a few at most; a failed fetch leaves the entry as it was. */
async function withEmailBodies(messages: Message[]): Promise<Message[]> {
  const wanted = [...messages].reverse().filter((m) => m.channel === "email" && m.direction === "in" && !m.body && m.emailId).slice(0, MAX_EMAIL_FETCHES);
  if (wanted.length === 0) return messages;
  const fetched = await Promise.all(wanted.map((m) => emailMessage(m.emailId as string).catch(() => null)));
  const byId = new Map(wanted.map((m, i) => [m.id, fetched[i]] as const));
  return messages.map((m) => {
    const full = byId.get(m.id);
    return full ? { ...m, body: full.body ?? m.body } : m;
  });
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await run(item);
    }),
  );
}
