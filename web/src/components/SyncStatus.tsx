"use client";

import { useEffect, useState } from "react";
import { getSyncStatus } from "@/lib/db/queries";
import type { SyncStatusRow } from "@/lib/db/types";
import { hoursSince, timeShort } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

const STALE_HOURS = 2;
const COOLDOWN_MS = 5 * 60 * 1000;

/** "data as of 14:32" (red when the last successful sync is older than 2 h) + "Sync now". */
export function SyncStatus() {
  const [status, setStatus] = useState<SyncStatusRow | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    getSyncStatus(supabase).then(setStatus).catch(() => setStatus(null));
  }, []);

  const stale = hoursSince(status?.last_success_at ?? null) > STALE_HOURS;
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
      <span className={stale ? "rounded bg-red-100 px-1.5 py-0.5 text-red-800" : "text-zinc-500"} title={status?.last_status ?? undefined}>
        {status ? `data as of ${timeShort(status.last_success_at)}` : "…"}
        {running ? " · syncing" : ""}
      </span>
      <button
        type="button"
        onClick={syncNow}
        disabled={busy}
        className="rounded border border-zinc-300 bg-white px-2 py-0.5 disabled:opacity-50"
      >
        Sync now
      </button>
      {msg && <span className="text-zinc-600">{msg}</span>}
      <form action="/auth/signout" method="post">
        <button type="submit" className="text-zinc-400">Sign out</button>
      </form>
    </div>
  );
}
