"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { editAddressAction } from "@/app/q/[id]/actions";

export type SavedAddress = { address: string; city: string; addressStatus: string };

/**
 * Change the quote's address in the app (Albert, 2026-10-27). It is written to the GHL contact and
 * the linked opportunity's Project Address first, then to the quote; nothing changes unless GHL
 * took it. `onSaved` lets the editor show the new address without leaving; the quote page reloads.
 */
export function EditAddress({
  quoteRecordId,
  address,
  city,
  confirmed,
  onSaved,
}: {
  quoteRecordId: string;
  address: string | null;
  city: string | null;
  confirmed: boolean;
  onSaved?: (saved: SavedAddress) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [street, setStreet] = useState(address ?? "");
  const [town, setTown] = useState(city ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  function start() {
    setStreet(address ?? "");
    setTown(city ?? "");
    setError(null);
    setOpen(true);
  }

  function save() {
    setError(null);
    startSave(async () => {
      const r = await editAddressAction(quoteRecordId, { address: address ?? "", city: city ?? "" }, { address: street, city: town });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setOpen(false);
      if (onSaved) onSaved({ address: r.address, city: r.city, addressStatus: r.addressStatus });
      else router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" className="chip-btn ca-open" onClick={start}>
        {address ? "Edit address" : "Add address"}
      </button>
    );
  }
  return (
    <form
      className="ca ea"
      aria-label="Change the site address"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="ea-fields">
        <label>
          Street address
          <input className="cell-in" value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="off" maxLength={200} autoFocus />
        </label>
        <label>
          City
          <input className="cell-in" value={town} onChange={(e) => setTown(e.target.value)} autoComplete="off" maxLength={80} />
        </label>
      </div>
      <p className="faint">
        Saved to the GHL contact and the opportunity&apos;s Project Address, then here.
        {confirmed ? " The site stays confirmed." : " It stays unconfirmed until it is checked with the customer."}
      </p>
      {error && (
        <p className="ca-err" role="alert">
          {error}
        </p>
      )}
      <div className="ca-btns">
        <button type="button" className="btn small" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn small primary" disabled={saving}>
          {saving ? "Saving…" : "Save address"}
        </button>
      </div>
    </form>
  );
}
