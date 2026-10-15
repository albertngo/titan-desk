"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmAddressAction } from "@/app/q/[id]/actions";

/**
 * Confirm an unconfirmed address by hand, after checking it with the customer. Two steps on
 * purpose: the second shows exactly which address is being confirmed and where it goes.
 */
export function ConfirmAddress({ quoteRecordId, address, city, linked }: { quoteRecordId: string; address: string; city: string | null; linked: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const where = [address, city].filter(Boolean).join(", ");

  function confirm() {
    setError(null);
    startSave(async () => {
      const r = await confirmAddressAction(quoteRecordId, address);
      if (r.ok) {
        setAsking(false);
        router.refresh();
      } else setError(r.message);
    });
  }

  if (!asking) {
    return (
      <button type="button" className="chip-btn ca-open" onClick={() => setAsking(true)}>
        Confirm address
      </button>
    );
  }
  return (
    <div className="ca" role="group" aria-label="Confirm the site address">
      <p>
        Confirm <b>{where}</b> as the site for this quote?
        <span className="faint"> {linked ? "It is also written to the GHL opportunity's Project Address." : "Its GHL opportunity gets it when the quote is linked."}</span>
      </p>
      {error && <p className="ca-err" role="alert">{error}</p>}
      <div className="ca-btns">
        <button type="button" className="btn small" onClick={() => { setAsking(false); setError(null); }} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn small primary" onClick={confirm} disabled={saving}>
          {saving ? "Confirming…" : "Yes, confirm"}
        </button>
      </div>
    </div>
  );
}
