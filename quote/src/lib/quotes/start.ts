import "server-only";
import { requireQuoter } from "@/lib/auth";
import { AirtableError, createRecord, getRecord, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { getContact, ghlConfigured, GhlError, GhlNotConfigured, opportunitiesForContact, pipelines, searchContacts, type GhlContact } from "@/lib/ghl/client";
import { displayPhone, normalizePhone, quoteNumber, sameCustomer } from "@/lib/link/identity";
import { addressStatus } from "@/lib/link/lead";
import { buildGhlRequest } from "@/lib/link/ghlRequest";
import { parseNewQuote, type NewQuoteRequest } from "@/lib/link/newQuote";
import { makeConfigured, sendToGhl } from "@/lib/make/client";
import type { CustomerSearch, FoundCustomer, StartResult } from "./types";
import { buildPreliminary, parseWork, workIsEmpty, type QuickWork } from "@/lib/quick/plan";
import { profileOf, stairDescription } from "@/lib/quick/stairs";
import { getQuickForm, getStairProfiles, quickProducts } from "./load";
import { firstVersion, quotesByOpportunity } from "./records";
import { fillVersion } from "./save";
import { num, str } from "./values";

export type { CustomerSearch, StartResult };

/**
 * Starting a quote: find the customer in GHL, then create the quote (Quotes row) and its
 * version 1 (Quote Versions row). Every export checks the caller is a quoter first.
 *
 * GHL is only read here. A new contact or opportunity is created by Make, never by this app;
 * until that step is switched on, a quote started that way is saved as "Needs linking".
 */

/** What the New quote screen needs to know about this deployment. */
export async function newQuoteSettings() {
  await requireQuoter();
  return { ghlWrites: makeConfigured() };
}

/** Each contact with their opportunities, labelled, and any quote already made for each. */
async function withOpportunities(contacts: GhlContact[]): Promise<FoundCustomer[]> {
  const [opps, pipes, existing] = await Promise.all([
    Promise.all(contacts.map((c) => opportunitiesForContact(c.id))),
    pipelines().catch(() => []),
    quotesByOpportunity(),
  ]);
  const stageName = new Map(pipes.flatMap((p) => p.stages.map((s) => [s.id, s.name] as const)));
  const pipeName = new Map(pipes.map((p) => [p.id, p.name] as const));
  return contacts.map((contact, i) => ({
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
  }));
}

export async function findCustomers(query: string): Promise<CustomerSearch> {
  await requireQuoter();
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { ok: true, customers: [] };
  try {
    return { ok: true, customers: await withOpportunities(await searchContacts(q)) };
  } catch (e) {
    if (e instanceof GhlNotConfigured) return { ok: false, reason: "not-configured", message: e.message };
    console.error("findCustomers", e);
    return { ok: false, reason: "error", message: "GHL didn't answer. Try again in a moment, or add them as a new customer." };
  }
}

/** GHL contacts with the same phone or email as a customer about to be added as new. */
async function alreadyInGhl(typed: { phone: string | null; email: string | null }): Promise<GhlContact[]> {
  const queries = [typed.email, normalizePhone(typed.phone)?.slice(-10)].filter((q): q is string => Boolean(q));
  const found = (await Promise.all(queries.map((q) => searchContacts(q, 10)))).flat();
  const unique = new Map(found.filter((c) => sameCustomer(c, typed)).map((c) => [c.id, c]));
  return [...unique.values()];
}


export async function startQuote(raw: unknown): Promise<StartResult> {
  const email = await requireQuoter();
  const parsed = parseNewQuote(raw);
  if (!parsed.ok) return parsed;
  const req = parsed.value;
  // The quick form's work, if any: which choices and how much, never a price (src/lib/quick/plan.ts).
  const work = parseWork((raw as { work?: unknown } | null)?.work);

  try {
    // One opportunity, one quote: an existing quote is opened, never duplicated.
    if (req.opportunityId) {
      const hit = (await quotesByOpportunity()).get(req.opportunityId);
      if (hit) {
        const versionId = hit.versionId ?? (await firstVersion(hit.quoteId, hit.quoteNumber ?? "Q-?"));
        return { ok: true, versionId, reused: true, filled: false };
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
      // "New" customers are checked against GHL first, so nobody is added twice by accident.
      if (!req.forceNew && ghlConfigured()) {
        const matches = await alreadyInGhl({ phone: n.phone, email: n.email });
        if (matches.length > 0) {
          return {
            ok: false,
            message: `${matches.length === 1 ? "This customer is" : "These customers are"} already in GHL with that ${
              matches.some((m) => sameCustomer(m, { phone: n.phone, email: null })) ? "phone number" : "email"
            }. Pick them below, or confirm it's a different person.`,
            duplicates: await withOpportunities(matches),
          };
        }
      }
      who = { first: n.firstName, last: n.lastName, phone: n.phone, email: n.email, address: n.address, city: n.city };
    }

    const linked = Boolean(req.contactId && req.opportunityId);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    const note = [
      linked ? null : `${today}: started in the quote app by ${email}. Needs ${req.contactId ? "a new GHL opportunity" : "a new GHL contact and opportunity"}; link it once it exists.`,
      work.building ? `Building: ${work.building}.` : null,
      work.description ? `Description of project (internal): ${work.description}` : null,
    ]
      .filter(Boolean)
      .join("\n") || null;

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
    const versionId = await firstVersion(quote.id, quoteNo, req.basis);
    await pushToGhl(quote.id, quoteNo, str(quote.fields[QUOTE.displayName]) ?? quoteNo, req, who, linkedOpp, today);
    // Only a preliminary takes the quick form's work; a full quote opens empty in the editor.
    const filled = req.basis === "Preliminary" && !workIsEmpty(work) ? await fillFromQuickForm(quote.id, versionId, work, today) : false;
    return { ok: true, versionId, reused: false, filled };
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
 * Price the quick form's rows from Airtable and write them into version 1 as one option, with the
 * staircases' customer-facing description on it (2026-10-18). Never fails the quote: whatever
 * couldn't be priced, or a failed save, is noted on the quote and the editor opens instead.
 */
async function fillFromQuickForm(quoteId: string, versionId: string, work: QuickWork, today: string): Promise<boolean> {
  try {
    const [choices, products, profileRows] = await Promise.all([getQuickForm(), quickProducts(work.rows.flatMap((r) => (r.productId ? [r.productId] : []))), getStairProfiles()]);
    const profiles = new Map(profileRows.map((p) => [p.id, p]));
    const { lines, skipped } = buildPreliminary(choices, work, products, profiles);
    const problems = [...skipped];
    let filled = false;
    if (lines.length > 0) {
      const r = await fillVersion(versionId, {
        quoteRecordId: quoteId,
        customerName: "",
        siteAddress: "",
        siteCity: "",
        ghlContactId: null,
        addressStatus: null,
        discountRate: 0,
        showHst: true,
        options: [
          {
            id: "opt_quick_1",
            name: "Preliminary",
            description: stairDescription(work.stairs.flatMap((s) => { const p = profiles.get(s.profileId); return p ? [profileOf(p)] : []; })),
            recommended: true,
            lines,
          },
        ],
      });
      if (r.ok) filled = true;
      else problems.push(`the lines weren't saved (${r.message})`);
    }
    if (problems.length > 0) await noteOnQuote(quoteId, `${today}: from the quick form, left out: ${problems.join("; ")}.`);
    return filled;
  } catch (e) {
    console.error("fillFromQuickForm", e);
    await noteOnQuote(quoteId, `${today}: the quick form's lines couldn't be added (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Add them in the editor.`).catch(() => undefined);
    return false;
  }
}

async function noteOnQuote(quoteId: string, line: string) {
  const current = await getRecord(T.quotes, quoteId);
  await updateRecord(T.quotes, quoteId, { [QUOTE.notes]: [str(current.fields[QUOTE.notes]), line].filter(Boolean).join("\n") });
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
        // Only a confirmed site goes on the opportunity; GHL's own workflow fills a blank one from
        // the contact, and booking confirms it (2026-10-15).
        site: req.addressConfirmed ? { address: who.address, city: who.city } : { address: null, city: null },
      }),
    );
    if (!linkedOpp) {
      await updateRecord(T.quotes, quoteId, {
        [QUOTE.ghlContactId]: sent.contactId,
        [QUOTE.ghlOpportunityId]: sent.opportunityId,
        [QUOTE.linkStatus]: "Linked",
      });
      // Appended, never written whole: the building and project description are already on the notes.
      await noteOnQuote(quoteId, `${today}: GHL ${req.contactId ? "opportunity" : "contact and opportunity"} created by the quote app.`);
    }
  } catch (e) {
    console.error("pushToGhl", e);
    await noteOnQuote(
      quoteId,
      `${today}: the quote app couldn't update GHL (${e instanceof Error ? e.message.slice(0, 160) : "unknown error"}). ${
        linkedOpp ? "Add the quote number to the opportunity by hand." : "Create the opportunity in GHL and link it."
      }`,
    ).catch(() => undefined);
  }
}
