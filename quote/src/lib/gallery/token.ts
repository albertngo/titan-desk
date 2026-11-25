import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { projectIdOf } from "@/lib/companycam/photos";

/**
 * Job photos for installers (Albert, 2026-11-25: "can the quote app host the photos and share it all with its own
 * link"; vault `05_decisions/2026-11-25-installer-photo-gallery`). A gallery link is `/g/<project id>-<signature>` on
 * the customer deployment: the CompanyCam project id and an HMAC of it keyed by QUOTE_GALLERY_KEY, which both
 * deployments hold. The staff app signs (the Project Week run); the customer deployment checks. Nothing is stored, so
 * a link works until the key changes, and changing the key turns every link off at once.
 */

const LENGTH = 32;
export const GALLERY_TOKEN = /^(\d{1,15})-([0-9a-f]{32})$/;

const key = () => process.env.QUOTE_GALLERY_KEY?.trim() || null;
const sign = (k: string, projectId: string) => createHmac("sha256", k).update(`gallery:${projectId}`).digest("hex").slice(0, LENGTH);

export function galleryToken(projectId: string): string | null {
  const k = key();
  return k && /^\d{1,15}$/.test(projectId) ? `${projectId}-${sign(k, projectId)}` : null;
}

/** The CompanyCam project id a token names, or null when it isn't one this key signed. */
export function galleryProjectId(token: string): string | null {
  const m = GALLERY_TOKEN.exec(token);
  const k = key();
  if (!m || !k) return null;
  const a = Buffer.from(m[2]);
  const b = Buffer.from(sign(k, m[1]));
  return a.length === b.length && timingSafeEqual(a, b) ? m[1] : null;
}

/** The gallery link for a job's CompanyCam project, or null when the key, the customer address or the project is missing. */
export function galleryLink(companyCamUrl: string | null): string | null {
  const id = projectIdOf(companyCamUrl);
  const base = process.env.QUOTE_CUSTOMER_URL?.trim().replace(/\/+$/, "");
  const token = id ? galleryToken(id) : null;
  return token && base && /^https:\/\//.test(base) ? `${base}/g/${token}` : null;
}
