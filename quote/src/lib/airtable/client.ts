import "server-only";
import { isCustomerDeployment } from "@/lib/mode";
import { BASE_ID, WRITABLE_TABLES } from "./fields";

/**
 * The ONLY file in quote/ that talks to Airtable, and the only one that reads
 * QUOTE_AIRTABLE_TOKEN. Server-only: the token never reaches a browser.
 *
 * Reads are GET. Writes (from milestone 3, 2026-10-14) are POST to create and PATCH to update,
 * and only ever to the four quote tables in WRITABLE_TABLES: `write()` refuses any other table
 * before a request leaves the server, and refuses everything on the customer deployment, whose
 * token is read-only anyway (src/lib/mode.ts). There is no delete and no PUT. tests/boundary.test.ts
 * enforces all of this, so a catalogue, Rate Card or Stair Items write can never ship.
 */

const API = "https://api.airtable.com/v0";
/** Airtable's file-upload host (2026-10-28), used only by uploadAttachment(). */
const UPLOAD = "https://content.airtable.com/v0";

export type AirtableRecord = { id: string; createdTime: string; fields: Record<string, unknown> };

export class AirtableError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AirtableError";
  }
}

function token(): string {
  const t = process.env.QUOTE_AIRTABLE_TOKEN;
  if (!t) throw new AirtableError("QUOTE_AIRTABLE_TOKEN is not set for this deployment", 500);
  return t;
}

async function get(path: string, params: URLSearchParams): Promise<unknown> {
  params.set("returnFieldsByFieldId", "true");
  const res = await fetch(`${API}/${BASE_ID}/${path}?${params}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token()}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AirtableError(`Airtable ${res.status} on ${path}: ${body.slice(0, 200)}`, res.status);
  }
  return res.json();
}

async function write(method: "POST" | "PATCH", table: string, path: string, body: unknown): Promise<unknown> {
  if (!WRITABLE_TABLES.includes(table)) throw new AirtableError(`Refused: the quote app never writes to ${table}`, 403);
  if (isCustomerDeployment()) throw new AirtableError("Refused: the customer deployment never writes", 403);
  const res = await fetch(`${API}/${BASE_ID}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AirtableError(`Airtable ${res.status} on ${method} ${table}: ${text.slice(0, 200)}`, res.status);
  }
  return res.json();
}

/**
 * Attach one file to an attachment field of a record in a quote table (2026-10-28: the stair site sheet's
 * photos on Quotes). Airtable's upload host takes the file itself (base64, under 5 MB) and appends it to
 * the field; the same table and deployment checks as write() run first.
 */
export async function uploadAttachment(table: string, id: string, fieldId: string, file: { contentType: string; filename: string; base64: string }): Promise<void> {
  if (!WRITABLE_TABLES.includes(table)) throw new AirtableError(`Refused: the quote app never writes to ${table}`, 403);
  if (isCustomerDeployment()) throw new AirtableError("Refused: the customer deployment never writes", 403);
  if (!/^rec[A-Za-z0-9]{14}$/.test(id) || !/^fld[A-Za-z0-9]{14}$/.test(fieldId)) throw new AirtableError("Not a record or field id", 404);
  const res = await fetch(`${UPLOAD}/${BASE_ID}/${id}/${fieldId}/uploadAttachment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(file),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AirtableError(`Airtable ${res.status} on upload to ${table}: ${text.slice(0, 200)}`, res.status);
  }
}

/** Create one record in a quote table. Select options are matched by name (typecast). Returns it with computed fields. */
export async function createRecord(table: string, fields: Record<string, unknown>): Promise<AirtableRecord> {
  return (await write("POST", table, table, { fields, typecast: true, returnFieldsByFieldId: true })) as AirtableRecord;
}

/** Change the given fields of one record in a quote table; every other field is left alone. */
export async function updateRecord(table: string, id: string, fields: Record<string, unknown>): Promise<AirtableRecord> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) throw new AirtableError("Not a record id", 404);
  return (await write("PATCH", table, `${table}/${id}`, { fields, typecast: true, returnFieldsByFieldId: true })) as AirtableRecord;
}

const BATCH = 10; // Airtable's limit per create/update request.

/**
 * Create many records in one quote table, ten per request, in order. Returns them in the same
 * order. `done` hears how many were written after each request, so a caller stopped part way
 * knows whether anything landed.
 */
export async function createRecords(table: string, rows: Record<string, unknown>[], done?: (n: number) => void): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const records = rows.slice(i, i + BATCH).map((fields) => ({ fields }));
    const page = (await write("POST", table, table, { records, typecast: true, returnFieldsByFieldId: true })) as { records: AirtableRecord[] };
    out.push(...page.records);
    done?.(page.records.length);
  }
  return out;
}

/** Change the given fields of many records in one quote table, ten per request. */
export async function updateRecords(table: string, rows: { id: string; fields: Record<string, unknown> }[], done?: (n: number) => void): Promise<void> {
  if (rows.some((r) => !/^rec[A-Za-z0-9]{14}$/.test(r.id))) throw new AirtableError("Not a record id", 404);
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await write("PATCH", table, table, { records: batch, typecast: true });
    done?.(batch.length);
  }
}

export async function getRecord(table: string, id: string): Promise<AirtableRecord> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) throw new AirtableError("Not a record id", 404);
  return (await get(`${table}/${id}`, new URLSearchParams())) as AirtableRecord;
}

export async function listRecords(
  table: string,
  opts: { fields?: string[]; filterByFormula?: string } = {},
): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const p = new URLSearchParams({ pageSize: "100" });
    opts.fields?.forEach((f) => p.append("fields[]", f));
    if (opts.filterByFormula) p.set("filterByFormula", opts.filterByFormula);
    if (offset) p.set("offset", offset);
    const page = (await get(table, p)) as { records: AirtableRecord[]; offset?: string };
    out.push(...page.records);
    offset = page.offset;
  } while (offset);
  return out;
}

/** Fetch specific records by id, in chunks that keep the formula short. Ids are validated, never interpolated raw. */
export async function listByIds(table: string, ids: string[], fields?: string[]): Promise<AirtableRecord[]> {
  const valid = ids.filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id));
  const out: AirtableRecord[] = [];
  for (let i = 0; i < valid.length; i += 40) {
    const chunk = valid.slice(i, i + 40);
    const formula = `OR(${chunk.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    out.push(...(await listRecords(table, { fields, filterByFormula: formula })));
  }
  return out;
}
