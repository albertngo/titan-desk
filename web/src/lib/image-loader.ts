"use client";

import type { ImageLoaderProps } from "next/image";

/**
 * next/image custom loader. Every image URL from the views ends in `_{200|600|1600}.webp?v=N`;
 * pick the smallest pre-generated variant that covers the requested width and return the
 * Storage CDN URL as-is (no Vercel optimizer, immutable caching, service-worker CacheFirst).
 */
export function variantFor(width: number): 200 | 600 | 1600 {
  if (width <= 200) return 200;
  if (width <= 600) return 600;
  return 1600;
}

const VARIANT_RE = /_(200|600|1600)\.webp(\?v=\d+)?$/;

export default function storageImageLoader({ src, width }: ImageLoaderProps): string {
  if (!VARIANT_RE.test(src)) return src;
  return src.replace(VARIANT_RE, (_m, _size, v) => `_${variantFor(width)}.webp${v ?? ""}`);
}
