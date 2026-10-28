import { NextResponse, type NextRequest } from "next/server";
import { bugReportsOn, createTask, uploadImage } from "@/lib/bug/notion";
import { checkReport, deviceOf, pageOf, taskBody, type Urgency } from "@/lib/bug/report";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const preferredRegion = "yul1";

/**
 * Report a bug (2026-10-28): signed-in staff send a summary, how urgent it is and up to five
 * screenshots; this makes Albert a Tactical Task with them on the page. The only Notion write in
 * the desk, through src/lib/bug/notion.ts.
 */
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  if (!data?.claims || typeof email !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!bugReportsOn()) return NextResponse.json({ error: "Report a bug isn't set up yet." }, { status: 503 });
  const meta = (data.claims as { user_metadata?: Record<string, unknown> }).user_metadata ?? {};
  const name = [meta.full_name, meta.name].find((v) => typeof v === "string" && v.trim() && !v.includes("@"));

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
          app: "Catalogue",
          summary: String(summary),
          urgency: urgency as Urgency,
          page: pageOf(form.get("page"), request.headers.get("host")),
          reporter: { email, name: typeof name === "string" ? name.trim() : null },
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
