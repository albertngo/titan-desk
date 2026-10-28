"use client";

import { useEffect, useState } from "react";
import { ShortcutIcon } from "@/components/askbert/ShortcutIcon";
import { BlurImage } from "@/components/BlurImage";
import type { ImageVariant } from "@/lib/db/types";

const KIND: Record<string, string> = { swatch: "Swatch", room: "Room scene", detail: "Close-up" };

/** The product's photos: one large, thumbnails beneath, tap for full screen (Escape or × closes). */
export function ImageGallery({ images, alt }: { images: ImageVariant[]; alt: string }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") setI((n) => (n + 1) % images.length);
      if (e.key === "ArrowLeft") setI((n) => (n - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length]);

  if (!images.length) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl bg-peach">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/brand/titan-mascot-blue.png" alt="" className="h-16 w-16 object-contain opacity-30" />
        <p className="text-sm text-ink/55">No photos yet</p>
      </div>
    );
  }
  const cur = images[Math.min(i, images.length - 1)];
  return (
    <div>
      <button type="button" aria-label={`Open ${KIND[cur.kind] ?? cur.kind} full screen`}
        className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-peach focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-denim"
        onClick={() => setOpen(true)}>
        {cur.card && <BlurImage src={cur.full ?? cur.card} blurhash={cur.blurhash} alt={alt} sizes="(min-width: 768px) 480px, 100vw" priority
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" />}
        <span className="absolute bottom-3 left-3 rounded-md bg-ink/70 px-2 py-1 text-[11px] font-medium text-cream backdrop-blur">
          {KIND[cur.kind] ?? cur.kind}{cur.low_res ? " · low-res" : ""}
        </span>
        {images.length > 1 && (
          <span className="absolute bottom-3 right-3 rounded-md bg-ink/70 px-2 py-1 text-[11px] font-medium tabular-nums text-cream backdrop-blur">
            {i + 1} / {images.length}
          </span>
        )}
      </button>
      {images.length > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {images.map((im, idx) => (
            <button
              key={`${im.kind}-${im.sort}-${idx}`}
              type="button"
              onClick={() => setI(idx)}
              aria-label={`${KIND[im.kind] ?? im.kind} ${idx + 1}`}
              aria-current={idx === i ? "true" : undefined}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-peach transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim ${
                idx === i ? "ring-2 ring-denim ring-offset-1 ring-offset-cream" : "opacity-80 hover:opacity-100"}`}
            >
              {im.thumb && <BlurImage src={im.thumb} blurhash={im.blurhash} alt="" sizes="56px" />}
            </button>
          ))}
        </div>
      )}
      {open && cur.full && (
        <div className="fixed inset-0 z-40 bg-ink/95" role="dialog" aria-modal="true" aria-label={alt} onClick={() => setOpen(false)}>
          <div className="relative h-full w-full">
            <BlurImage src={cur.full} blurhash={cur.blurhash} alt={alt} sizes="100vw" className="object-contain" />
          </div>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)}
            className="pt-safe absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-cream/15 text-cream backdrop-blur hover:bg-cream/25">
            <ShortcutIcon name="close" className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
}
