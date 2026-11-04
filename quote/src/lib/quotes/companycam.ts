import "server-only";
import { requireQuoter } from "@/lib/auth";
import { addProjectPhoto, companyCamConfigured, CompanyCamError, NOT_CONFIGURED, getProject, imageBytes, projectPhotos } from "@/lib/companycam/client";
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
export type SheetImage = { id: string; name: string; type: "image/jpeg" | "image/png" | "image/webp"; bytes: Uint8Array; pageUrl: string | null; at: string | null; small: boolean };
export type SheetImagesResult = { ok: true; images: SheetImage[] } | { ok: false; message: string };
const SHEET_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Under the reader's 5 MB a photo and Airtable's upload limit, with room for base64. */
const SHEET_MAX_BYTES = 3_700_000;
/** The longest side a sheet is read at, as a photo taken in the app is (`preparePhoto()`, 2000 px). */
const SHEET_EDGE = 2000;

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
      images.push({ id: pid, name: `companycam-${pid}.${img.type.split("/")[1].replace("jpeg", "jpg")}`, pageUrl: p.pageUrl, at: p.at, ...img });
    }
    return { ok: true, images };
  } catch (e) {
    console.error("sheetImages", e instanceof Error ? e.message.slice(0, 200) : typeof e);
    return { ok: false, message: "CompanyCam didn't answer. Try again in a moment." };
  }
}

/**
 * The plain original, made a JPEG of at most 2000 px on its longest side (Albert, 2026-11-03: "how come the resolution
 * on the company cam image is so low?"). CompanyCam's "web" copy is only 400 px, too small to read a sheet's boxes, and it
 * was used whenever the original was over 3.7 MB, which a phone photo often is. It is now only the last resort, marked
 * `small` so the screen can say so.
 */
async function plainImage(p: CamPhoto): Promise<Pick<SheetImage, "type" | "bytes" | "small"> | null> {
  if (p.plain.original) {
    try {
      const { type, bytes } = await imageBytes(p.plain.original);
      const fit = await fitForReading(bytes);
      if (fit) return { type: "image/jpeg", bytes: fit, small: false };
      if ((SHEET_TYPES as readonly string[]).includes(type) && bytes.byteLength <= SHEET_MAX_BYTES) return { type: type as SheetImage["type"], bytes, small: false };
    } catch (e) {
      console.error("site sheet original", e instanceof Error ? e.message.slice(0, 200) : typeof e);
    }
  }
  if (p.plain.web) {
    try {
      const { type, bytes } = await imageBytes(p.plain.web);
      if ((SHEET_TYPES as readonly string[]).includes(type) && bytes.byteLength <= SHEET_MAX_BYTES) return { type: type as SheetImage["type"], bytes, small: true };
    } catch {
      // nothing left to try
    }
  }
  return null;
}

/** Turned upright by its EXIF, shrunk to fit 2000 px (never enlarged), JPEG at 85%. Null when it can't be decoded. */
async function fitForReading(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const { default: sharp } = await import("sharp");
    for (const quality of [85, 75, 65]) {
      const out = await sharp(bytes, { failOn: "none" }).rotate().resize({ width: SHEET_EDGE, height: SHEET_EDGE, fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
      if (out.byteLength <= SHEET_MAX_BYTES) return new Uint8Array(out);
    }
    return null;
  } catch (e) {
    console.error("site sheet resize", e instanceof Error ? e.message.slice(0, 200) : typeof e);
    return null;
  }
}

async function read(id: string, url: string): Promise<CompanyCamResult> {
  const [project, { photos, more }] = await Promise.all([getProject(id, url), projectPhotos(id)]);
  return { ok: true, project: project ?? { id, name: null, address: null, url }, photos, more };
}

export type PayoutPhotoResult = { ok: true; id: string | null } | { ok: false; message: string };

/**
 * A payout card into the job's timeline (Albert, 2026-11-04): one photo on the quote's own CompanyCam project, its image
 * fetched by CompanyCam from `uri`, tagged Payout. The project comes from the quote's link, never from a browser. The
 * only CompanyCam write in the app; called only from src/lib/quotes/payouts.ts.
 */
export async function addPayoutPhoto(companyCamUrl: string | null, uri: string, description: string): Promise<PayoutPhotoResult> {
  await requireQuoter();
  const id = projectIdOf(companyCamUrl);
  if (!id) return { ok: false, message: "This quote has no CompanyCam project linked yet." };
  if (!companyCamConfigured()) return { ok: false, message: NOT_CONFIGURED };
  try {
    const photo = await addProjectPhoto(id, { uri, capturedAt: new Date(), description, tags: ["Payout"] });
    return { ok: true, id: photo.id };
  } catch (e) {
    console.error("addPayoutPhoto", e instanceof Error ? e.message.slice(0, 300) : typeof e);
    const gone = e instanceof CompanyCamError && e.status === 404;
    return { ok: false, message: gone ? "CompanyCam doesn't have that project any more. Check the link on the GHL opportunity." : `CompanyCam didn't take the card (${e instanceof Error ? e.message.slice(0, 160) : "error"}).` };
  }
}
