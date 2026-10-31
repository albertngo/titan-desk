import "server-only";
import { isCustomerDeployment } from "@/lib/mode";
import { toPhotos, toProject, type CamPhoto, type CamProject } from "./photos";

/**
 * The ONLY file in quote/ that talks to CompanyCam (Albert, 2026-10-30: the job's photos in the
 * app, with their times and descriptions), and the only reader of QUOTE_COMPANYCAM_TOKEN, set on
 * the staff deployment only. Server-only, GET only: tests/boundary.test.ts fails on a write verb
 * here. A CompanyCam access token is not scoped, so this file is the limit: it reads one project
 * and its photos and nothing else. Making projects stays Make's job (3453735).
 */

const BASE = "https://api.companycam.com/v2";
const PER_PAGE = 50;
/** At most this many pages a read (600 photos); past it the tab says so and links CompanyCam. */
const MAX_PAGES = 12;

export class CompanyCamError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "CompanyCamError";
  }
}

/** Said when the token is missing, by the client and the Photos tab. */
export const NOT_CONFIGURED = "CompanyCam photos aren't set up for this app yet (QUOTE_COMPANYCAM_TOKEN).";

export const companyCamConfigured = () => !isCustomerDeployment() && Boolean(process.env.QUOTE_COMPANYCAM_TOKEN?.trim());

async function get(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const token = process.env.QUOTE_COMPANYCAM_TOKEN?.trim();
  if (!token || isCustomerDeployment()) throw new CompanyCamError(NOT_CONFIGURED, null);
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ""}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CompanyCamError(`CompanyCam ${res.status} on ${path}: ${body.slice(0, 200)}`, res.status);
  }
  return res.json();
}

export async function getProject(id: string, url: string): Promise<CamProject | null> {
  return toProject(await get(`/projects/${encodeURIComponent(id)}`), url);
}

/** Every photo on the project, a page at a time, up to MAX_PAGES; `more` when CompanyCam had further pages. */
export async function projectPhotos(id: string): Promise<{ photos: CamPhoto[]; more: boolean }> {
  const photos: CamPhoto[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const list = await get(`/projects/${encodeURIComponent(id)}/photos`, { page: String(page), per_page: String(PER_PAGE) });
    const n = Array.isArray(list) ? list.length : 0;
    photos.push(...toPhotos(list));
    if (n < PER_PAGE) return { photos, more: false };
  }
  return { photos, more: true };
}
