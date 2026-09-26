"use client";

import { decode } from "blurhash";

const cache = new Map<string, string>();

/** Decode a blurhash to a tiny data URL for next/image's blurDataURL (browser only). */
export function blurhashToDataURL(hash: string | null | undefined, w = 32, h = 32): string | undefined {
  if (!hash || typeof document === "undefined") return undefined;
  const key = `${hash}:${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const pixels = decode(hash, w, h);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const img = ctx.createImageData(w, h);
    img.data.set(pixels);
    ctx.putImageData(img, 0, 0);
    const url = canvas.toDataURL();
    cache.set(key, url);
    return url;
  } catch {
    return undefined;
  }
}
