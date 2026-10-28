/**
 * Browser only (Report a bug, 2026-10-28): shrinks a screenshot to at most 1600 px on its long
 * side as JPEG, so five of them stay under Vercel's request limit. Anything it can't read (an
 * odd format, an old browser) goes as it is, and the server's size check has the last word.
 * The same file lives in quote/ and web/.
 */
export async function shrinkImage(file: File, max = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "screenshot"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
