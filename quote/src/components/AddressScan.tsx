"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { scanAddressesAction } from "@/app/actions/address";
import type { AddressHeldReason, AddressScanQuote, AddressScanResult } from "@/lib/quotes/types";

/**
 * Address arrived (Albert, 2026-10-27). Once the page has drawn, the server reads the messages of
 * quotes still waiting for an address (src/lib/quotes/address.ts) and the page redraws if any was
 * filled. Shows nothing unless an address was filled or needs a person. `skip` (a quote that already
 * has its address) asks nothing; the component stays mounted so its banner survives the redraw.
 */

const HELD: Record<AddressHeldReason, string> = {
  several: "their messages give more than one address. Read them and put the right one on the GHL contact.",
  unlinked: "their messages give an address, but the quote isn't linked to an opportunity yet. Link it and the address fills itself.",
  jobs: "their messages give an address, but they have more than one quote waiting for one. Put it on the GHL contact, then confirm it on the right quote.",
};

function Who({ q, here }: { q: AddressScanQuote; here: boolean }) {
  const label = [q.quoteNumber, q.customer].filter(Boolean).join(" · ") || "A quote";
  return here || !q.versionId ? <b>{label}</b> : <Link href={`/q/${q.versionId}`}><b>{label}</b></Link>;
}

export function AddressScan({ quoteRecordId = null, skip = false }: { quoteRecordId?: string | null; skip?: boolean }) {
  const router = useRouter();
  const asked = useRef(false);
  const [result, setResult] = useState<AddressScanResult | null>(null);

  useEffect(() => {
    if (asked.current || skip) return;
    asked.current = true;
    scanAddressesAction(quoteRecordId)
      .then((r) => {
        setResult(r);
        if (r.ok && (r.filled.length > 0 || r.synced > 0)) router.refresh();
      })
      .catch(() => undefined);
  }, [quoteRecordId, skip, router]);

  if (!result?.ok || (result.filled.length === 0 && result.held.length === 0)) return null;
  const here = quoteRecordId !== null;
  return (
    <div className="addr-scan" role="status">
      {result.filled.map((q, i) => (
        <p key={`f${i}`} className="banner ok">
          Address arrived for <Who q={q} here={here} />: {q.address}. It is on the GHL contact now; {here ? "press Confirm address once it looks right." : "open the quote and press Confirm address."}
        </p>
      ))}
      {result.held.map((q, i) => (
        <p key={`h${i}`} className="banner warn">
          <Who q={q} here={here} />: {HELD[q.reason]}
        </p>
      ))}
    </div>
  );
}
