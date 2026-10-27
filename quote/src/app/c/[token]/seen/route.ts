import { after } from "next/server";
import { relayActivity } from "@/lib/activity/relay";

/**
 * The customer's quote page reports that it was opened (2026-10-27): its beacon posts here once the
 * page is in view, and the report goes on to the staff app after the answer. Customer deployment
 * only. Always 204: the page has nothing to do with the answer.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ua = req.headers.get("user-agent");
  after(() => relayActivity(token, "open", ua));
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
