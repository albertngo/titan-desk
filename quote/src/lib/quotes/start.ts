import "server-only";
import { requireQuoter } from "@/lib/auth";
import { AirtableError, createRecord, listRecords } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { getContact, GhlError, GhlNotConfigured, opportunitiesForContact, pipelines, searchContacts } from "@/lib/ghl/client";
import { displayPhone, quoteNumber, versionLabel } from "@/lib/link/identity";
import { addressStatus } from "@/lib/link/lead";
import { parseNewQuote } from "@/lib/link/newQuote";
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

    let who: { first: string | null; last: string | null; phone: string | null; email: string | null; address: string | null; city: string | null };
    if (req.contactId) {
      const contact = await getContact(req.contactId);
      if (!contact) return { ok: false, message: "That contact isn't in GHL any more. Search again." };
      if (req.opportunityId) {
        const theirs = await opportunitiesForContact(req.contactId);
        if (!theirs.some((o) => o.id === req.opportunityId)) return { ok: false, message: "That opportunity belongs to a different contact. Search again." };
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
    return { ok: true, versionId: await firstVersion(quote.id, quoteNo), reused: false };
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
