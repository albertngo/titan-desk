import "server-only";
import { parseAcceptance } from "@/lib/accept/plan";
import { listByIds } from "@/lib/airtable/client";
import { QUOTE, T, VERSION } from "@/lib/airtable/fields";
import { contractVersions, contractView, legacyContract, parseContract, type Contract } from "@/lib/contract/model";
import { parseCopy, type CustomerCopy } from "@/lib/send/copy";
import { ids, str } from "./values";

/**
 * Reading the contract (2026-10-30): Quotes → Contract, or, on a quote accepted before that field
 * existed, the same contract worked out from Contract Version (its acceptance, or the change it is).
 * Reads only; the writes are in src/lib/accept/record.ts and src/lib/quotes/send.ts. Callers check
 * who is asking.
 */

export type LoadedContract = { contract: Contract; view: CustomerCopy; copies: Record<string, CustomerCopy> };

/** The quote's contract and its joined copy; null when there is none or a copy it points at can't be read. */
export async function loadContract(quoteRecordId: string): Promise<LoadedContract | null> {
  const q = (await listByIds(T.quotes, [quoteRecordId], [QUOTE.contract, QUOTE.contractVersion]))[0];
  if (!q) return null;
  let contract = parseContract(str(q.fields[QUOTE.contract]));
  const copies: Record<string, CustomerCopy> = {};
  if (!contract) {
    const versionId = ids(q.fields[QUOTE.contractVersion])[0];
    if (!versionId) return null;
    const v = (await listByIds(T.versions, [versionId], [VERSION.customerCopy, VERSION.acceptance]))[0];
    const copy = parseCopy(str(v?.fields[VERSION.customerCopy]));
    contract = legacyContract(versionId, copy, parseAcceptance(str(v?.fields[VERSION.acceptance])));
    if (!contract || !copy) return null;
    copies[versionId] = copy;
  }
  const missing = contractVersions(contract).filter((id) => !copies[id]);
  if (missing.length) {
    for (const v of await listByIds(T.versions, missing, [VERSION.customerCopy])) {
      const copy = parseCopy(str(v.fields[VERSION.customerCopy]));
      if (copy) copies[v.id] = copy;
    }
  }
  const view = contractView(contract, copies);
  return view ? { contract, view, copies } : null;
}
