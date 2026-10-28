import { NextResponse, type NextRequest } from "next/server";
import { isQuoter, quoterAllowlist } from "@/lib/access";
import { signedInEmail } from "@/lib/auth";
import { isCustomerDeployment } from "@/lib/mode";
import { readSiteSheet, type PhotoIn } from "@/lib/quotes/sitesheet";

export const runtime = "nodejs";
// Claude reading two pages of handwriting takes a while.
export const maxDuration = 120;

/**
 * Upload site sheet (2026-10-28): a signed-in quoter sends photos of the stair site sheet (shrunk in the
 * browser to stay under Vercel's 4.5 MB request limit); they are read into fields and kept on the quote.
 * Staff app only, behind sign-in like every other path; readSiteSheet() checks the quoter again.
 */
export async function POST(request: NextRequest) {
  if (isCustomerDeployment()) return new NextResponse("Not found", { status: 404 });
  const email = await signedInEmail();
  if (!email || !isQuoter(email, quoterAllowlist())) return NextResponse.json({ ok: false, message: "Sign in first." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, message: "That didn't come through. Try again." }, { status: 400 });
  const quoteRecordId = String(form.get("quoteRecordId") ?? "");
  const seen = String(form.get("seen") ?? "");
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const photos: PhotoIn[] = await Promise.all(files.map(async (f) => ({ name: f.name || "photo", type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })));
  const result = await readSiteSheet(quoteRecordId, seen, photos);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
