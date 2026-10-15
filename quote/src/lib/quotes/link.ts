import "server-only";
import { AirtableError, getRecord, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { requireQuoter } from "@/lib/auth";
import { ghlConfigured, opportunitiesForContact, pipelines } from "@/lib/ghl/client";
import { buildLinkJob } from "@/lib/link/ghlRequest";
import { confirmAddressCheck, linkChoices } from "@/lib/link/linkJob";
import { makeConfigured, sendToGhl } from "@/lib/make/client";
import { quotesByOpportunity } from "./records";
import type { ConfirmAddressResult, JobChoices, LinkJobResult } from "./types";
import { str } from "./values";

/**
 * Linking a quote that says Needs linking to one of the customer's jobs in GHL (2026-10-15).
 * Which jobs may be picked is decided in link/linkJob.ts (pure, tested). The GHL change goes
 * through Make like every other; the quote is marked Linked only once Make confirms it.
 */

const REC_ID = /^rec[A-Za-z0-9]{14}$/;
const GHL_ID = /^[A-Za-z0-9]{6,40}$/;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const appendNote = (old: unknown, line: string) => [str(old), `${today()}: ${line}`].filter(Boolean).join("\n");

async function quoteRecord(id: string) {
  if (!REC_ID.test(id)) return null;
  return getRecord(T.quotes, id).catch((e) => {
    if (e instanceof AirtableError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  });
}

/** Opportunities numbered by the OTHER quote already on each. */
async function takenBy(quoteRecordId: string): Promise<Map<string, string | null>> {
  const byOpp = await quotesByOpportunity();
  return new Map([...byOpp].filter(([, q]) => q.quoteId !== quoteRecordId).map(([opp, q]) => [opp, q.quoteNumber]));
}

/** The jobs this quote can be linked to, labelled for the quote page. */
export async function jobChoices(quoteRecordId: string): Promise<JobChoices> {
  await requireQuoter();
  const quote = await quoteRecord(quoteRecordId);
  if (!quote) return { ok: false, message: "This quote isn't in Airtable any more." };
  const contactId = str(quote.fields[QUOTE.ghlContactId]);
  if (!contactId) return { ok: false, message: "This quote has no GHL contact yet, so there are no opportunities to pick from." };
  if (!ghlConfigured()) return { ok: false, message: "GHL reading isn't set up on this deployment." };
  try {
    const [opps, pipes, taken] = await Promise.all([opportunitiesForContact(contactId), pipelines().catch(() => []), takenBy(quote.id)]);
    const stageName = new Map(pipes.flatMap((p) => p.stages.map((s) => [s.id, s.name] as const)));
    const pipeName = new Map(pipes.map((p) => [p.id, p.name] as const));
    return {
      ok: true,
      canLink: makeConfigured(),
      choices: linkChoices(opps, taken, new Date()).map((o) => ({
        id: o.id,
        name: o.name,
        status: o.status,
        pipeline: o.pipelineId ? (pipeName.get(o.pipelineId) ?? null) : null,
        stage: o.stageId ? (stageName.get(o.stageId) ?? null) : null,
        statusChangedAt: o.statusChangedAt,
        siteAddress: o.siteAddress,
        hasCompanyCam: Boolean(o.companyCamUrl),
        reopen: o.reopen,
        takenBy: o.takenBy,
      })),
    };
  } catch (e) {
    console.error("jobChoices", e);
    return { ok: false, message: "GHL didn't answer, so the opportunities can't be listed. Reload the page to try again." };
  }
}

/** Link the quote to the job staff picked: GHL first (through Make), then the quote. */
export async function linkToJob(quoteRecordId: string, opportunityId: string): Promise<LinkJobResult> {
  const email = await requireQuoter();
  if (!GHL_ID.test(opportunityId)) return { ok: false, message: "Pick an opportunity first." };
  const quote = await quoteRecord(quoteRecordId);
  if (!quote) return { ok: false, message: "This quote isn't in Airtable any more." };
  if (str(quote.fields[QUOTE.ghlOpportunityId])) return { ok: false, message: "This quote is already linked to an opportunity. Reload the page." };
  const contactId = str(quote.fields[QUOTE.ghlContactId]);
  if (!contactId) return { ok: false, message: "This quote has no GHL contact, so it can't be linked from here." };
  if (!ghlConfigured() || !makeConfigured()) return { ok: false, message: "Linking isn't switched on for this deployment." };

  const [opps, taken] = await Promise.all([opportunitiesForContact(contactId), takenBy(quote.id)]);
  const job = linkChoices(opps, taken, new Date()).find((o) => o.id === opportunityId);
  if (!job) return { ok: false, message: "That opportunity isn't one of this customer's open or recently closed project opportunities any more. Reload the page." };
  if (job.takenBy) return { ok: false, message: `That opportunity is already quoted as ${job.takenBy}. One opportunity, one quote.` };

  const quoteNo = str(quote.fields[QUOTE.quoteNumber]);
  if (!quoteNo) return { ok: false, message: "This quote has no quote number yet." };
  const confirmed = str(quote.fields[QUOTE.addressStatus]) === "Confirmed";
  const site = confirmed ? { address: str(quote.fields[QUOTE.siteAddress]), city: str(quote.fields[QUOTE.siteCity]) } : null;
  const ourCam = str(quote.fields[QUOTE.companyCamUrl]);
  // A job that already has its own CompanyCam project keeps it; the quote's is noted, not written over it.
  const camClash = Boolean(ourCam && job.companyCamUrl && ourCam !== job.companyCamUrl);

  try {
    await sendToGhl(buildLinkJob({ contactId, opportunityId: job.id, reopen: job.reopen, quoteNumber: quoteNo, site, companyCamUrl: job.companyCamUrl ? null : ourCam }));
  } catch (e) {
    return { ok: false, message: `GHL wasn't updated (${e instanceof Error ? e.message.slice(0, 120) : "error"}), so nothing was linked. Try again.` };
  }

  const note = [
    `linked by ${email} to "${job.name ?? job.id}" (${job.id}).`,
    job.reopen ? `That opportunity was ${job.status}; it is open again.` : null,
    camClash ? `That opportunity already had its own CompanyCam project (${job.companyCamUrl}); this quote's (${ourCam}) was left off it.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  try {
    await updateRecord(T.quotes, quote.id, {
      [QUOTE.ghlOpportunityId]: job.id,
      [QUOTE.linkStatus]: "Linked",
      [QUOTE.notes]: appendNote(quote.fields[QUOTE.notes], note),
    });
  } catch (e) {
    return { ok: false, message: `GHL was updated, but the quote couldn't be marked Linked (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Set its GHL Opportunity ID to ${job.id} in Airtable.` };
  }
  return { ok: true };
}

/**
 * Confirm the quote's address by hand (Albert, 2026-10-15), for a site checked with the customer
 * without a booking. A linked quote sends it to its opportunity through Make first and is confirmed
 * only once Make has; an unlinked one is confirmed now and its opportunity gets it when linked.
 */
export async function confirmAddress(quoteRecordId: string, shown: string): Promise<ConfirmAddressResult> {
  const email = await requireQuoter();
  const quote = await quoteRecord(quoteRecordId);
  if (!quote) return { ok: false, message: "This quote isn't in Airtable any more." };
  const address = str(quote.fields[QUOTE.siteAddress]);
  const check = confirmAddressCheck(
    { siteAddress: address, addressStatus: str(quote.fields[QUOTE.addressStatus]), projectNumber: str(quote.fields[QUOTE.projectNumber]) },
    String(shown ?? "").slice(0, 300),
  );
  if (!check.ok) return check;

  const city = str(quote.fields[QUOTE.siteCity]);
  const opportunityId = str(quote.fields[QUOTE.ghlOpportunityId]);
  const contactId = str(quote.fields[QUOTE.ghlContactId]);
  const quoteNo = str(quote.fields[QUOTE.quoteNumber]);
  let sent = false;
  if (opportunityId && contactId && quoteNo) {
    if (!makeConfigured()) return { ok: false, message: "Sending to GHL isn't switched on for this deployment, so the address wasn't confirmed." };
    try {
      await sendToGhl(buildLinkJob({ contactId, opportunityId, reopen: false, quoteNumber: quoteNo, site: { address, city }, companyCamUrl: null }));
      sent = true;
    } catch (e) {
      return { ok: false, message: `GHL wasn't updated (${e instanceof Error ? e.message.slice(0, 120) : "error"}), so the address wasn't confirmed. Try again.` };
    }
  }
  const where = [address, city].filter(Boolean).join(", ");
  try {
    await updateRecord(T.quotes, quote.id, {
      [QUOTE.addressStatus]: "Confirmed",
      [QUOTE.notes]: appendNote(quote.fields[QUOTE.notes], `address confirmed by ${email}: ${where}.${sent ? " Sent to the GHL opportunity." : " Not linked yet: the opportunity gets it when linked."}`),
    });
  } catch (e) {
    return {
      ok: false,
      message: `${sent ? "GHL has the address, but the" : "The"} quote couldn't be marked Confirmed (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Try again.`,
    };
  }
  return { ok: true };
}
