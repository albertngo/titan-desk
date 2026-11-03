import "server-only";
import { requireQuoter } from "@/lib/auth";
import { companyCamConfigured, CompanyCamError, NOT_CONFIGURED, getProject, imageBytes, projectPhotos } from "@/lib/companycam/client";
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

/** A site sheet photo downloaded for reading (2026-11-03): the types the reader and Airtable both take. */
export type SheetImage = { id: string; name: string; type: "image/jpeg" | "image/png" | "image/webp"; bytes: Uint8Array };
export type SheetImagesResult = { ok: true; images: SheetImage[] } | { ok: false; message: string };
const SHEET_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Under the reader's 5 MB a photo and Airtable's upload limit, with room for base64. */
const SHEET_MAX_BYTES = 3_700_000;

/**
 * The photos staff picked on the Site sheet tab, downloaded from the quote's own CompanyCam project (Albert,
 * 2026-11-03: "the upload of the sheets from companycam. We can choose which one it is"). Each id must be a photo on
 * that project; the image comes from CompanyCam's own answer, the plain copy (no markup), the original when it is
 * small enough to read, else the web size. Kept in the order picked. Stored nowhere here: the caller keeps them.
 */
export async function sheetImages(companyCamUrl: string | null, photoIds: string[]): Promise<SheetImagesResult> {
  await requireQuoter();
  const id = projectIdOf(companyCamUrl);
  if (!id) return { ok: false, message: "This quote has no CompanyCam project linked yet." };
  if (!companyCamConfigured()) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { photos } = await projectPhotos(id);
    const byId = new Map(photos.map((p) => [p.id, p]));
    const images: SheetImage[] = [];
    for (const [i, pid] of photoIds.entries()) {
      const p = byId.get(pid);
      if (!p) return { ok: false, message: "A photo you picked isn't on this job's CompanyCam project any more. Load the photos again." };
      const img = await plainImage(p);
      if (!img) return { ok: false, message: `Photo ${i + 1} couldn't be downloaded from CompanyCam as a JPEG, PNG or WebP small enough to read.` };
      images.push({ id: pid, name: `companycam-${pid}.${img.type.split("/")[1].replace("jpeg", "jpg")}`, ...img });
    }
    return { ok: true, images };
  } catch (e) {
    console.error("sheetImages", e instanceof Error ? e.message.slice(0, 200) : typeof e);
    return { ok: false, message: "CompanyCam didn't answer. Try again in a moment." };
  }
}

async function plainImage(p: CamPhoto): Promise<Pick<SheetImage, "type" | "bytes"> | null> {
  for (const uri of [p.plain.original, p.plain.web]) {
    if (!uri) continue;
    try {
      const { type, bytes } = await imageBytes(uri);
      if ((SHEET_TYPES as readonly string[]).includes(type) && bytes.byteLength <= SHEET_MAX_BYTES) return { type: type as SheetImage["type"], bytes };
    } catch {
      // try the smaller copy
    }
  }
  return null;
}

async function read(id: string, url: string): Promise<CompanyCamResult> {
  const [project, { photos, more }] = await Promise.all([getProject(id, url), projectPhotos(id)]);
  return { ok: true, project: project ?? { id, name: null, address: null, url }, photos, more };
}
