import "server-only";
import { acceptTerms, termsById, type LiveTerms } from "@/lib/accept/live";
import { parseAcceptance, type Acceptance } from "@/lib/accept/plan";
import { listByIds, listRecords } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { isCustomerDeployment } from "@/lib/mode";
import { copyState, parseCopy, torontoToday, type CopyState, type CustomerCopy } from "@/lib/send/copy";
import { isToken } from "@/lib/send/plan";
import { ids, num, str } from "./values";

/**
 * The customer's side: a sent quote, found by the secret in its link. The ONE loader without a
 * sign-in, so it is narrow on purpose:
 *
 * - it answers only on the customer deployment (QUOTE_MODE=customer, read-only token), and only
 *   for a well-formed token, before touching Airtable;
 * - it returns the frozen customer copy and nothing else: never a live line, cost or note;
 * - a version that was never really sent, or whose copy is missing, reads as not found.
 *
 * tests/boundary.test.ts pins all three, and that only app/c/ imports this file.
 */

/**
 * `acceptance`: the record of the customer's yes (2026-10-27), frozen like the copy; only on an accepted version.
 * `terms`: the Project Expectations this link shows: the version agreed to, once accepted; on an open
 * quote, today's, and only while Online Acceptance is switched on (null = no Accept button).
 */
export type CustomerQuote = { copy: CustomerCopy; state: CopyState; today: string; newerToken: string | null; acceptance: Acceptance | null; terms: LiveTerms | null };

export async function customerQuote(token: string): Promise<CustomerQuote | null> {
  if (!isCustomerDeployment() || !isToken(token)) return null;
  const found = await listRecords(T.versions, {
    fields: [VERSION.status, VERSION.validUntil, VERSION.customerCopy, VERSION.quote, VERSION.acceptance],
    filterByFormula: `{${VERSION.customerToken}}='${token}'`,
  });
  if (found.length !== 1) return null;
  const f = found[0].fields;
  const today = torontoToday(new Date());
  const state = copyState(str(f[VERSION.status]), str(f[VERSION.validUntil]), today);
  const copy = parseCopy(str(f[VERSION.customerCopy]));
  if (state === "hidden" || !copy) return null;
  const newerToken = state === "replaced" ? await newestSent(ids(f[VERSION.quote])[0], found[0].id) : null;
  const acceptance = state === "accepted" ? parseAcceptance(str(f[VERSION.acceptance])) : null;
  // An accepted quote changed since (2026-10-27): its page points at the change that is the contract now.
  const changedTo = acceptance ? await contractToken(ids(f[VERSION.quote])[0], found[0].id) : null;
  const terms = acceptance ? await termsById(acceptance.termsId) : state === "open" ? await acceptTerms() : null;
  return { copy, state, today, newerToken: newerToken ?? changedTo, acceptance, terms };
}

/** For a replaced version: the link of the quote's newest version that is out with the customer. */
async function newestSent(quoteRecordId: string | undefined, self: string): Promise<string | null> {
  if (!quoteRecordId) return null;
  const quote = await listByIds(T.quotes, [quoteRecordId], [QUOTE.versions]);
  const others = ids(quote[0]?.fields[QUOTE.versions]).filter((id) => id !== self);
  if (others.length === 0) return null;
  const versions = await listByIds(T.versions, others, [VERSION.status, VERSION.version, VERSION.customerToken]);
  const live = versions
    .filter((v) => ["Sent", "Accepted", "Won"].includes(str(v.fields[VERSION.status]) ?? "") && isToken(str(v.fields[VERSION.customerToken])))
    .sort((a, b) => (num(b.fields[VERSION.version]) ?? 0) - (num(a.fields[VERSION.version]) ?? 0));
  return live.length ? str(live[0].fields[VERSION.customerToken]) : null;
}

/** For an accepted version: the link of the change that is the quote's contract now, when it isn't this version. */
async function contractToken(quoteRecordId: string | undefined, self: string): Promise<string | null> {
  if (!quoteRecordId) return null;
  const quote = await listByIds(T.quotes, [quoteRecordId], [QUOTE.contractVersion]);
  const contract = ids(quote[0]?.fields[QUOTE.contractVersion])[0];
  if (!contract || contract === self) return null;
  const v = await listByIds(T.versions, [contract], [VERSION.customerToken]);
  const token = str(v[0]?.fields[VERSION.customerToken]);
  return isToken(token) ? token : null;
}

