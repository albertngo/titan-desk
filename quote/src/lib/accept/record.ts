import "server-only";
import { getRecord, listByIds, listRecords, updateRecord, updateRecords, type AirtableRecord } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { ghlConfigured, pipelines } from "@/lib/ghl/client";
import { buildLost, buildWon, wonStageId } from "@/lib/link/ghlRequest";
import { makeConfigured, sendMessage, sendToGhl } from "@/lib/make/client";
import { appendLog, firstNameOf, logLine } from "@/lib/quotes/history";
import { ids, str } from "@/lib/quotes/values";
import { acceptedPdfName, copyState, parseCopy, torontoToday, type CopyState, type CustomerCopy } from "@/lib/send/copy";
import { acceptedEmailMessage, acceptedSmsMessage, customerLinks, emailFromFor, isToken, type Sender } from "@/lib/send/plan";
import { acceptedWhen, parseAcceptance, serializeAcceptance, type Acceptance, type Handoff } from "./plan";
import { customerUrl, etransferEmail, staffQuoteLink } from "./settings";
import { acceptTerms, type LiveTerms } from "./live";
import { TERMS_PDF } from "./terms";

/**
 * Carrying out an acceptance (Albert, 2026-10-27). Reached only from src/lib/accept/accept.ts (the
 * customer's link, through the keyed /api/accept) and src/lib/accept/staff.ts (a signed-in quoter),
 * each of which checks who is asking first; tests/boundary.test.ts pins that. The rules are in
 * plan.ts (pure, tested); this file reads and writes.
 *
 *   1. read the version again and record the yes only if it is still Sent and not yet accepted;
 *   2. the version becomes Accepted with the record, the option and the day; the quote's contract
 *      is this version; any other version still out with the customer is Superseded;
 *   3. hand off: the GHL opportunity goes to Project Won with the accepted total (with HST) through
 *      Make, which fires GHL's won workflow (Make 3710214: the Notion project, the WhatsApp post);
 *      then the acceptance email (stamped PDF and Project Expectations attached, the deposit request)
 *      and the text, by the channels the quote went out by.
 *
 * The yes is written first and stands whatever happens after: a hand-off that fails is kept on the
 * record and staff retry it from the quote page.
 */

export type AcceptTarget = {
  versionId: string;
  status: string | null;
  validUntil: string | null;
  token: string | null;
  copy: CustomerCopy | null;
  acceptance: Acceptance | null;
  editLog: string | null;
  sentBy: string | null;
  sentTo: string | null;
  quote: {
    id: string;
    quoteNumber: string | null;
    contactId: string | null;
    opportunityId: string | null;
    firstName: string | null;
    email: string | null;
    phone: string | null;
    versionIds: string[];
  } | null;
};

const FIELDS = [VERSION.status, VERSION.validUntil, VERSION.customerToken, VERSION.customerCopy, VERSION.acceptance, VERSION.editLog, VERSION.sentBy, VERSION.sentTo, VERSION.quote];

async function toTarget(r: AirtableRecord): Promise<AcceptTarget> {
  const f = r.fields;
  const quoteId = ids(f[VERSION.quote])[0];
  const q = quoteId ? (await listByIds(T.quotes, [quoteId], [QUOTE.quoteNumber, QUOTE.ghlContactId, QUOTE.ghlOpportunityId, QUOTE.firstName, QUOTE.email, QUOTE.phone, QUOTE.versions]))[0] : undefined;
  return {
    versionId: r.id,
    status: str(f[VERSION.status]),
    validUntil: str(f[VERSION.validUntil]),
    token: str(f[VERSION.customerToken]),
    copy: parseCopy(str(f[VERSION.customerCopy])),
    acceptance: parseAcceptance(str(f[VERSION.acceptance])),
    editLog: str(f[VERSION.editLog]),
    sentBy: str(f[VERSION.sentBy]),
    sentTo: str(f[VERSION.sentTo]),
    quote: q
      ? {
          id: q.id,
          quoteNumber: str(q.fields[QUOTE.quoteNumber]),
          contactId: str(q.fields[QUOTE.ghlContactId]),
          opportunityId: str(q.fields[QUOTE.ghlOpportunityId]),
          firstName: str(q.fields[QUOTE.firstName]),
          email: str(q.fields[QUOTE.email]),
          phone: str(q.fields[QUOTE.phone]),
          versionIds: ids(q.fields[QUOTE.versions]),
        }
      : null,
  };
}

/** The version a customer link points at, found by its secret; null for a token that matches nothing (or more than one). */
export async function targetByToken(token: string): Promise<AcceptTarget | null> {
  if (!isToken(token)) return null;
  const found = await listRecords(T.versions, { fields: FIELDS, filterByFormula: `{${VERSION.customerToken}}='${token}'` });
  return found.length === 1 ? toTarget(found[0]) : null;
}

export async function targetById(versionId: string): Promise<AcceptTarget | null> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(versionId)) return null;
  try {
    return await toTarget(await getRecord(T.versions, versionId));
  } catch {
    return null;
  }
}

/** What the customer link shows for this version today. */
export const stateOf = (t: Pick<AcceptTarget, "status" | "validUntil">, now = new Date()): CopyState => copyState(t.status, t.validUntil, torontoToday(now));

/**
 * Whether this deployment can take an acceptance now, and the Project Expectations it is taken
 * against. `off` is said to staff; null when acceptance is on.
 */
export async function acceptGate(): Promise<{ off: string | null; terms: LiveTerms | null }> {
  const terms = await acceptTerms();
  const off = !terms
    ? "Online acceptance is switched off (Quote Settings → Online Acceptance), or there is no Project Expectations PDF in Terms Versions yet."
    : !etransferEmail()
      ? "The e-transfer address (QUOTE_ETRANSFER_EMAIL) isn't set for this deployment."
      : !customerUrl()
        ? "The customer link address (QUOTE_CUSTOMER_URL) isn't set for this deployment."
        : !makeConfigured()
          ? "The Make step isn't switched on for this deployment."
          : null;
  return { off, terms: off ? null : terms };
}

export type RecordResult = { ok: true; acceptance: Acceptance; handoff: Handoff } | { ok: false; status: number; message: string };

const HOW: Record<Acceptance["method"], string> = { link: "on their link", store: "in store, signed", staff: "on the customer's behalf" };

/** Record the yes, then hand off. `who` goes in the edit log: the signed-in quoter, or "customer". */
export async function recordAcceptance(target: AcceptTarget, a: Acceptance, who: string): Promise<RecordResult> {
  // Read again right before writing: a second Accept, or a send of a newer version, wins nothing.
  const fresh = await targetById(target.versionId);
  if (!fresh || fresh.status !== "Sent" || fresh.acceptance || fresh.token !== target.token) {
    return { ok: false, status: 409, message: "This quote was just accepted or changed. Reload the page to see where it stands." };
  }
  const now = new Date(a.at);
  const added = a.addOns.length ? `, with ${a.addOns.map((x) => x.description).join(", ")}` : "";
  await updateRecord(T.versions, fresh.versionId, {
    [VERSION.status]: "Accepted",
    [VERSION.acceptance]: serializeAcceptance(a),
    [VERSION.acceptedOption]: a.option.ref ? [a.option.ref] : [],
    [VERSION.acceptedAt]: a.on,
    [VERSION.editLog]: appendLog(fresh.editLog, logLine(now, who, `accepted ${HOW[a.method]} by ${a.name}: ${a.option.name}${added}, ${a.totals.total.toFixed(2)} with HST`)),
  });
  if (fresh.quote) {
    await updateRecord(T.quotes, fresh.quote.id, { [QUOTE.contractVersion]: [fresh.versionId] }).catch(() => undefined);
    await supersedeOthers(fresh.quote.versionIds, fresh.versionId).catch(() => undefined);
  }
  const handoff = await handOff(fresh.versionId);
  return { ok: true, acceptance: a, handoff };
}

/** Any other version still out with the customer can no longer be accepted: its link says a newer one replaced it. */
async function supersedeOthers(versionIds: string[], keep: string): Promise<void> {
  const others = versionIds.filter((id) => id !== keep);
  if (!others.length) return;
  const versions = await listByIds(T.versions, others, [VERSION.status]);
  const sent = versions.filter((v) => str(v.fields[VERSION.status]) === "Sent");
  if (sent.length) await updateRecords(T.versions, sent.map((v) => ({ id: v.id, fields: { [VERSION.status]: "Superseded" } })));
}

const why = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/**
 * After the yes: GHL to Project Won, then the email and the text. Safe to run again (Retry on the
 * quote page): what is done is not done twice, because the record says what happened last time.
 */
export async function handOff(versionId: string): Promise<Handoff> {
  const t = await targetById(versionId);
  const a = t?.acceptance;
  if (!t || !a || !t.copy) return { at: new Date().toISOString(), ghl: "failed", ghlMessage: "There is no acceptance on this version.", told: [], tellFailed: null };
  const prev = a.handoff;
  const base = customerUrl();
  const links = base && isToken(t.token) ? customerLinks(base, t.token, acceptedPdfName(t.copy)) : null;

  let ghl: Handoff["ghl"] = prev?.ghl === "done" ? "done" : "off";
  let ghlMessage: string | null = null;
  if (ghl !== "done") {
    if (!makeConfigured()) ghlMessage = "The Make step isn't switched on for this deployment.";
    else if (!t.quote?.contactId || !t.quote.opportunityId) {
      ghl = "failed";
      ghlMessage = "This quote isn't linked to a GHL opportunity. Link it, then retry.";
    } else if (!ghlConfigured()) {
      ghl = "failed";
      ghlMessage = "GHL reading isn't set up on this deployment, so the Project Won stage can't be found.";
    } else {
      try {
        const stage = wonStageId(await pipelines());
        if (!stage) throw new Error("GHL's Sales pipeline has no single Project Won stage.");
        await sendToGhl(buildWon({ contactId: t.quote.contactId, opportunityId: t.quote.opportunityId, wonStageId: stage, total: a.totals.total, acceptedLink: staffQuoteLink(t.versionId) ?? links?.link ?? null }));
        ghl = "done";
      } catch (e) {
        ghl = "failed";
        ghlMessage = why(e);
      }
    }
  }

  // The messages go once: a retry sends only what didn't go.
  const told = [...(prev?.told ?? [])];
  const failed: string[] = [];
  const etransfer = etransferEmail();
  const contactId = t.quote?.contactId;
  if (!etransfer || !links || !contactId || !makeConfigured()) {
    if (!told.length) failed.push("The acceptance email and text are off on this deployment.");
  } else {
    const sender: Sender | null = t.sentBy ? { email: t.sentBy, firstName: firstNameOf({ email: t.sentBy, name: null }) } : null;
    const channels = (t.sentTo ?? "Email").split(",").map((x) => x.trim());
    // The version they agreed to, served by their own link (src/app/c/[token]/[file]/route.ts).
    const termsUrl = a.termsId ? `${links.link}/${TERMS_PDF}` : null;
    if (channels.includes("Email") && t.quote?.email && !told.includes("Email")) {
      const attempts = [...new Set([emailFromFor(sender, t.copy.company.email, true), emailFromFor(sender, t.copy.company.email, false), null])];
      let last: unknown = null;
      for (const emailFrom of attempts) {
        try {
          await sendMessage(acceptedEmailMessage(t.copy, a, { contactId, firstName: t.quote.firstName, link: links.link, pdfUrl: links.pdfUrl, termsUrl }, { etransfer, acceptedWhen: acceptedWhen(a.at) }, sender, { emailFrom }));
          told.push("Email");
          last = null;
          break;
        } catch (e) {
          last = e;
        }
      }
      if (last) failed.push(`Email: ${why(last)}`);
    }
    if (channels.includes("Text") && t.quote?.phone && !told.includes("Text")) {
      try {
        await sendMessage(acceptedSmsMessage(t.copy, a, { contactId, firstName: t.quote.firstName, link: links.link }, { etransfer }, sender));
        told.push("Text");
      } catch (e) {
        failed.push(`Text: ${why(e)}`);
      }
    }
  }

  const handoff: Handoff = { at: new Date().toISOString(), ghl, ghlMessage, told, tellFailed: failed.join(" ") || null };
  const line = `handed off: GHL ${ghl === "done" ? "won" : ghl === "off" ? "not updated (Make off)" : `not updated (${ghlMessage})`}; ${told.length ? `told by ${told.join(" and ").toLowerCase()}` : "nothing sent"}${handoff.tellFailed ? `; ${handoff.tellFailed}` : ""}`;
  await updateRecord(T.versions, t.versionId, {
    [VERSION.acceptance]: serializeAcceptance({ ...a, handoff }),
    [VERSION.editLog]: appendLog(t.editLog, logLine(new Date(), "app", line)),
  }).catch(() => undefined);
  return handoff;
}

export type CancelResult = { ok: true; ghl: string } | { ok: false; message: string };

/**
 * Cancel an acceptance (staff, with a reason; Albert, 2026-10-27): the version is Lost and its link
 * says the quote is closed, the quote has no contract, and the GHL opportunity is set to lost. The
 * Notion project, if one was made, is left for a person to archive: the app never writes Notion.
 */
export async function cancelAcceptanceRecord(versionId: string, reason: string, who: string): Promise<CancelResult> {
  const t = await targetById(versionId);
  if (!t?.acceptance || t.status === "Lost") return { ok: false, message: "This version has no acceptance to cancel." };
  if (t.acceptance.cancelled) return { ok: false, message: "This acceptance was already cancelled." };
  const now = new Date();
  await updateRecord(T.versions, t.versionId, {
    [VERSION.status]: "Lost",
    [VERSION.acceptance]: serializeAcceptance({ ...t.acceptance, cancelled: { at: now.toISOString(), by: who, reason } }),
    [VERSION.editLog]: appendLog(t.editLog, logLine(now, who, `acceptance cancelled: ${reason}`)),
  });
  if (t.quote) await updateRecord(T.quotes, t.quote.id, { [QUOTE.contractVersion]: [] }).catch(() => undefined);
  let ghl = "GHL was not changed: the quote isn't linked to an opportunity.";
  if (t.quote?.contactId && t.quote.opportunityId) {
    try {
      if (!makeConfigured()) throw new Error("the Make step isn't switched on");
      await sendToGhl(buildLost({ contactId: t.quote.contactId, opportunityId: t.quote.opportunityId }));
      ghl = "The GHL opportunity is now lost.";
    } catch (e) {
      ghl = `GHL was not changed (${why(e)}). Set the opportunity to lost there.`;
    }
  }
  return { ok: true, ghl };
}
