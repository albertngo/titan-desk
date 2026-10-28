import { NextResponse, type NextRequest } from "next/server";
import { isQuoter, quoterAllowlist } from "@/lib/access";
import { requireQuoterPerson, signedInEmail } from "@/lib/auth";
import { bugReportsOn, createTask, uploadImage } from "@/lib/bug/notion";
import { checkReport, deviceOf, pageOf, taskBody, type Urgency } from "@/lib/bug/report";
import { isCustomerDeployment } from "@/lib/mode";

export const runtime = "nodejs";

/**
 * Report a bug (2026-10-28): a signed-in quoter sends a summary, how urgent it is and up to five
 * screenshots; this makes Albert a Tactical Task with them on the page. Staff app only.
 */
export async function POST(request: NextRequest) {
  if (isCustomerDeployment()) return new NextResponse("Not found", { status: 404 });
  const email = await signedInEmail();
  if (!email || !isQuoter(email, quoterAllowlist())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!bugReportsOn()) return NextResponse.json({ error: "Report a bug isn't set up yet." }, { status: 503 });
  const person = await requireQuoterPerson();

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "That didn't come through. Try again." }, { status: 400 });
  const images = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const summary = form.get("summary");
  const urgency = form.get("urgency");
  const problem = checkReport({ summary, urgency, images });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const uploads: string[] = [];
  let failed = 0;
  for (const f of images) {
    try {
      uploads.push(await uploadImage(f));
    } catch {
      failed++;
    }
  }
  try {
    const url = await createTask(
      taskBody(
        {
          app: "Quotes",
          summary: String(summary),
          urgency: urgency as Urgency,
          page: pageOf(form.get("page"), request.headers.get("host")),
          reporter: person,
          at: new Date(),
          device: deviceOf(request.headers.get("user-agent")),
          screen: typeof form.get("screen") === "string" ? String(form.get("screen")).slice(0, 20) : null,
        },
        uploads,
        failed,
      ),
    );
    return NextResponse.json({ ok: true, url, failed });
  } catch {
    return NextResponse.json({ error: "Notion didn't take it. Try again in a minute, or tell Albert directly." }, { status: 502 });
  }
}
