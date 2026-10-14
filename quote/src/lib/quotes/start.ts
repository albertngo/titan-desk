import "server-only";
import { requireQuoter } from "@/lib/auth";
import { AirtableError, createRecord, listRecords, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { getContact, GhlError, GhlNotConfigured, opportunitiesForContact, pipelines, searchContacts } from "@/lib/ghl/client";
import { displayPhone, quoteNumber, versionLabel } from "@/lib/link/identity";
import { addressStatus } from "@/lib/link/lead";
import { buildGhlRequest } from "@/lib/link/ghlRequest";
import { parseNewQuote, type NewQuoteRequest } from "@/lib/link/newQuote";
import { makeConfigured, sendToGhl } from "@/lib/make/client";
import type { CustomerSearch, StartResult } from "./types";
import { ids, num, str } from "./values";

export type { CustomerSearch, StartResult };

/**
 * Starting a quote: find the customer in GHL, then create the quote (Quotes row) and its
 * version 1 (Quote Versions row). Every export checks the caller is a quoter first.
 *
 * GHL is only read here. A new contact or opportunity is created by Make, never by this app;
 * until that step is switched on, a quote started that way is saved as "Needs linking".
 */

type ExistingQuote = { quoteId: string; quoteNumber: string | null; versionId: string | null };

/** Quotes that already have an opportunity, keyed by it. The newest version id is the last link. */
async function quotesByOpportunity(): Promise<Map<string, ExistingQuote>> {
  const rows = await listRecords(T.quotes, {
    fields: [QUOTE.ghlOpportunityId, QUOTE.quoteNumber, QUOTE.versions],
    filterByFormula: `{${QUOTE.ghlOpportunityId}}!=''`,
  });
  const out = new Map<string, ExistingQuote>();
  for (const r of rows) {
    const opp = str(r.fields[QUOTE.ghlOpportunityId]);
    if (opp) out.set(opp, { quoteId: r.id, quoteNumber: str(r.fields[QUOTE.quoteNumber]), versionId: ids(r.fields[QUOTE.versions]).at(-1) ?? null });
  }
  return out;
}

/** What the New quote screen needs to know about this deployment. */
export async function newQuoteSettings() {
  await requireQuoter();
  return { ghlWrites: makeConfigured() };
}

export async function findCustomers(query: string): Promise<CustomerSearch> {
  await requireQuoter();
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { ok: true, customers: [] };
  try {
    const contacts = await searchContacts(q);
    const [opps, pipes, existing] = await Promise.all([
      Promise.all(contacts.map((c) => opportunitiesForContact(c.id))),
      pipelines().catch(() => []),
      quotesByOpportunity(),
    ]);
    const stageName = new Map(pipes.flatMap((p) => p.stages.map((s) => [s.id, s.name] as const)));
    const pipeName = new Map(pipes.map((p) => [p.id, p.name] as const));
    return {
      ok: true,
      customers: contacts.map((contact, i) => ({
        contact,
        opportunities: opps[i]
          .map((o) => ({
            id: o.id,
            name: o.name,
            status: o.status,
            pipeline: o.pipelineId ? (pipeName.get(o.pipelineId) ?? null) : null,
            stage: o.stageId ? (stageName.get(o.stageId) ?? null) : null,
            updatedAt: o.updatedAt,
            existing: existing.has(o.id) ? { quoteNumber: existing.get(o.id)!.quoteNumber, versionId: existing.get(o.id)!.versionId } : null,
          }))
          // Open work first, then most recently touched.
          .sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
      })),
    };
  } catch (e) {
    if (e instanceof GhlNotConfigured) return { ok: false, reason: "not-configured", message: e.message };
    console.error("findCustomers", e);
    return { ok: false, reason: "error", message: "GHL didn't answer. Try again in a moment, or add them as a new customer." };
  }
}


async function firstVersion(quoteId: string, quoteNo: string): Promise<string> {
  const v = await createRecord(T.versions, {
    [VERSION.label]: versionLabel(quoteNo, 1),
    [VERSION.version]: 1,
    [VERSION.status]: "Draft",
    [VERSION.basis]: "Preliminary",
    [VERSION.showHst]: true,
    [VERSION.quote]: [quoteId],
  });
  return v.id;
}

export async function startQuote(raw: unknown): Promise<StartResult> {
  const email = await requireQuoter();
  const parsed = parseNewQuote(raw);
  if (!parsed.ok) return parsed;
  const req = parsed.value;

  try {
    // One opportunity, one quote: an existing quote is opened, never duplicated.
    if (req.opportunityId) {
      const hit = (await quotesByOpportunity()).get(req.opportunityId);
      if (hit) {
        const versionId = hit.versionId ?? (await firstVersion(hit.quoteId, hit.quoteNumber ?? "Q-?"));
        return { ok: true, versionId, reused: true };
      }
    }

    let linkedOpp: { id: string; pipelineId: string | null } | null = null;
    let who: { first: string | null; last: string | null; phone: string | null; email: string | null; address: string | null; city: string | null };
    if (req.contactId) {
      const contact = await getContact(req.contactId);
      if (!contact) return { ok: false, message: "That contact isn't in GHL any more. Search again." };
      if (req.opportunityId) {
        const theirs = (await opportunitiesForContact(req.contactId)).find((o) => o.id === req.opportunityId);
        if (!theirs) return { ok: false, message: "That opportunity belongs to a different contact. Search again." };
        linkedOpp = { id: theirs.id, pipelineId: theirs.pipelineId };
      }
      who = { first: contact.firstName, last: contact.lastName, phone: displayPhone(contact.phone), email: contact.email, address: contact.address, city: contact.city };
    } else {
      const n = req.newCustomer!;
      who = { first: n.firstName, last: n.lastName, phone: n.phone, email: n.email, address: n.address, city: n.city };
    }

    const linked = Boolean(req.contactId && req.opportunityId);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    const note = linked
      ? null
      : `${today}: started in the quote app by ${email}. Needs ${req.contactId ? "a new GHL opportunity" : "a new GHL contact and opportunity"}; link it once it exists.`;

    const quote = await createRecord(T.quotes, {
      [QUOTE.firstName]: who.first,
      [QUOTE.lastName]: who.last,
      [QUOTE.customerName]: [who.first, who.last].filter(Boolean).join(" ") || null,
      [QUOTE.phone]: who.phone,
      [QUOTE.email]: who.email,
      [QUOTE.siteAddress]: who.address,
      [QUOTE.siteCity]: who.city,
      [QUOTE.addressStatus]: addressStatus(who.address, req.addressConfirmed),
      [QUOTE.linkStatus]: linked ? "Linked" : "Needs linking",
      [QUOTE.projectTiming]: req.timing,
      [QUOTE.ghlContactId]: req.contactId,
      [QUOTE.ghlOpportunityId]: req.opportunityId,
      [QUOTE.pipeline]: "Project",
      [QUOTE.notes]: note,
    });
    const quoteNo = str(quote.fields[QUOTE.quoteNumber]) ?? quoteNumber(num(quote.fields[QUOTE.seq]) ?? 0);
    const versionId = await firstVersion(quote.id, quoteNo);
    await pushToGhl(quote.id, quoteNo, str(quote.fields[QUOTE.displayName]) ?? quoteNo, req, who, linkedOpp, today);
    return { ok: true, versionId, reused: false };
  } catch (e) {
    console.error("startQuote", e);
    if (e instanceof AirtableError && (e.status === 401 || e.status === 403)) {
      return { ok: false, message: "Airtable refused the save. The app's Airtable token needs permission to write records (data.records:write)." };
    }
    if (e instanceof GhlNotConfigured) return { ok: false, message: e.message };
    if (e instanceof GhlError) return { ok: false, message: "GHL didn't answer. Try again in a moment." };
    return { ok: false, message: "The quote couldn't be created. Try again; if it keeps failing, tell Albert." };
  }
}

/**
 * Tell GHL about the new quote through Make: create the contact and opportunity if they don't
 * exist, put the quote number on the opportunity, record the timing answer, set the lead stage.
 * Never fails the quote: if Make is off or doesn't confirm, the quote stays as it is (Needs
 * linking when it has no opportunity) and the note says what didn't happen.
 */
async function pushToGhl(
  quoteId: string,
  quoteNo: string,
  name: string,
  req: NewQuoteRequest,
  who: { first: string | null; last: string | null; phone: string | null; email: string | null; address: string | null; city: string | null },
  linkedOpp: { id: string; pipelineId: string | null } | null,
  today: string,
): Promise<void> {
  if (!makeConfigured()) return;
  try {
    const sent = await sendToGhl(
      buildGhlRequest({
        quoteNumber: quoteNo,
        opportunityName: name,
        timing: req.timing,
        contactId: req.contactId,
        opportunity: linkedOpp,
        newContact: req.contactId ? null : { firstName: who.first, lastName: who.last, phone: who.phone, email: who.email, address: who.address, city: who.city },
        site: { address: who.address, city: who.city },
      }),
    );
    if (!linkedOpp) {
      await updateRecord(T.quotes, quoteId, {
        [QUOTE.ghlContactId]: sent.contactId,
        [QUOTE.ghlOpportunityId]: sent.opportunityId,
        [QUOTE.linkStatus]: "Linked",
        [QUOTE.notes]: `${today}: GHL ${req.contactId ? "opportunity" : "contact and opportunity"} created by the quote app.`,
      });
    }
  } catch (e) {
    console.error("pushToGhl", e);
    await updateRecord(T.quotes, quoteId, {
      [QUOTE.notes]: `${today}: the quote app couldn't update GHL (${e instanceof Error ? e.message.slice(0, 160) : "unknown error"}). ${
        linkedOpp ? "Add the quote number to the opportunity by hand." : "Create the opportunity in GHL and link it."
      }`,
    }).catch(() => undefined);
  }
}
