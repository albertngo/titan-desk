import { NextResponse } from "next/server";
import { activityKeyOk, noteSummaries, recordActivity } from "@/lib/quotes/activity";

/**
 * Open tracking (2026-10-27), called by the customer deployment and a daily GitHub Actions run,
 * never by a browser. The proxy lets this path through without a sign-in; the shared key in the
 * x-quote-key header is checked here and again in every function it calls.
 *
 *   POST {token, kind: "open" | "pdf", device}   → count it; the first open posts a GHL comment
 *   POST {step: "summaries"}                      → the three-day summary comments
 */

export const dynamic = "force-dynamic";
// The daily run posts up to ten comments, each a few GHL and Airtable calls.
export const maxDuration = 60;

export async function POST(req: Request) {
  const key = req.headers.get("x-quote-key");
  if (!activityKeyOk(key)) return NextResponse.json({ ok: false, message: "Wrong or missing key." }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Send JSON." }, { status: 400 });
  }
  try {
    const r = (body as { step?: unknown })?.step === "summaries" ? await noteSummaries(key) : await recordActivity(key, body);
    return r.ok ? NextResponse.json(r) : NextResponse.json({ ok: false, message: r.message }, { status: r.status });
  } catch (e) {
    console.error("activity", e);
    return NextResponse.json({ ok: false, message: "Activity step failed." }, { status: 502 });
  }
}
