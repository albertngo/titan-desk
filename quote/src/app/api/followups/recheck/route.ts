import { NextResponse } from "next/server";
import { followUpKeyOk, runRecheck } from "@/lib/quotes/followup";

/**
 * The twice-a-day recheck (Albert, 2026-11-13), called by .github/workflows/quote-recheck.yml, never by a browser. The
 * proxy lets /api/followups through without a sign-in; the key in x-quote-key (QUOTE_FOLLOWUP_KEY) is checked here and
 * again in runRecheck. It rewrites briefs and looks for prices given by text or on a call. It sends nothing.
 *
 *   POST {}  → recheck every open quote's conversation
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const key = req.headers.get("x-quote-key");
  if (!followUpKeyOk(key)) return NextResponse.json({ ok: false, message: "Wrong or missing key." }, { status: 401 });
  try {
    const r = await runRecheck(key);
    return r.ok ? NextResponse.json(r) : NextResponse.json({ ok: false, message: r.message }, { status: r.status });
  } catch (e) {
    console.error("recheck", e);
    return NextResponse.json({ ok: false, message: "Recheck failed." }, { status: 502 });
  }
}
