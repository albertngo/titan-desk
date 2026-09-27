import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const preferredRegion = "yul1";

const COOLDOWN_MS = 5 * 60 * 1000;

/**
 * "Sync now": fire a repository_dispatch that runs the incremental sync workflow.
 * Callers: a signed-in staff session (browser button) or the x-sync-secret header
 * (Airtable Automation, curl). GitHub's concurrency group dedupes anything more.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SYNC_TRIGGER_SECRET;
  const bySecret = !!secret && request.headers.get("x-sync-secret") === secret;

  let by = "secret";
  if (!bySecret) {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    by = (data.claims.email as string | undefined) ?? "staff";

    const { data: status } = await supabase.from("sync_status").select("last_started_at").maybeSingle();
    const last = status?.last_started_at ? new Date(status.last_started_at).getTime() : 0;
    if (Date.now() - last < COOLDOWN_MS) {
      return NextResponse.json({ error: "a sync started less than 5 minutes ago" }, { status: 429 });
    }
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_DISPATCH_REPO ?? "albertngo/titan-desk";
  if (!token) return NextResponse.json({ error: "GITHUB_DISPATCH_TOKEN is not configured" }, { status: 503 });

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type: "sync-requested", client_payload: { by, at: new Date().toISOString() } }),
  });
  if (res.status !== 204) {
    return NextResponse.json({ error: `GitHub responded ${res.status}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, queued: true }, { status: 202 });
}
