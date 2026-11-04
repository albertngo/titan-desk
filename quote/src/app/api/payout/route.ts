import { NextResponse, type NextRequest } from "next/server";
import { isQuoter, quoterAllowlist } from "@/lib/access";
import { signedInEmail } from "@/lib/auth";
import { isCustomerDeployment } from "@/lib/mode";
import { pushPayoutCard } from "@/lib/quotes/payouts";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Push a payout card to the job's CompanyCam project (2026-11-04): a signed-in quoter sends the card's id and its
 * picture (a JPEG drawn in the browser from the saved card). A route, not a server action, because the picture is
 * larger than a server action takes. Staff app only, behind sign-in; the writer checks the quoter again.
 */
export async function POST(request: NextRequest) {
  if (isCustomerDeployment()) return new NextResponse("Not found", { status: 404 });
  const email = await signedInEmail();
  if (!email || !isQuoter(email, quoterAllowlist())) return NextResponse.json({ ok: false, message: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, message: "That didn't come through. Try again." }, { status: 400 });
  const result = await pushPayoutCard(String(body.quoteRecordId ?? ""), String(body.seen ?? ""), String(body.cardId ?? ""), String(body.image ?? ""));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
