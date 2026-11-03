/**
 * Where a read site sheet came from, and the photo each page is checked against (Albert, 2026-11-03: "a preview of
 * the uploaded photo that it's comparing against", not a blank column). Pure, shared by the stair and flooring
 * sheets. Tested in tests/sitesheet.test.ts.
 *
 * A read keeps two things beside the sheet: the CompanyCam photos it was drawn from (`cam`, ids and their CompanyCam
 * pages), and the names of the copies it attached to the quote (`files`). The quote's photo field keeps every read's
 * copies, oldest first, so the names say which ones are this read's. A copy that didn't attach falls back to the
 * CompanyCam photo itself.
 */

export type CamSource = { id: string; pageUrl: string | null; at: string | null };
export type SheetPhoto = { url: string; name: string };
export type Preview = { page: number; url: string; href: string; name: string; from: "quote" | "companycam" };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const MAX = 4;

/** Only a CompanyCam photo page is kept as a link (https://app.companycam.com/photos/<id>). */
export function cleanCam(v: unknown): CamSource[] {
  return (Array.isArray(v) ? v : []).slice(0, MAX).flatMap((x) => {
    const o = obj(x);
    const id = typeof o.id === "string" && /^\d{1,15}$/.test(o.id) ? o.id : null;
    if (!id) return [];
    const page = typeof o.pageUrl === "string" && /^https:\/\/app\.companycam\.com\/photos\/\d{1,15}(?:[/?#]|$)/.test(o.pageUrl) ? o.pageUrl : null;
    const at = typeof o.at === "string" && o.at.trim() ? o.at.trim().slice(0, 40) : null;
    return [{ id, pageUrl: page, at }];
  });
}

/** The attachment names a read wrote, in page order. Only names this app makes are kept. */
export function cleanFiles(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).slice(0, MAX).filter((x): x is string => typeof x === "string" && /^[a-z0-9][a-z0-9.-]{0,119}$/.test(x));
}

/** The name a read gives page `i` (0-based) when it attaches it: unique to the second, so two reads never share one. */
export function attachName(prefix: string, at: Date, i: number, type: string): string {
  const stamp = at.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${prefix}-${stamp}-${i + 1}.${(type.split("/")[1] ?? "jpg").replace("jpeg", "jpg")}`;
}

/**
 * One preview per page of the current read: its copy on the quote, else the CompanyCam photo it was drawn from
 * (`camWeb`: photo id → image address, from CompanyCam's own answer), else nothing for that page. A sheet read before
 * either was kept shows the quote's photos as they are, as it always did.
 */
export function previewsFor(stored: { cam: CamSource[]; files: string[] } | null, attached: SheetPhoto[], camWeb: ReadonlyMap<string, string>): (Preview | null)[] {
  if (!stored) return [];
  if (stored.files.length === 0 && stored.cam.length === 0) return attached.map((p, i) => ({ page: i + 1, url: p.url, href: p.url, name: p.name, from: "quote" }));
  const pages = Math.max(stored.files.length, stored.cam.length);
  return Array.from({ length: pages }, (_, i) => {
    const copy = stored.files[i] ? attached.find((p) => p.name === stored.files[i]) : undefined;
    if (copy) return { page: i + 1, url: copy.url, href: copy.url, name: copy.name, from: "quote" };
    const cam = stored.cam[i];
    const web = cam ? camWeb.get(cam.id) : undefined;
    if (cam && web) return { page: i + 1, url: web, href: cam.pageUrl ?? web, name: `CompanyCam photo ${cam.id}`, from: "companycam" };
    return null;
  });
}

/** The CompanyCam photos a preview still needs: pages drawn from CompanyCam whose copy isn't on the quote. */
export function camStillNeeded(stored: { cam: CamSource[]; files: string[] } | null, attached: SheetPhoto[]): string[] {
  if (!stored) return [];
  return stored.cam.filter((c, i) => !(stored.files[i] && attached.some((p) => p.name === stored.files[i]))).map((c) => c.id);
}
