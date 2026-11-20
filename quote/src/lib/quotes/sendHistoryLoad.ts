import "server-only";
import { listByIds } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { requireQuoter } from "@/lib/auth";
import { parseCopy } from "@/lib/send/copy";
import { sendHistory, type SendHistory } from "./sendHistory";
import { ids, num, str } from "./values";

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

/**
 * Show history on All quotes (Albert, 2026-11-20): one quote's versions, read when the button is pressed so the list
 * itself stays as light as it was. Read only; checks the quoter allowlist first. The shaping is `sendHistory()`.
 */
export async function loadSendHistory(quoteRecordId: string): Promise<{ ok: true; history: SendHistory } | { ok: false; message: string }> {
  await requireQuoter();
  if (!RECORD_ID.test(quoteRecordId)) return { ok: false, message: "That quote couldn't be found." };
  const quote = await listByIds(T.quotes, [quoteRecordId], [QUOTE.versions]);
  const versionIds = ids(quote[0]?.fields[QUOTE.versions]);
  if (!quote.length) return { ok: false, message: "That quote couldn't be found." };
  const rows = versionIds.length
    ? await listByIds(T.versions, versionIds, [VERSION.label, VERSION.version, VERSION.status, VERSION.changeNo, VERSION.sentAt, VERSION.sentBy, VERSION.sentTo, VERSION.customerCopy, VERSION.editLog, VERSION.lastEditedBy, VERSION.lastEditedAt])
    : [];
  return {
    ok: true,
    history: sendHistory(
      rows.map((r) => ({
        id: r.id,
        label: str(r.fields[VERSION.label]),
        version: num(r.fields[VERSION.version]),
        status: str(r.fields[VERSION.status]),
        changeNo: num(r.fields[VERSION.changeNo]),
        sentAt: str(r.fields[VERSION.sentAt]),
        sentBy: str(r.fields[VERSION.sentBy]),
        sentTo: str(r.fields[VERSION.sentTo]),
        copy: parseCopy(str(r.fields[VERSION.customerCopy])),
        editLog: str(r.fields[VERSION.editLog]),
        lastEditedBy: str(r.fields[VERSION.lastEditedBy]),
        lastEditedAt: str(r.fields[VERSION.lastEditedAt]),
        createdTime: r.createdTime,
      })),
    ),
  };
}
