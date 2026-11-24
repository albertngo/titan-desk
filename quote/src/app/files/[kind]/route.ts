import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { isQuoter, quoterAllowlist } from "@/lib/access";
import { signedInEmail } from "@/lib/auth";
import { isAirtableFile } from "@/lib/accept/terms";
import { companyDocFor } from "@/lib/files/live";
import { sheetFor } from "@/lib/files/sheets";
import { isCustomerDeployment } from "@/lib/mode";

export const runtime = "nodejs";

/**
 * Company files (2026-11-07): the newest printable site sheet of one kind, `/files/flooring` or
 * `/files/stair`, as a download. Staff only: the proxy already asks for a sign-in, and this checks again;
 * the customer deployment never serves it. The file is chosen by `sheetFor()` from this build's own list,
 * never from a path in the request. `next.config.ts` traces `sheets/*.pdf` into this route.
 *
 * The live documents (2026-11-23: warranty, insurance, Project Expectations) are matched by kind against the
 * Company Files list (`companyDocFor()`), and their PDF is fetched fresh from Airtable's file host, whose
 * addresses expire within hours, then passed through. Never a link to Airtable, never an address from the request.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  if (isCustomerDeployment()) return new NextResponse("Not found", { status: 404 });
  const email = await signedInEmail();
  if (!email || !isQuoter(email, quoterAllowlist())) return new NextResponse("Sign in first.", { status: 401 });
  const { kind } = await params;
  const sheet = sheetFor(kind);
  if (!sheet) return liveDoc(kind);
  let body: Buffer;
  try {
    body = await readFile(join(process.cwd(), "sheets", sheet.file));
  } catch {
    return new NextResponse("That file isn't in this build.", { status: 404 });
  }
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sheet.downloadName}"`,
      "Content-Length": String(body.length),
    },
  });
}

async function liveDoc(kind: string): Promise<Response> {
  const doc = await companyDocFor(kind);
  if (!doc || !isAirtableFile(doc.pdfUrl)) return new NextResponse("Not found", { status: 404 });
  const res = await fetch(doc.pdfUrl, { cache: "no-store" }).catch(() => null);
  if (!res?.ok || !res.body) return new NextResponse("That file can't be opened right now. Try again in a minute.", { status: 502 });
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${doc.downloadName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
