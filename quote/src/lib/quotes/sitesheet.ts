import "server-only";
import { AirtableError, getRecord, updateRecord, uploadAttachment } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { ClaudeError, readerOn, readJson, type ImageIn } from "@/lib/anthropic/client";
import { requireQuoter } from "@/lib/auth";
import { looksLikeSheet } from "@/lib/companycam/photos";
import { FLOOR_PROMPT } from "@/lib/floorsheet/prompt";
import { cleanFloorSheet, floorSheetRaw, parseFloorStored, serializeFloorStored } from "@/lib/floorsheet/sheet";
import { SHEET_PROMPT } from "@/lib/sitesheet/prompt";
import { cleanSheet, serializeStored, sheetRaw } from "@/lib/sitesheet/sheet";
import { loadCompanyCam, sheetImages } from "@/lib/quotes/companycam";
import type { CamSheetPhotosResult, SiteSheetResult } from "./types";

/**
 * The Site sheet tab (Albert, 2026-10-28): photos of the stair site sheet go onto the quote (Quotes →
 * Site Sheet Photos), Claude reads them into fields, and what was read is kept as JSON (Quotes → Site
 * Sheet) for a person to check. Like Rooms, a save goes through only if the field still holds what the
 * page opened with, so one person's check never overwrites another's. Quotes table only.
 *
 * Since 2026-11-03 (Albert: "the upload of the sheets from companycam. We can choose which one it is") the
 * photos can come from the job's CompanyCam project instead of an upload: staff pick them and say which sheet
 * they are. The Flooring Site Sheet is read the same way into Quotes → Flooring Sheet, its photos copied to
 * Quotes → Flooring Sheet Photos. The quote's CompanyCam link is always read from Airtable here, never taken
 * from the browser.
 */

const REC_ID = /^rec[A-Za-z0-9]{14}$/;
const CAM_ID = /^\d{1,15}$/;
export const MAX_PHOTOS = 4;
const MAX_BYTES = 4_500_000;
const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type PhotoIn = { name: string; type: string; bytes: Uint8Array };
export type SheetKind = "stairs" | "flooring";

/** Whether the tab can read photos: the Claude key is set on this (staff) deployment. Not a secret, just a yes/no. */
export async function sheetReaderOn(): Promise<boolean> {
  await requireQuoter();
  return readerOn();
}

type Current = { raw: string; floorRaw: string; camUrl: string | null };

async function current(quoteRecordId: string): Promise<Current | { error: string }> {
  try {
    const rec = await getRecord(T.quotes, quoteRecordId);
    const cam = rec.fields[QUOTE.companyCamUrl];
    return { raw: sheetRaw(rec.fields[QUOTE.siteSheet]), floorRaw: floorSheetRaw(rec.fields[QUOTE.floorSheet]), camUrl: typeof cam === "string" && cam.trim() ? cam.trim() : null };
  } catch (e) {
    if (e instanceof AirtableError && (e.status === 404 || e.status === 403)) return { error: "This quote isn't in Airtable any more." };
    return { error: `Airtable couldn't be read (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Try again.` };
  }
}

function checkPhotos(photos: PhotoIn[]): string | null {
  if (photos.length === 0) return "Add a photo of each page of the sheet.";
  if (photos.length > MAX_PHOTOS) return `Up to ${MAX_PHOTOS} photos at a time.`;
  for (const p of photos) {
    if (!(TYPES as readonly string[]).includes(p.type)) return `${p.name} isn't a JPEG, PNG or WebP photo.`;
    if (p.bytes.byteLength > MAX_BYTES) return `${p.name} is too large. Take it again, or choose a smaller copy.`;
  }
  return null;
}

/** Uploaded photos of the stair sheet (the original way, 2026-10-28). */
export async function readSiteSheet(quoteRecordId: string, seen: string, photos: PhotoIn[]): Promise<SiteSheetResult> {
  const email = await requireQuoter();
  if (!REC_ID.test(quoteRecordId)) return { ok: false, message: "This quote isn't in Airtable any more." };
  if (!readerOn()) return { ok: false, message: "Reading site sheets isn't set up yet: the staff app needs its Claude key." };
  const bad = checkPhotos(photos);
  if (bad) return { ok: false, message: bad };
  const now = await current(quoteRecordId);
  if ("error" in now) return { ok: false, message: now.error };
  if (now.raw !== seen) return { ok: false, message: "Someone else saved a site sheet on this quote since the page opened. Reload to see it." };
  return readStairs(quoteRecordId, email, photos);
}

/** The job's CompanyCam photos for the Site sheet tab's picker, newest first; ones tagged or described as a site sheet are marked. */
export async function sheetCamPhotos(quoteRecordId: string): Promise<CamSheetPhotosResult> {
  await requireQuoter();
  if (!REC_ID.test(quoteRecordId)) return { ok: false, message: "This quote isn't in Airtable any more." };
  const now = await current(quoteRecordId);
  if ("error" in now) return { ok: false, message: now.error };
  const r = await loadCompanyCam(now.camUrl);
  if (!r.ok) return { ok: false, message: r.message };
  const photos = [...r.photos].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return { ok: true, more: r.more, photos: photos.map((p) => ({ id: p.id, thumb: p.thumb, at: p.at, by: p.by, description: p.description, tags: p.tags, sheet: looksLikeSheet(p) })) };
}

/**
 * Photos picked from the job's CompanyCam project, read as the sheet staff said they are. `seen` is what the page
 * opened with in that sheet's field (Site Sheet or Flooring Sheet), so a read never replaces someone else's.
 */
export async function readFromCompanyCam(quoteRecordId: string, seen: string, photoIds: unknown, kind: SheetKind): Promise<SiteSheetResult> {
  const email = await requireQuoter();
  if (!REC_ID.test(quoteRecordId)) return { ok: false, message: "This quote isn't in Airtable any more." };
  if (!readerOn()) return { ok: false, message: "Reading site sheets isn't set up yet: the staff app needs its Claude key." };
  const ids = [...new Set((Array.isArray(photoIds) ? photoIds : []).map(String).filter((x) => CAM_ID.test(x)))];
  if (ids.length === 0) return { ok: false, message: "Pick the photos of the sheet first." };
  if (ids.length > MAX_PHOTOS) return { ok: false, message: `Up to ${MAX_PHOTOS} photos at a time.` };
  const now = await current(quoteRecordId);
  if ("error" in now) return { ok: false, message: now.error };
  if ((kind === "flooring" ? now.floorRaw : now.raw) !== seen) return { ok: false, message: `Someone else saved a ${kind === "flooring" ? "flooring" : "stair"} sheet on this quote since the page opened. Reload to see it.` };
  const got = await sheetImages(now.camUrl, ids);
  if (!got.ok) return { ok: false, message: got.message };
  const photos: PhotoIn[] = got.images.map((i) => ({ name: i.name, type: i.type, bytes: i.bytes }));
  const bad = checkPhotos(photos);
  if (bad) return { ok: false, message: bad };
  return kind === "flooring" ? readFlooring(quoteRecordId, email, photos, ids) : readStairs(quoteRecordId, email, photos);
}

async function ask(photos: PhotoIn[], prompt: string): Promise<{ answer: unknown; images: ImageIn[] } | { message: string }> {
  const images: ImageIn[] = photos.map((p) => ({ mediaType: p.type as ImageIn["mediaType"], base64: Buffer.from(p.bytes).toString("base64") }));
  try {
    return { answer: await readJson(images, prompt), images };
  } catch (e) {
    // Only the reader's own words reach the screen (2026-10-28): a raw error once printed part of the key.
    if (!(e instanceof ClaudeError)) console.error("site sheet read failed:", e instanceof Error ? e.name : typeof e);
    return { message: `Nothing was saved. ${e instanceof ClaudeError ? e.message : "The photos couldn't be read. Try again."}` };
  }
}

/** The photos go on the quote whatever happens next, so the sheet can always be checked against them. Returns how many failed. */
async function attach(quoteRecordId: string, field: string, prefix: string, photos: PhotoIn[], images: ImageIn[]): Promise<number> {
  let failed = 0;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  for (const [i, p] of photos.entries()) {
    try {
      await uploadAttachment(T.quotes, quoteRecordId, field, { contentType: p.type, filename: `${prefix}-${stamp}-${i + 1}.${p.type.split("/")[1].replace("jpeg", "jpg")}`, base64: images[i].base64 });
    } catch {
      failed++;
    }
  }
  return failed;
}

async function readStairs(quoteRecordId: string, email: string, photos: PhotoIn[]): Promise<SiteSheetResult> {
  const read = await ask(photos, SHEET_PROMPT);
  if ("message" in read) return { ok: false, message: read.message };
  const saved = serializeStored({ sheet: cleanSheet(read.answer), by: email, at: new Date().toISOString(), checked: false });
  const failed = await attach(quoteRecordId, QUOTE.siteSheetPhotos, "site-sheet", photos, read.images);
  try {
    await updateRecord(T.quotes, quoteRecordId, { [QUOTE.siteSheet]: saved });
  } catch (e) {
    return { ok: false, message: `The sheet was read but not saved (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Try again.` };
  }
  const photosNow = await photosOf(quoteRecordId, QUOTE.siteSheetPhotos);
  return { ok: true, saved, photos: photosNow, note: failed ? `${failed} photo${failed === 1 ? "" : "s"} didn't attach to the quote.` : undefined };
}

async function readFlooring(quoteRecordId: string, email: string, photos: PhotoIn[], photoIds: string[]): Promise<SiteSheetResult> {
  const read = await ask(photos, FLOOR_PROMPT);
  if ("message" in read) return { ok: false, message: read.message };
  const saved = serializeFloorStored({ sheet: cleanFloorSheet(read.answer), by: email, at: new Date().toISOString(), checked: false, photoIds });
  const failed = await attach(quoteRecordId, QUOTE.floorSheetPhotos, "flooring-sheet", photos, read.images);
  try {
    await updateRecord(T.quotes, quoteRecordId, { [QUOTE.floorSheet]: saved });
  } catch (e) {
    return { ok: false, message: `The sheet was read but not saved (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Try again.` };
  }
  const photosNow = await photosOf(quoteRecordId, QUOTE.floorSheetPhotos);
  return { ok: true, saved, photos: photosNow, note: failed ? `${failed} photo${failed === 1 ? "" : "s"} didn't attach to the quote.` : undefined };
}

/** `checked` false (2026-10-31): Build stair options keeping unsaved edits without saying a person checked the sheet. */
export async function saveSiteSheet(quoteRecordId: string, seen: string, input: unknown, checked = true): Promise<SiteSheetResult> {
  const email = await requireQuoter();
  if (!REC_ID.test(quoteRecordId)) return { ok: false, message: "This quote isn't in Airtable any more." };
  const now = await current(quoteRecordId);
  if ("error" in now) return { ok: false, message: now.error };
  if (now.raw !== seen) return { ok: false, message: "Someone else saved this site sheet since the page opened, so yours wasn't saved. Reload and check it again." };
  const saved = serializeStored({ sheet: cleanSheet(input), by: email, at: new Date().toISOString(), checked });
  try {
    await updateRecord(T.quotes, quoteRecordId, { [QUOTE.siteSheet]: saved });
  } catch (e) {
    return { ok: false, message: `The check wasn't saved (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Try again.` };
  }
  return { ok: true, saved };
}

/** The flooring sheet's check (2026-11-03), compare-and-swap like the stair sheet's; the CompanyCam photo ids it was read from are kept. */
export async function saveFloorSheet(quoteRecordId: string, seen: string, input: unknown, checked = true): Promise<SiteSheetResult> {
  const email = await requireQuoter();
  if (!REC_ID.test(quoteRecordId)) return { ok: false, message: "This quote isn't in Airtable any more." };
  const now = await current(quoteRecordId);
  if ("error" in now) return { ok: false, message: now.error };
  if (now.floorRaw !== seen) return { ok: false, message: "Someone else saved this flooring sheet since the page opened, so yours wasn't saved. Reload and check it again." };
  const saved = serializeFloorStored({ sheet: cleanFloorSheet(input), by: email, at: new Date().toISOString(), checked, photoIds: parseFloorStored(now.floorRaw)?.photoIds ?? [] });
  try {
    await updateRecord(T.quotes, quoteRecordId, { [QUOTE.floorSheet]: saved });
  } catch (e) {
    return { ok: false, message: `The check wasn't saved (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Try again.` };
  }
  return { ok: true, saved };
}

async function photosOf(quoteRecordId: string, field: string): Promise<{ url: string; name: string }[]> {
  try {
    const v = (await getRecord(T.quotes, quoteRecordId)).fields[field];
    if (!Array.isArray(v)) return [];
    return v.flatMap((a) => (a && typeof a.url === "string" ? [{ url: a.url as string, name: typeof a.filename === "string" ? a.filename : "photo" }] : []));
  } catch {
    return [];
  }
}
