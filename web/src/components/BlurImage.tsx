"use client";

import Image from "next/image";
import { useMemo } from "react";
import { blurhashToDataURL } from "@/lib/blurhash";

/**
 * next/image with the custom Storage loader and a blurhash placeholder. `src` is any variant
 * URL from the views; the loader swaps the size suffix per requested width.
 */
export function BlurImage({ src, blurhash, alt, sizes, className, priority }: {
  src: string; blurhash: string | null | undefined; alt: string; sizes: string; className?: string; priority?: boolean;
}) {
  const blur = useMemo(() => blurhashToDataURL(blurhash), [blurhash]);
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      placeholder={blur ? "blur" : "empty"}
      blurDataURL={blur}
      className={className ?? "object-cover"}
    />
  );
}
