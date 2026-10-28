import "server-only";
import { AirtableError, getRecord, updateRecord, uploadAttachment } from "@/lib/airtable/client";
import { QUOTE, T } from "@/lib/airtable/fields";
import { ClaudeError, readerOn, readWithTool, type ImageIn } from "@/lib/anthropic/client";
import { requireQuoter } from "@/lib/auth";
import { SHEET_PROMPT, SHEET_SCHEMA, SHEET_TOOL } from "@/lib/sitesheet/prompt";
import { cleanSheet, serializeStored, sheetRaw } from "@/lib/sitesheet/sheet";
import type { SiteSheetResult } from "./types";

/**
 * The Site sheet tab (Albert, 2026-10-28): photos of the stair site sheet go onto the quote (Quotes →
 * Site Sheet Photos), Claude reads them into fields, and what was read is kept as JSON (Quotes → Site
 * Sheet) for a person to check. Like Rooms, a save goes through only if the field still holds what the
 * page opened with, so one person's check never overwrites another's. Quotes table only.
 */

const REC_ID = /^rec[A-Za-z0-9]{14}$/;
export const MAX_PHOTOS = 4;
const MAX_BYTES = 4_500_000;
const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type PhotoIn = { name: string; type: string; bytes: Uint8Array };

/** Whether the tab can read photos: the Claude key is set on this (staff) deployment. Not a secret, just a yes/no. */
export async function sheetReaderOn(): Promise<boolean> {
  await requireQuoter();
  return readerOn();
}

async function current(quoteRecordId: string): Promise<{ raw: string } | { error: string }> {
  try {
    const rec = await getRecord(T.quotes, quoteRecordId);
    return { raw: sheetRaw(rec.fields[QUOTE.siteSheet]) };
  } catch (e) {
    if (e instanceof AirtableError && (e.status === 404 || e.status === 403)) return { error: "This quote isn't in Airtable any more." };
    return { error: `Airtable couldn't be read (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Try again.` };
  }
}

export async function readSiteSheet(quoteRecordId: string, seen: string, photos: PhotoIn[]): Promise<SiteSheetResult> {
  const email = await requireQuoter();
  if (!REC_ID.test(quoteRecordId)) return { ok: false, message: "This quote isn't in Airtable any more." };
  if (!readerOn()) return { ok: false, message: "Reading site sheets isn't set up yet: the staff app needs its Claude key." };
  if (photos.length === 0) return { ok: false, message: "Add a photo of each page of the sheet." };
  if (photos.length > MAX_PHOTOS) return { ok: false, message: `Up to ${MAX_PHOTOS} photos at a time.` };
  for (const p of photos) {
    if (!(TYPES as readonly string[]).includes(p.type)) return { ok: false, message: `${p.name} isn't a JPEG, PNG or WebP photo.` };
    if (p.bytes.byteLength > MAX_BYTES) return { ok: false, message: `${p.name} is too large. Take it again, or choose a smaller copy.` };
  }
  const now = await current(quoteRecordId);
  if ("error" in now) return { ok: false, message: now.error };
  if (now.raw !== seen) return { ok: false, message: "Someone else saved a site sheet on this quote since the page opened. Reload to see it." };

  const images: ImageIn[] = photos.map((p) => ({ mediaType: p.type as ImageIn["mediaType"], base64: Buffer.from(p.bytes).toString("base64") }));
  let answer: unknown;
  try {
    answer = await readWithTool(images, SHEET_PROMPT, { name: SHEET_TOOL, description: "Record every field of the stair site sheet exactly as written.", schema: SHEET_SCHEMA });
  } catch (e) {
    const why = e instanceof ClaudeError && e.status === 503 ? e.message : `the photos couldn't be read (${e instanceof Error ? e.message.slice(0, 120) : "error"})`;
    return { ok: false, message: `Nothing was saved: ${why}. Try again.` };
  }
  const saved = serializeStored({ sheet: cleanSheet(answer), by: email, at: new Date().toISOString(), checked: false });

  // The photos go on the quote whatever happens next, so the sheet can always be checked against them.
  let failed = 0;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  for (const [i, p] of photos.entries()) {
    try {
      await uploadAttachment(T.quotes, quoteRecordId, QUOTE.siteSheetPhotos, { contentType: p.type, filename: `site-sheet-${stamp}-${i + 1}.${p.type.split("/")[1].replace("jpeg", "jpg")}`, base64: images[i].base64 });
    } catch {
      failed++;
    }
  }
  try {
    await updateRecord(T.quotes, quoteRecordId, { [QUOTE.siteSheet]: saved });
  } catch (e) {
    return { ok: false, message: `The sheet was read but not saved (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Try again.` };
  }
  const photosNow = await photosOf(quoteRecordId);
  return { ok: true, saved, photos: photosNow, note: failed ? `${failed} photo${failed === 1 ? "" : "s"} didn't attach to the quote.` : undefined };
}

export async function saveSiteSheet(quoteRecordId: string, seen: string, input: unknown): Promise<SiteSheetResult> {
  const email = await requireQuoter();
  if (!REC_ID.test(quoteRecordId)) return { ok: false, message: "This quote isn't in Airtable any more." };
  const now = await current(quoteRecordId);
  if ("error" in now) return { ok: false, message: now.error };
  if (now.raw !== seen) return { ok: false, message: "Someone else saved this site sheet since the page opened, so yours wasn't saved. Reload and check it again." };
  const saved = serializeStored({ sheet: cleanSheet(input), by: email, at: new Date().toISOString(), checked: true });
  try {
    await updateRecord(T.quotes, quoteRecordId, { [QUOTE.siteSheet]: saved });
  } catch (e) {
    return { ok: false, message: `The check wasn't saved (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Try again.` };
  }
  return { ok: true, saved };
}

async function photosOf(quoteRecordId: string): Promise<{ url: string; name: string }[]> {
  try {
    const v = (await getRecord(T.quotes, quoteRecordId)).fields[QUOTE.siteSheetPhotos];
    if (!Array.isArray(v)) return [];
    return v.flatMap((a) => (a && typeof a.url === "string" ? [{ url: a.url as string, name: typeof a.filename === "string" ? a.filename : "photo" }] : []));
  } catch {
    return [];
  }
}
