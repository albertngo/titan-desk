"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShortcutIcon } from "@/components/askbert/ShortcutIcon";
import { askBert } from "@/lib/askbert-bridge";

/** "Back": to the search or browse page staff came from (it keeps its URL state), else the shop. */
export function BackLink() {
  const router = useRouter();
  return (
    <Link
      href="/"
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-denim ring-1 ring-denim/15 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim"
    >
      <ShortcutIcon name="back" className="h-4 w-4" />
      Back
    </Link>
  );
}

/** Opens askBert on this product. */
export function AskBertButton({ sku }: { sku: string }) {
  return (
    <button
      type="button"
      onClick={() => askBert(`Tell me about ${sku}: price, promo, stock, and what it's good for.`)}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-denim ring-1 ring-denim/20 transition hover:ring-denim/50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img src="/brand/titan-mascot-blue.png" alt="" className="h-7 w-7 object-contain" />
      Ask Bert about this
    </button>
  );
}
