import "server-only";

/**
 * The only file that talks to Notion (Report a bug, 2026-10-28), and the only one that reads
 * NOTION_BUG_TOKEN. That token belongs to an internal integration shared with the Tactical Tasks
 * List alone, so the worst it can do is add tasks there. Staff deployments only: the customer
 * deployment never holds it. Two things, nothing else: upload a screenshot, create the task.
 */

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

const token = () => process.env.NOTION_BUG_TOKEN?.trim() || null;

/** Is Report a bug set up on this deployment? The button shows only when it is. */
export const bugReportsOn = () => token() !== null;

async function notion(path: string, body: FormData | object): Promise<Record<string, unknown>> {
  const t = token();
  if (!t) throw new Error("Report a bug isn't set up (NOTION_BUG_TOKEN).");
  const form = body instanceof FormData;
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Notion-Version": VERSION, ...(form ? {} : { "Content-Type": "application/json" }) },
    body: form ? body : JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Notion ${res.status}: ${String(json.message ?? "request failed")}`);
  return json;
}

/** Uploads one screenshot to Notion and returns its file-upload id, to be placed on the page. */
export async function uploadImage(file: File): Promise<string> {
  const name = file.name.replace(/[^\w.\- ]+/g, "").slice(0, 80) || "screenshot.jpg";
  const created = await notion("/file_uploads", { filename: name, content_type: file.type });
  const id = String(created.id);
  const form = new FormData();
  form.append("file", file, name);
  await notion(`/file_uploads/${id}/send`, form);
  return id;
}

/** Creates the task and returns its Notion address. */
export async function createTask(body: object): Promise<string> {
  const page = await notion("/pages", body);
  return String(page.url ?? "");
}
