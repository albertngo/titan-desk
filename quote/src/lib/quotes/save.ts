import "server-only";
import { requireQuoterPerson } from "@/lib/auth";
import { AirtableError, createRecord, createRecords, getRecord, listByIds, updateRecord, updateRecords } from "@/lib/airtable/client";
import { LINE, OPTION, QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { fromQuote, type EditorQuote } from "@/lib/editor/model";
import { versionLabel } from "@/lib/link/identity";
import { fixedSchedule, scheduleProblems } from "@/lib/pricing/schedule";
import { parseCopy, stagesOf } from "@/lib/send/copy";
import { parseAcceptance } from "@/lib/accept/plan";
import { authorFields, describePlan } from "./history";
import { getQuote } from "./load";
import { changeSlot, cleanEditorQuote, fingerprint, isRecordId, newVersionRefusal, planIsEmpty, planSave, type SavePlan } from "./savePlan";
import { ids, num, str } from "./values";

/**
 * Saving the editor to Airtable (milestone 3, 2026-10-14). What to write is decided in
 * savePlan.ts (pure, tested); this file only checks who is asking, reads the version as Airtable
 * has it now, and carries the plan out. Nothing is ever deleted: removed lines and options are
 * detached from the version.
 */

export type SaveResult = { ok: true; versionId: string; writes: number } | { ok: false; message: string; conflict?: boolean };

export const BASES = ["Preliminary", "Measured"] as const;

/** A payment schedule that can't be saved (2026-10-27), said to staff; null when it is fine or the default. */
function scheduleTrouble(q: EditorQuote): string | null {
  const bad = q.schedule ? scheduleProblems(q.schedule) : [];
  return bad.length ? `Nothing was saved: ${bad.join(" ")}` : null;
}
export type Basis = (typeof BASES)[number];

/** Overwrite a Draft version with what the editor holds. Refused if Airtable changed since the editor opened it. */
export async function saveVersion(versionId: string, raw: unknown, base: string): Promise<SaveResult> {
  const person = await requireQuoterPerson();
  if (!isRecordId(versionId)) return { ok: false, message: "That isn't a quote version." };
  const current = await getQuote(versionId);
  if (!current) return { ok: false, message: "This version isn't in Airtable any more." };
  if (current.status !== "Draft") {
    return { ok: false, message: `This version is ${current.status ?? "not a draft"}, so it can't be changed. Save your changes as a new version instead.` };
  }
  const original = fromQuote(current);
  if (fingerprint(original) !== base) {
    return {
      ok: false,
      conflict: true,
      message: "This version changed in Airtable since you opened it, so saving would overwrite that. Your changes are still on this device: save them as a new version, or discard them and start from what's in Airtable.",
    };
  }
  const edited = cleanEditorQuote(raw);
  const bad = scheduleTrouble(edited);
  if (bad) return { ok: false, message: bad };
  const plan = planSave(original, edited);
  if (planIsEmpty(plan)) return { ok: true, versionId, writes: 0 };
  // Who saved, when, and what: in the same update as the version's own fields (2026-10-22).
  plan.version = { ...plan.version, ...authorFields(person, new Date(), `saved: ${describePlan(plan)}`, current.editLog) };
  return carryOut(versionId, plan);
}

/** Save what the editor holds as the next version of the same quote, leaving the version it came from as it was. */
export async function saveAsNewVersion(versionId: string, raw: unknown, basis: string): Promise<SaveResult> {
  const person = await requireQuoterPerson();
  if (!isRecordId(versionId)) return { ok: false, message: "That isn't a quote version." };
  if (!(BASES as readonly string[]).includes(basis)) return { ok: false, message: "Choose Preliminary or Measured." };
  const from = await getRecord(T.versions, versionId).catch((e) => {
    if (e instanceof AirtableError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  });
  const quoteId = from ? ids(from.fields[VERSION.quote])[0] : undefined;
  if (!from || !quoteId) return { ok: false, message: "This version isn't linked to a quote, so a new version has nowhere to go." };

  const acceptance = parseAcceptance(str(from.fields[VERSION.acceptance]));
  const refused = newVersionRefusal({ changeNo: num(from.fields[VERSION.changeNo]), agreed: Boolean(acceptance && !acceptance.cancelled) });
  if (refused) return { ok: false, message: refused };

  const quote = await getRecord(T.quotes, quoteId);
  const siblings = await listByIds(T.versions, ids(quote.fields[QUOTE.versions]), [VERSION.version]);
  const n = Math.max(0, ...siblings.map((v) => num(v.fields[VERSION.version]) ?? 0)) + 1;
  const quoteNo = str(quote.fields[QUOTE.quoteNumber]);

  const edited = cleanEditorQuote(raw);
  const bad = scheduleTrouble(edited);
  if (bad) return { ok: false, message: bad };
  const plan = planSave(null, edited);
  let created: string;
  try {
    const v = await createRecord(T.versions, {
      ...plan.version,
      [VERSION.label]: quoteNo ? versionLabel(quoteNo, n) : `v${n}`,
      [VERSION.version]: n,
      [VERSION.status]: "Draft",
      [VERSION.basis]: basis,
      [VERSION.quote]: [quoteId],
      [VERSION.supersedes]: [versionId],
      ...authorFields(person, new Date(), `created v${n} from v${num(from.fields[VERSION.version]) ?? "?"} (${basis.toLowerCase()}): ${describePlan(plan)}`, null, true),
    });
    created = v.id;
  } catch (e) {
    return { ok: false, message: `Nothing was saved: Airtable refused the new version (${message(e)}).` };
  }
  const r = await carryOut(created, { ...plan, version: {} });
  if (!r.ok) return r;
  // A draft that has been replaced is no longer the one to work on; a sent one stays as sent.
  if (str(from.fields[VERSION.status]) === "Draft") await updateRecord(T.versions, versionId, { [VERSION.status]: "Superseded" });
  return { ok: true, versionId: created, writes: r.writes + 1 };
}

/**
 * Make a change after acceptance (Albert, 2026-10-27). The accepted version stays frozen; the change
 * is a new version of the same quote, numbered (Change No 1, 2, …), that starts as the contract
 * stands: only the accepted option, its ticked add-ons now part of the work and the others gone, and
 * a schedule where every stage already agreed keeps its dollars and the balance takes the difference.
 * Staff then edit it like any version and send it for the customer's records.
 */
export async function makeChange(versionId: string): Promise<SaveResult> {
  const person = await requireQuoterPerson();
  if (!isRecordId(versionId)) return { ok: false, message: "That isn't a quote version." };
  const from = await getQuote(versionId);
  if (!from?.link) return { ok: false, message: "This version isn't linked to a quote." };
  if (from.link.contractVersionId !== from.id) return { ok: false, message: "Only the version that is the contract now can be changed. Open the newest one." };
  const accepted = from.acceptance && !from.acceptance.cancelled ? from.acceptance : null;
  if (!accepted && !from.changeNo) return { ok: false, message: "This version hasn't been accepted, so there is nothing to change yet." };

  // The option the contract stands on, and its stages as agreed.
  const option = accepted ? from.options.find((o) => o.id === accepted.option.ref) : from.options.length === 1 ? from.options[0] : undefined;
  if (!option) return { ok: false, message: "The accepted option isn't on this version any more, so a change can't start from it." };
  let stages = accepted?.stages;
  if (!stages) {
    const frozen = parseCopy(str((await listByIds(T.versions, [from.id], [VERSION.customerCopy]))[0]?.fields[VERSION.customerCopy]));
    stages = frozen?.options[0] ? stagesOf(frozen.options[0]) : undefined;
  }
  if (!stages?.length) return { ok: false, message: "This version has no payment schedule to carry over." };

  // Ticked add-ons are part of the work now; the ones the customer didn't take are gone.
  const took = new Set((accepted?.addOns ?? []).map((a) => a.description.replace(/\s+/g, " ").trim().toLowerCase()));
  const lines = option.lines.flatMap((l) => (l.include ? [l] : took.has((l.description ?? "").replace(/\s+/g, " ").trim().toLowerCase()) ? [{ ...l, include: true }] : []));
  const edited = cleanEditorQuote({ ...fromQuote({ ...from, options: [{ ...option, lines }] }), schedule: fixedSchedule(stages) });

  const quote = await getRecord(T.quotes, from.link.quoteRecordId);
  const siblings = await listByIds(T.versions, ids(quote.fields[QUOTE.versions]), [VERSION.version, VERSION.changeNo, VERSION.status, VERSION.sentAt]);
  // A change already open is reopened, not duplicated; only changes that were sent take a number.
  const slot = changeSlot(siblings.map((v) => ({ id: v.id, status: str(v.fields[VERSION.status]), changeNo: num(v.fields[VERSION.changeNo]), sentAt: str(v.fields[VERSION.sentAt]) })));
  if (slot.open) return { ok: true, versionId: slot.open, writes: 0 };
  const n = Math.max(0, ...siblings.map((v) => num(v.fields[VERSION.version]) ?? 0)) + 1;
  const change = slot.next;
  const quoteNo = str(quote.fields[QUOTE.quoteNumber]);
  const plan = planSave(null, edited);
  let created: string;
  try {
    const v = await createRecord(T.versions, {
      ...plan.version,
      [VERSION.label]: quoteNo ? versionLabel(quoteNo, n) : `v${n}`,
      [VERSION.version]: n,
      [VERSION.status]: "Draft",
      [VERSION.basis]: "Measured",
      [VERSION.quote]: [from.link.quoteRecordId],
      [VERSION.supersedes]: [from.id],
      [VERSION.changeNo]: change,
      ...authorFields(person, new Date(), `created v${n} as change ${change} to v${from.version ?? "?"}: ${describePlan(plan)}`, null, true),
    });
    created = v.id;
  } catch (e) {
    return { ok: false, message: `Nothing was saved: Airtable refused the change (${message(e)}).` };
  }
  const r = await carryOut(created, { ...plan, version: {} });
  return r.ok ? { ok: true, versionId: created, writes: r.writes + 1 } : r;
}

/**
 * Fill a brand-new, still-empty version with what the quick form built (start.ts). Same plan and
 * the same writes as Save as new version; never used on a version that already has lines.
 */
export async function fillVersion(versionId: string, quote: EditorQuote): Promise<SaveResult> {
  const person = await requireQuoterPerson();
  if (!isRecordId(versionId)) return { ok: false, message: "That isn't a quote version." };
  const current = await getRecord(T.versions, versionId);
  if (ids(current.fields[VERSION.options]).length > 0) return { ok: false, message: "This version already has options, so the quick form didn't add to it." };
  const plan = planSave(null, cleanEditorQuote(quote));
  plan.version = { ...plan.version, ...authorFields(person, new Date(), `priced from the quick form: ${describePlan(plan)}`, str(current.fields[VERSION.editLog])) };
  return carryOut(versionId, plan);
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);

/**
 * Writes the plan in an order where every step only needs ids that already exist: the version's
 * terms, then options (so new lines have an option to point at), then lines, then detaching.
 */
async function carryOut(versionId: string, plan: SavePlan): Promise<SaveResult> {
  let writes = 0;
  const count = (n: number) => {
    writes += n;
  };
  try {
    if (Object.keys(plan.version).length > 0) {
      await updateRecord(T.versions, versionId, plan.version);
      count(1);
    }

    const made = await createRecords(T.options, plan.createOptions.map((o) => ({ ...o.fields, [OPTION.version]: [versionId] })), count);
    const optionId = new Map(plan.createOptions.map((o, i) => [o.ref, made[i].id]));
    const resolve = (ref: string) => optionId.get(ref) ?? ref;

    await updateRecords(T.options, plan.updateOptions, count);
    await createRecords(
      T.lines,
      plan.createLines.map((l) => ({ ...l.fields, [LINE.version]: [versionId], [LINE.option]: [resolve(l.option)] })),
      count,
    );
    await updateRecords(
      T.lines,
      plan.updateLines.map((l) => ({ id: l.id, fields: { ...l.fields, [LINE.option]: [resolve(l.option)] } })),
      count,
    );
    await updateRecords(T.lines, plan.detachLines.map((id) => ({ id, fields: { [LINE.version]: [], [LINE.option]: [] } })), count);
    await updateRecords(T.options, plan.detachOptions.map((id) => ({ id, fields: { [OPTION.version]: [] } })), count);
  } catch (e) {
    return {
      ok: false,
      message:
        writes === 0
          ? `Nothing was saved: Airtable refused it (${message(e)}). Your changes are still on this device; try again.`
          : `Only part of this saved before Airtable refused it (${message(e)}). Your changes are still on this device: open the quote to see what's in Airtable, then save them as a new version.`,
    };
  }
  return { ok: true, versionId, writes };
}
