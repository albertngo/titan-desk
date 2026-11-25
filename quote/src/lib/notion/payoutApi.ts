import "server-only";
import { isCustomerDeployment } from "@/lib/mode";

/**
 * Installer Project Week (Albert, 2026-11-24; vault `05_decisions/2026-11-24-installer-project-week-boards`). The ONLY
 * file that reads QUOTE_NOTION_PAYOUT_TOKEN: a Notion internal integration shared with Project Costs, Titan Projects,
 * Titan Team, QA Work Orders and the Contractor Boards page alone, set on the staff deployment only. One request
 * function, `notionPayout()`, and it refuses anything outside `allowed()`:
 *
 * - queries of those four data sources (read);
 * - reading a page, or a block's children (read);
 * - creating a page in Project Costs, or under the boards page (`createIn` checks the parent);
 * - updating a page's properties, appending children, deleting a block (callers check whose page it is first:
 *   `src/lib/notion/projectCosts.ts` only touches lines it made, `src/lib/projectWeek/publish.ts` only a board under the
 *   boards page);
 * - uploading a file (a payout card picture);
 * - creating an inline database on an installer's board page and reading it (2026-11-25, the mini calendar). Its data
 *   source is queried only once `src/lib/projectWeek/run.ts` has checked that the database sits on a board page under
 *   Contractor Boards and called `trustBoardSource()`.
 *
 * Never a database or a data source changed, never a page moved. tests/boundary.test.ts pins who may import this.
 */

const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";

/** Data sources (collection ids). Not secrets; the token is the limit. */
export const DS = {
  projectCosts: "304596a4-505f-8197-b065-000bddcd731a",
  titanProjects: "1b4596a4-505f-81ca-b1d5-000bb73ecbe1",
  titanTeam: "79af84d3-a5e8-436f-818a-f143b1e8f5ef",
  workOrders: "2eb596a4-505f-800a-af8f-000b24ce4c57",
} as const;

const token = () => process.env.QUOTE_NOTION_PAYOUT_TOKEN?.trim() || null;
/** The published page every installer's Project Week page sits under. */
export const boardsParent = () => normalId(process.env.QUOTE_PROJECT_WEEK_PARENT);

export const payoutNotionOn = () => !isCustomerDeployment() && token() !== null;

export class NotionPayoutError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "NotionPayoutError";
  }
}

/** A Notion id, dashed and lower case, from a bare id or any Notion link; null when there isn't one. */
export function normalId(v: string | null | undefined): string | null {
  const hex = (v ?? "").replace(/-/g, "").match(/([0-9a-f]{32})(?![0-9a-f])/i)?.[1];
  return hex ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase() : null;
}

const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SOURCES = new Set<string>(Object.values(DS));
/** Installers' own calendar data sources, added for this run after their parent page was checked (run.ts only). */
const boardSources = new Set<string>();
export function trustBoardSource(id: string): void {
  const n = normalId(id);
  if (n) boardSources.add(n);
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/** The calls this token may make. Pure, so the boundary test can read it. */
export function allowed(method: Method, path: string): boolean {
  const q = path.match(new RegExp(`^/data_sources/(${ID})/query$`));
  if (q) return method === "POST" && (SOURCES.has(q[1]) || boardSources.has(q[1]));
  if (path === "/databases") return method === "POST";
  if (new RegExp(`^/databases/${ID}$`).test(path)) return method === "GET";
  if (new RegExp(`^/pages/${ID}$`).test(path)) return method === "GET" || method === "PATCH";
  if (path === "/pages") return method === "POST";
  if (new RegExp(`^/blocks/${ID}/children(\\?[a-z_=0-9&-]*)?$`).test(path)) return method === "GET" || method === "PATCH";
  if (new RegExp(`^/blocks/${ID}$`).test(path)) return method === "DELETE";
  if (path === "/file_uploads") return method === "POST";
  if (new RegExp(`^/file_uploads/${ID}/send$`).test(path)) return method === "POST";
  return false;
}

let last = 0;
/** Notion allows about three requests a second; the app stays under it, one at a time. */
async function pace() {
  const wait = last + 350 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

export async function notionPayout(method: Method, path: string, body?: FormData | object): Promise<Record<string, unknown>> {
  const t = token();
  if (!t || isCustomerDeployment()) throw new NotionPayoutError("Project Week isn't set up on this deployment (QUOTE_NOTION_PAYOUT_TOKEN).", null);
  if (!allowed(method, path)) throw new NotionPayoutError(`Refused: ${method} ${path.split("?")[0]} isn't a Project Week call`, null);
  const form = body instanceof FormData;
  for (let attempt = 0; attempt < 3; attempt++) {
    await pace();
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${t}`, "Notion-Version": VERSION, ...(body && !form ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new NotionPayoutError(`Notion ${res.status}: ${String(json.message ?? "request failed").slice(0, 200)}`, res.status);
    return json;
  }
  throw new NotionPayoutError("Notion is busy. Try again in a minute.", 429);
}

/** Every row of a data source matching `filter`, up to `max`. */
export async function queryAll(source: string, filter: object | undefined, max = 1000): Promise<NotionPage[]> {
  const out: NotionPage[] = [];
  let cursor: string | undefined;
  while (out.length < max) {
    const json = await notionPayout("POST", `/data_sources/${source}/query`, { ...(filter ? { filter } : {}), page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    out.push(...((json.results as NotionPage[] | undefined) ?? []));
    if (!json.has_more || typeof json.next_cursor !== "string") break;
    cursor = json.next_cursor;
  }
  return out;
}

/** A page's child blocks, all of them (up to 1000). */
export async function childrenOf(blockId: string): Promise<NotionBlock[]> {
  const out: NotionBlock[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const json = await notionPayout("GET", `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    out.push(...((json.results as NotionBlock[] | undefined) ?? []));
    if (!json.has_more || typeof json.next_cursor !== "string") break;
    cursor = json.next_cursor;
  }
  return out;
}

/** Append blocks, 100 to a request (Notion's limit). */
export async function appendBlocks(blockId: string, blocks: object[]): Promise<void> {
  for (let i = 0; i < blocks.length; i += 100) await notionPayout("PATCH", `/blocks/${blockId}/children`, { children: blocks.slice(i, i + 100) });
}

/** Upload one JPEG and return its file-upload id, to be placed in an image block. */
export async function uploadJpeg(bytes: Uint8Array, filename: string): Promise<string> {
  const name = filename.replace(/[^\w.\- ]+/g, "").slice(0, 90) || "payout.jpg";
  const created = await notionPayout("POST", "/file_uploads", { filename: name, content_type: "image/jpeg" });
  const id = normalId(String(created.id ?? ""));
  if (!id) throw new NotionPayoutError("Notion gave no upload id.", null);
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type: "image/jpeg" }), name);
  await notionPayout("POST", `/file_uploads/${id}/send`, form);
  return id;
}

/**
 * A picture already in Notion (a payout card on a Project Costs line), downloaded to be placed again on a board.
 * Only from Notion's own file hosts, never an address someone typed.
 */
export async function downloadNotionFile(url: string): Promise<Uint8Array | null> {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    host = u.hostname;
  } catch {
    return null;
  }
  if (!/(^|\.)(amazonaws\.com|notion\.so|notion-static\.com|notionusercontent\.com)$/.test(host)) return null;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes.byteLength > 0 && bytes.byteLength < 5_000_000 ? bytes : null;
}

export type NotionPage = { id: string; url?: string; parent?: Record<string, unknown>; properties?: Record<string, Record<string, unknown>>; archived?: boolean; in_trash?: boolean };
export type NotionBlock = { id: string; type: string; [k: string]: unknown };
