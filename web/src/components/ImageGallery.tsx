"use client";

import { useState } from "react";
import { BlurImage } from "@/components/BlurImage";
import type { ImageVariant } from "@/lib/db/types";

export function ImageGallery({ images, alt }: { images: ImageVariant[]; alt: string }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  if (!images.length) {
    return <div className="flex h-40 items-center justify-center rounded-xl bg-zinc-100 text-sm text-zinc-400">No photos yet</div>;
  }
  const cur = images[Math.min(i, images.length - 1)];
  return (
    <div>
      <button type="button" className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-zinc-100" onClick={() => setOpen(true)}>
        {cur.card && <BlurImage src={cur.card} blurhash={cur.blurhash} alt={alt} sizes="(max-width: 768px) 100vw, 768px" priority />}
        <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
          {cur.kind}{cur.low_res ? " · low-res" : ""}
        </span>
      </button>
      {images.length > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          {images.map((im, idx) => (
            <button
              key={`${im.kind}-${im.sort}-${idx}`}
              type="button"
              onClick={() => setI(idx)}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100 ${idx === i ? "ring-2 ring-zinc-900" : ""}`}
              aria-label={`${im.kind} ${im.sort + 1}`}
            >
              {im.thumb && <BlurImage src={im.thumb} blurhash={im.blurhash} alt="" sizes="56px" />}
            </button>
          ))}
        </div>
      )}
      {open && cur.full && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div className="relative h-full w-full">
            <BlurImage src={cur.full} blurhash={cur.blurhash} alt={alt} sizes="100vw" className="object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
