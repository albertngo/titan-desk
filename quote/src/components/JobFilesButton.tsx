"use client";

import { useState, useTransition } from "react";
import { requestJobFilesAction } from "@/app/q/[id]/actions";

/**
 * Create CompanyCam + folder (Albert, 2026-11-16): runs the booked steps for this quote from its page, for a job that
 * was never booked (a duplicate, a repeat unit). The site address is not confirmed by it.
 */
export function JobFilesButton({ versionId }: { versionId: string }) {
  const [busy, start] = useTransition();
  const [said, setSaid] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={busy || said?.ok === true}
        title="Make the CompanyCam project and the OneDrive job folder now, as a booking would. The site address stays unconfirmed."
        onClick={() => {
          if (!window.confirm("Make this quote's CompanyCam project and job folder now? The site address is not confirmed by this.")) return;
          setSaid(null);
          start(async () => setSaid(await requestJobFilesAction(versionId).catch(() => ({ ok: false, message: "That didn't go through. Try again in a moment." }))));
        }}
      >
        {busy ? "Asking…" : said?.ok ? "Asked for" : "Create CompanyCam + folder"}
      </button>
      {said && <p className={said.ok ? "note jf-note" : "note jf-note bad"} role="status">{said.message}</p>}
    </>
  );
}
