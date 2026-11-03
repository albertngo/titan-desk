"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { camSheetPhotosAction } from "@/app/q/[id]/actions";
import type { CamSheetPhoto } from "@/lib/quotes/types";
import { camStillNeeded, previewsFor, type CamSource, type Preview, type SheetPhoto } from "@/lib/sitesheet/source";

/**
 * The photo each page of a read sheet is checked against (Albert, 2026-11-03: "a preview of the uploaded photo that
 * it's comparing against"): its copy on the quote, else the CompanyCam photo it was drawn from. A just-drawn sheet
 * already has those photos from the picker; after a reload they are asked of CompanyCam once, only when a copy is
 * missing. Rules in `previewsFor()` (`src/lib/sitesheet/source.ts`).
 */
export function useSheetPreviews(quoteRecordId: string, stored: { cam: CamSource[]; files: string[] } | null, attached: SheetPhoto[], camLinked: boolean) {
  const [camWeb, setCamWeb] = useState<ReadonlyMap<string, string>>(new Map());
  const asked = useRef(new Set<string>());

  const remember = useCallback((picked: CamSheetPhoto[]) => {
    if (picked.length) setCamWeb((m) => new Map([...m, ...picked.map((p) => [p.id, p.web] as const)]));
  }, []);

  const key = useMemo(() => camStillNeeded(stored, attached).filter((id) => !camWeb.has(id)).join(","), [stored, attached, camWeb]);

  useEffect(() => {
    if (!camLinked || !key) return;
    const ids = key.split(",").filter((id) => !asked.current.has(id));
    if (ids.length === 0) return;
    ids.forEach((id) => asked.current.add(id));
    // Asked once per photo: an answer that lands after the page moved on still fills the map.
    camSheetPhotosAction(quoteRecordId)
      .then((r) => {
        if (!r?.ok || !Array.isArray(r.photos)) return;
        const want = new Set(ids);
        remember(r.photos.filter((p) => want.has(p.id)));
      })
      .catch(() => {
        // No preview from CompanyCam: the page says so and its CompanyCam link still opens it.
      });
  }, [camLinked, key, quoteRecordId, remember]);

  const previews: (Preview | null)[] = useMemo(() => previewsFor(stored, attached, camWeb), [stored, attached, camWeb]);
  return { previews, remember };
}
