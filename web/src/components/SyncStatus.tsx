"use client";

import { useEffect, useState } from "react";
import { getSyncStatus } from "@/lib/db/queries";
import type { SyncStatusRow } from "@/lib/db/types";
import { hoursSince, timeShort } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

const STALE_HOURS = 2;
const COOLDOWN_MS = 5 * 60 * 1000;

/** "Data as of 14:32" (Campfire when the last successful sync is older than 2 h) + "Sync now", on the denim bar. */
export function SyncStatus() {
  const [status, setStatus] = useState<SyncStatusRow | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    getSyncStatus(supabase).then(setStatus).catch(() => setStatus(null));
  }, []);

  const stale = status !== null && hoursSince(status.last_success_at) > STALE_HOURS;
  const running = status?.last_status === "running";

  async function syncNow() {
    if (status?.last_started_at && Date.now() - new Date(status.last_started_at).getTime() < COOLDOWN_MS) {
      setMsg("A sync started less than 5 minutes ago");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/sync/trigger", { method: "POST" });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg(r.ok ? "Sync queued, ~2 minutes" : body.error ?? `Failed (${r.status})`);
    } catch {
      setMsg("Failed to reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={stale ? "rounded-full bg-campfire px-2.5 py-1 font-medium text-cream" : "hidden text-cream/70 md:inline"}
        title={status?.last_status ?? undefined}
      >
        {status ? `Data as of ${timeShort(status.last_success_at)}` : "…"}
        {running ? " · syncing" : ""}
      </span>
      <button
        type="button"
        onClick={syncNow}
        disabled={busy}
        className="whitespace-nowrap rounded-full border border-cream/30 px-3 py-1.5 font-medium text-cream transition-colors hover:bg-cream/10 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
      >
        <span className="sm:hidden">Sync</span>
        <span className="hidden sm:inline">Sync now</span>
      </button>
      {msg && <span className="hidden text-cream/80 lg:inline" role="status">{msg}</span>}
      <form action="/auth/signout" method="post">
        <button type="submit" className="hidden rounded-full px-2 py-1.5 text-cream/60 transition-colors hover:text-cream sm:inline">Sign out</button>
      </form>
    </div>
  );
}
