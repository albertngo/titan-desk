import { NextResponse } from "next/server";
import { bookingKeyOk, bookQuote, recordBookingLinks } from "@/lib/quotes/booking";

/**
 * Called by Make 3453735 when an appointment is booked, never by a browser. The proxy lets this
 * one path through without a sign-in; the shared key in the x-quote-key header is checked here
 * and again in every function it calls.
 *
 *   POST {opportunityId, contactId}                      → find or start the quote, return its name
 *   POST {step: "links", quoteRecordId, opportunityId,
 *         folderUrl?, companyCamUrl?}                    → put the folder / CompanyCam links on it
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const key = req.headers.get("x-quote-key");
  if (!bookingKeyOk(key)) return NextResponse.json({ ok: false, message: "Wrong or missing key." }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Send JSON." }, { status: 400 });
  }
  try {
    if ((body as { step?: unknown })?.step === "links") {
      const r = await recordBookingLinks(key, body);
      return r.ok ? NextResponse.json(r) : NextResponse.json({ ok: false, message: r.message }, { status: r.status });
    }
    const r = await bookQuote(key, body);
    if (!r.ok) return NextResponse.json({ ok: false, message: r.message }, { status: r.status });
    const appUrl = r.versionId ? new URL(`/q/${r.versionId}`, req.url).toString() : null;
    return NextResponse.json({ ...r, appUrl });
  } catch (e) {
    console.error("booking", e);
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message.slice(0, 200) : "Booking step failed." }, { status: 502 });
  }
}
