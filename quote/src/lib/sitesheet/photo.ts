/**
 * Browser only (2026-10-31): get a site sheet photo ready before it is shown or sent. iPhones save HEIC,
 * which desktop Chrome can't draw (the preview showed a broken image) and Claude doesn't take; and two
 * full-size photos together can pass Vercel's 4.5 MB request limit, which answers with no JSON at all
 * ("The server didn't answer"). So every photo becomes a JPEG at most `max` px on its long side, when it is
 * picked. Safari decodes HEIC itself; anywhere else the converter (libheif, `heic-to`) is loaded only when a
 * HEIC turns up. What can't be read goes as it is, and the server's type and size checks say why.
 */
import { shrinkImage } from "@/lib/bug/shrink";

/** A HEIC or HEIF photo, by type or, when the browser gives no type, by name. Pure. */
export const looksHeic = (f: { type: string; name: string }) => /^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

export async function preparePhoto(file: File, max = 2000, quality = 0.85): Promise<File> {
  if (!looksHeic(file)) return shrinkImage(file, max, quality);
  // Safari can draw HEIC, so the ordinary shrink works there and is quickest.
  const native = await shrinkImage(file, max, quality);
  if (native !== file) return native;
  try {
    const { heicTo } = await import("heic-to/next");
    const blob = await heicTo({ blob: file, type: "image/jpeg", quality });
    const jpeg = new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
    const small = await shrinkImage(jpeg, max, quality);
    return small;
  } catch {
    return file;
  }
}
