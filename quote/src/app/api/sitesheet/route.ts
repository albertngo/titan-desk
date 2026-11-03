import { NextResponse, type NextRequest } from "next/server";
import { isQuoter, quoterAllowlist } from "@/lib/access";
import { signedInEmail } from "@/lib/auth";
import { isCustomerDeployment } from "@/lib/mode";
import { readFromCompanyCam, readSiteSheet, type PhotoIn } from "@/lib/quotes/sitesheet";

export const runtime = "nodejs";
// Claude reading two pages of handwriting takes a while.
export const maxDuration = 120;

/**
 * Read a site sheet (2026-10-28): a signed-in quoter sends photos of the stair site sheet (shrunk in the
 * browser to stay under Vercel's 4.5 MB request limit); they are read into fields and kept on the quote.
 * Since 2026-11-03 a JSON body instead names photos on the job's CompanyCam project and which sheet they are
 * (`kind`: stairs or flooring); the server downloads them itself. Staff app only, behind sign-in like every
 * other path; the readers check the quoter again.
 */
export async function POST(request: NextRequest) {
  if (isCustomerDeployment()) return new NextResponse("Not found", { status: 404 });
  const email = await signedInEmail();
  if (!email || !isQuoter(email, quoterAllowlist())) return NextResponse.json({ ok: false, message: "Sign in first." }, { status: 401 });
  if ((request.headers.get("content-type") ?? "").startsWith("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, message: "That didn't come through. Try again." }, { status: 400 });
    const kind = body.kind === "flooring" ? "flooring" : "stairs";
    const result = await readFromCompanyCam(String(body.quoteRecordId ?? ""), String(body.seen ?? ""), body.photoIds, kind);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, message: "That didn't come through. Try again." }, { status: 400 });
  const quoteRecordId = String(form.get("quoteRecordId") ?? "");
  const seen = String(form.get("seen") ?? "");
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const photos: PhotoIn[] = await Promise.all(files.map(async (f) => ({ name: f.name || "photo", type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })));
  const result = await readSiteSheet(quoteRecordId, seen, photos);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
