import "server-only";
import { newestTerms } from "@/lib/accept/live";
import { isAirtableFile } from "@/lib/accept/terms";
import { listRecords } from "@/lib/airtable/client";
import { COMPANY_FILES, COMPANY_FILES_TABLE } from "@/lib/airtable/fields";
import { isCustomerDeployment } from "@/lib/mode";
import { liveDocs, type DocRow, type LiveDoc } from "./docs";

/**
 * The live Company files (2026-11-23): the Company Files table, which Make fills from OneDrive, plus the newest
 * Project Expectations. Staff deployment only, read only, kept for a minute so the top bar doesn't cost a read on
 * every page. Anything that can't be read reads as no files: the heading drops out and the site sheets stay.
 */

const MINUTE = 60_000;
let memo: { at: number; docs: LiveDoc[] } | null = null;

function rowOf(r: { id: string; fields: Record<string, unknown> }): DocRow {
  const f = r.fields;
  const files = Array.isArray(f[COMPANY_FILES.pdf]) ? (f[COMPANY_FILES.pdf] as { url?: unknown }[]) : [];
  const pdf = files.find((x) => typeof x.url === "string" && isAirtableFile(x.url));
  return {
    id: r.id,
    fileName: typeof f[COMPANY_FILES.fileName] === "string" ? (f[COMPANY_FILES.fileName] as string) : "",
    modifiedAt: typeof f[COMPANY_FILES.modifiedAt] === "string" ? (f[COMPANY_FILES.modifiedAt] as string) : "",
    pdfUrl: pdf ? (pdf.url as string) : null,
    hidden: f[COMPANY_FILES.hidden] === true,
  };
}

export async function companyDocs(): Promise<LiveDoc[]> {
  if (isCustomerDeployment()) return [];
  if (memo && Date.now() - memo.at < MINUTE) return memo.docs;
  try {
    const [records, terms] = await Promise.all([
      listRecords(COMPANY_FILES_TABLE, { fields: [COMPANY_FILES.fileName, COMPANY_FILES.modifiedAt, COMPANY_FILES.pdf, COMPANY_FILES.hidden] }),
      newestTerms(),
    ]);
    const expectations = terms?.pdfUrl ? { modifiedAt: `${terms.on}T12:00:00Z`, pdfUrl: terms.pdfUrl } : null;
    const docs = liveDocs(records.map(rowOf), expectations);
    memo = { at: Date.now(), docs };
    return docs;
  } catch {
    // Not remembered, so the next page tries again.
    return [];
  }
}

/** The one live document `/files/<kind>` may serve, or null (the kind is matched against this list, never used as a path). */
export async function companyDocFor(kind: string): Promise<LiveDoc | null> {
  return (await companyDocs()).find((d) => d.kind === kind) ?? null;
}
