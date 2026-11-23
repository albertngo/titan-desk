import "server-only";
import { getRecord, updateRecord } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { getContact, ghlConfigured, opportunitiesForContact } from "@/lib/ghl/client";
import { posConfigured, posCustomer } from "@/lib/make/client";
import { buildCustomer, isWonContact, logWords, parseState, serializeState, todo, type PosSystem } from "@/lib/pos/plan";
import { settings } from "@/lib/settings/settings";
import { str } from "./values";

/**
 * POS customers (Albert, 2026-11-23; vault 05_decisions/2026-11-23-quote-pos-customers). Called when a quote is
 * accepted (src/lib/accept/record.ts) and when a quote is started for a contact who is already won
 * (src/lib/quotes/start.ts, `onlyIfWon`). Writes only the quote's POS Customers cell and Notes. Never throws: a
 * failure is noted on the quote and the next trigger tries again for the system that failed.
 */
export async function syncPosCustomers(quoteId: string, opts: { onlyIfWon?: boolean } = {}): Promise<void> {
  try {
    if (!posConfigured()) return;
    const s = await settings();
    const on: Record<PosSystem, boolean> = { lightspeed: s.lightspeedCustomers, hike: s.hikeCustomers };
    const q = await getRecord(T.quotes, quoteId);
    const f = q.fields;
    const contactId = str(f[QUOTE.ghlContactId]);
    if (!contactId) return;
    const state = parseState(f[QUOTE.posCustomers]);
    const systems = todo(state, on);
    if (!systems.length) return;
    if (opts.onlyIfWon) {
      if (!ghlConfigured()) return;
      if (!isWonContact(await opportunitiesForContact(contactId))) return;
    }
    const contact = ghlConfigured() ? await getContact(contactId).catch(() => null) : null;
    const customer = buildCustomer({
      firstName: contact?.firstName ?? str(f[QUOTE.firstName]),
      lastName: contact?.lastName ?? str(f[QUOTE.lastName]),
      email: contact?.email ?? str(f[QUOTE.email]),
      phone: contact?.phone ?? str(f[QUOTE.phone]),
      address: contact?.address ?? str(f[QUOTE.siteAddress]),
      city: contact?.city ?? str(f[QUOTE.siteCity]),
      postalCode: contact?.postalCode ?? null,
      contactId,
      quoteNumber: str(f[QUOTE.quoteNumber]),
    });
    const results: Parameters<typeof logWords>[0] = [];
    if (!customer) {
      for (const system of systems) results.push({ system, ok: false, message: "no name, or no email or phone" });
    } else {
      // One at a time: Lightspeed first, then Hike. One failing never stops the other.
      for (const system of systems) {
        try {
          const r = await posCustomer(system, customer);
          state[system] = { id: r.id, how: r.how, at: new Date().toISOString() };
          results.push({ system, ok: true, how: r.how });
        } catch (e) {
          results.push({ system, ok: false, message: e instanceof Error ? e.message.slice(0, 120) : "error" });
        }
      }
    }
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    const notes = str(f[QUOTE.notes]);
    await updateRecord(T.quotes, quoteId, {
      [QUOTE.posCustomers]: serializeState(state),
      [QUOTE.notes]: [notes, `${today}: ${logWords(results)}.`].filter(Boolean).join("\n"),
    });
  } catch (e) {
    console.error("syncPosCustomers", e);
  }
}
