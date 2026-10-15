import "server-only";
import { requireQuoter } from "@/lib/auth";
import { AirtableError, createRecord, createRecords, getRecord, listByIds, updateRecord, updateRecords } from "@/lib/airtable/client";
import { LINE, OPTION, QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { fromQuote, type EditorQuote } from "@/lib/editor/model";
import { versionLabel } from "@/lib/link/identity";
import { getQuote } from "./load";
import { cleanEditorQuote, fingerprint, isRecordId, planIsEmpty, planSave, type SavePlan } from "./savePlan";
import { ids, num, str } from "./values";

/**
 * Saving the editor to Airtable (milestone 3, 2026-10-14). What to write is decided in
 * savePlan.ts (pure, tested); this file only checks who is asking, reads the version as Airtable
 * has it now, and carries the plan out. Nothing is ever deleted: removed lines and options are
 * detached from the version.
 */

export type SaveResult = { ok: true; versionId: string; writes: number } | { ok: false; message: string; conflict?: boolean };

export const BASES = ["Preliminary", "Measured"] as const;
export type Basis = (typeof BASES)[number];

/** Overwrite a Draft version with what the editor holds. Refused if Airtable changed since the editor opened it. */
export async function saveVersion(versionId: string, raw: unknown, base: string): Promise<SaveResult> {
  await requireQuoter();
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
  const plan = planSave(original, edited);
  if (planIsEmpty(plan)) return { ok: true, versionId, writes: 0 };
  return carryOut(versionId, plan);
}

/** Save what the editor holds as the next version of the same quote, leaving the version it came from as it was. */
export async function saveAsNewVersion(versionId: string, raw: unknown, basis: string): Promise<SaveResult> {
  await requireQuoter();
  if (!isRecordId(versionId)) return { ok: false, message: "That isn't a quote version." };
  if (!(BASES as readonly string[]).includes(basis)) return { ok: false, message: "Choose Preliminary or Measured." };
  const from = await getRecord(T.versions, versionId).catch((e) => {
    if (e instanceof AirtableError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  });
  const quoteId = from ? ids(from.fields[VERSION.quote])[0] : undefined;
  if (!from || !quoteId) return { ok: false, message: "This version isn't linked to a quote, so a new version has nowhere to go." };

  const quote = await getRecord(T.quotes, quoteId);
  const siblings = await listByIds(T.versions, ids(quote.fields[QUOTE.versions]), [VERSION.version]);
  const n = Math.max(0, ...siblings.map((v) => num(v.fields[VERSION.version]) ?? 0)) + 1;
  const quoteNo = str(quote.fields[QUOTE.quoteNumber]);

  const plan = planSave(null, cleanEditorQuote(raw));
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
 * Fill a brand-new, still-empty version with what the quick form built (start.ts). Same plan and
 * the same writes as Save as new version; never used on a version that already has lines.
 */
export async function fillVersion(versionId: string, quote: EditorQuote): Promise<SaveResult> {
  await requireQuoter();
  if (!isRecordId(versionId)) return { ok: false, message: "That isn't a quote version." };
  const current = await getRecord(T.versions, versionId);
  if (ids(current.fields[VERSION.options]).length > 0) return { ok: false, message: "This version already has options, so the quick form didn't add to it." };
  return carryOut(versionId, planSave(null, cleanEditorQuote(quote)));
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
