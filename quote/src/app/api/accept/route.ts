import { NextResponse } from "next/server";
import { acceptByLink, acceptKeyOk } from "@/lib/accept/accept";

/**
 * Called by the customer deployment's server when a customer taps Accept (2026-10-27), never by a
 * browser. The proxy lets this one path through without a sign-in; the shared key in the x-quote-key
 * header is checked here and again in the function it calls.
 *
 *   POST {token, store, userAgent, input: {optionIndex, addOns, name, terms, signature}}
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const key = req.headers.get("x-quote-key");
  if (!acceptKeyOk(key)) return NextResponse.json({ ok: false, message: "Wrong or missing key." }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Send JSON." }, { status: 400 });
  }
  try {
    const r = await acceptByLink(key, body);
    if (!r.ok) return NextResponse.json({ ok: false, message: r.message, problems: r.problems ?? [] }, { status: r.status });
    return NextResponse.json({ ok: true, on: r.acceptance.on, option: r.acceptance.option.name });
  } catch (e) {
    console.error("accept", e);
    return NextResponse.json({ ok: false, message: "Something went wrong recording your acceptance. Please try again, or call us." }, { status: 502 });
  }
}
