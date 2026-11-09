import { NextResponse } from "next/server";
import { followUpKeyOk, runAutoFollowUps } from "@/lib/quotes/followup";

/**
 * Stage 2 of the app's measured follow-ups (Albert, 2026-11-09), called hourly by
 * .github/workflows/quote-followups.yml, never by a browser. The proxy lets this path through without a sign-in; the
 * shared key in the x-quote-key header (QUOTE_FOLLOWUP_KEY) is checked here and again in runAutoFollowUps. It sends
 * nothing unless QUOTE_AUTO_FOLLOWUPS is "on", which is Albert's switch.
 *
 *   POST {}  → send the routine follow-ups that pass every guardrail (at most ten)
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const key = req.headers.get("x-quote-key");
  if (!followUpKeyOk(key)) return NextResponse.json({ ok: false, message: "Wrong or missing key." }, { status: 401 });
  try {
    const r = await runAutoFollowUps(key);
    return r.ok ? NextResponse.json(r) : NextResponse.json({ ok: false, message: r.message }, { status: r.status });
  } catch (e) {
    console.error("followups", e);
    return NextResponse.json({ ok: false, message: "Follow-up run failed." }, { status: 502 });
  }
}
