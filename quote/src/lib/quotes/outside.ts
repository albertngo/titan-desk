import "server-only";
import { createRecord, getRecord } from "@/lib/airtable/client";
import { LINE, OPTION, T, VERSION } from "@/lib/airtable/fields";
import { manualLine } from "@/lib/editor/model";
import { addedOptionName, offChannelNote, type OffChannel } from "@/lib/followup/offchannel";
import { lineFields, optionFields } from "./savePlan";
import { torontoDay } from "./group";
import { str } from "./values";

/**
 * A firm price given by text or on a call that no option carries (Albert, 2026-11-13: "create a draft in the quote app
 * with the item (as a custom item) in the install section with the price"). The one thing this file does: add ONE option
 * with ONE custom Install line at that price to a version that is still a Draft, re-read here first. Never on a sent
 * version, never an update or a delete, never a send. Reached only from runRecheck() in ./followup.ts.
 */
export async function addOutsideOption(versionId: string, f: Pick<OffChannel, "how" | "at" | "kind" | "amount" | "low" | "high" | "hst" | "quote" | "what">): Promise<string | null> {
  if (f.kind !== "firm" || f.amount === null) return null;
  const v = await getRecord(T.versions, versionId);
  if ((str(v.fields[VERSION.status]) ?? "Draft") !== "Draft") return null;
  const option = await createRecord(T.options, {
    ...optionFields({ id: "new", name: addedOptionName(f, torontoDay), description: offChannelNote(f, torontoDay), recommended: false, showHst: f.hst === "plus" } as Parameters<typeof optionFields>[0], 99),
    [OPTION.version]: [versionId],
  });
  const line = { ...manualLine("Install", f.what), lineType: "Install", uom: "flat", qty: 1, unitPrice: f.amount };
  await createRecord(T.lines, { ...lineFields(line, 1), [LINE.version]: [versionId], [LINE.option]: [option.id] });
  return option.id;
}
