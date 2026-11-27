import { NextResponse } from "next/server";
import { followUpKeyOk } from "@/lib/quotes/followup";
import { runPaymentReminders } from "@/lib/quotes/paymentRequest";

/**
 * The automatic payment reminder (Albert, 2026-11-27, step 2b), called hourly by .github/workflows/quote-followups.yml,
 * never by a browser. The proxy lets /api/followups through without a sign-in; the key in x-quote-key
 * (QUOTE_FOLLOWUP_KEY) is checked here and again in runPaymentReminders.
 *
 *   POST {}  → send the reminders due now
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const key = req.headers.get("x-quote-key");
  if (!followUpKeyOk(key)) return NextResponse.json({ ok: false, message: "Wrong or missing key." }, { status: 401 });
  try {
    const r = await runPaymentReminders(key);
    return r.ok ? NextResponse.json(r) : NextResponse.json({ ok: false, message: r.message }, { status: r.status });
  } catch (e) {
    console.error("payment reminders", e);
    return NextResponse.json({ ok: false, message: "Payment reminders failed." }, { status: 502 });
  }
}
