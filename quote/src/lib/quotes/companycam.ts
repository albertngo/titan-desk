import "server-only";
import { requireQuoter } from "@/lib/auth";
import { companyCamConfigured, CompanyCamError, NOT_CONFIGURED, getProject, projectPhotos } from "@/lib/companycam/client";
import { projectIdOf, type CamPhoto, type CamProject } from "@/lib/companycam/photos";

/**
 * The job's CompanyCam photos for the quote page's Photos tab (Albert, 2026-10-30): every photo on
 * the project the quote links, with when it was taken, who took it and its description. Read live
 * each time the tab opens, stored nowhere, never written back. Only a quoter may ask, and only on
 * the staff app (the customer deployment has no token and never imports this file).
 */

export type CompanyCamResult =
  | { ok: true; project: CamProject; photos: CamPhoto[]; more: boolean }
  | { ok: false; reason: "not-configured" | "no-project" | "error"; message: string };

/** CompanyCam gets this long for the whole read; past it the tab says so and links CompanyCam itself. */
const WAIT_MS = 20_000;
const slow = () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("CompanyCam too slow")), WAIT_MS));

export async function loadCompanyCam(companyCamUrl: string | null): Promise<CompanyCamResult> {
  await requireQuoter();
  const id = projectIdOf(companyCamUrl);
  if (!id || !companyCamUrl) return { ok: false, reason: "no-project", message: "This quote has no CompanyCam project linked yet." };
  if (!companyCamConfigured()) return { ok: false, reason: "not-configured", message: `${NOT_CONFIGURED} Open the project in CompanyCam instead.` };
  try {
    return await Promise.race([read(id, companyCamUrl), slow()]);
  } catch (e) {
    console.error("loadCompanyCam", e);
    const gone = e instanceof CompanyCamError && e.status === 404;
    return { ok: false, reason: "error", message: gone ? "CompanyCam doesn't have that project any more. Check the link on the GHL opportunity." : "CompanyCam didn't answer. Open the project in CompanyCam instead, or try again in a moment." };
  }
}

async function read(id: string, url: string): Promise<CompanyCamResult> {
  const [project, { photos, more }] = await Promise.all([getProject(id, url), projectPhotos(id)]);
  return { ok: true, project: project ?? { id, name: null, address: null, url }, photos, more };
}
