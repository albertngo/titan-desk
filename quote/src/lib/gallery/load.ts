import "server-only";
import { getProject, projectPhotos } from "@/lib/companycam/client";
import { byDay, type CamDay, type CamProject } from "@/lib/companycam/photos";
import { isCustomerDeployment } from "@/lib/mode";
import { galleryProjectId } from "./token";

/**
 * One job's photos for the installer gallery (2026-11-25): every photo on the CompanyCam project the link names, with
 * its description and time, read live on each open and stored nowhere. Customer deployment only, and only for a
 * token QUOTE_GALLERY_KEY signed: checked before CompanyCam is asked anything. Reads nothing else.
 */

export type Gallery = { project: CamProject; days: CamDay[]; count: number; more: boolean };

const WAIT_MS = 20_000;
const slow = () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("CompanyCam too slow")), WAIT_MS));

export async function loadGallery(token: string): Promise<Gallery | "error" | null> {
  if (!isCustomerDeployment()) return null;
  const id = galleryProjectId(token);
  if (!id) return null;
  try {
    const url = `https://app.companycam.com/projects/${id}`;
    const [project, { photos, more }] = await Promise.race([Promise.all([getProject(id, url), projectPhotos(id)]), slow()]);
    const days = byDay(photos);
    return { project: project ?? { id, name: null, address: null, url }, days, count: days.reduce((n, d) => n + d.photos.length, 0), more };
  } catch (e) {
    console.error("loadGallery", e instanceof Error ? e.message.slice(0, 200) : typeof e);
    return "error";
  }
}
