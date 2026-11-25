import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { isCustomerDeployment } from "@/lib/mode";
import { runProjectWeek, type RunScope } from "@/lib/projectWeek/run";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Installer Project Week (Albert, 2026-11-24; vault `05_decisions/2026-11-24-installer-project-week-boards`). A path
 * without a sign-in, like /api/followups: the Notion buttons and the nightly cron call it, and every call checks
 * QUOTE_PROJECT_WEEK_KEY first (constant-time; unset = off).
 *
 * - POST `?scope=all`: the Send Project Week button on Project Preparation. Rebuilds every page, texts everyone with
 *   upcoming jobs and something new since their last text, or a first text (2026-11-25).
 * - POST `?scope=one`: the Send my week button on a Titan Team row. Notion sends that row as `data`; only its id is
 *   used, and it must be a Titan Team row.
 * - POST `?scope=weekly` / `?scope=headsup` (2026-11-25): the Friday 3 pm send and the hourly 3-day heads-up, called by
 *   `.github/workflows/quote-project-week.yml` with the same key.
 * - GET: the nightly rebuild (Vercel cron, `Authorization: Bearer <CRON_SECRET>`). Texts nobody.
 *
 * Notion's button sends the key in the `x-project-week-key` header (set on the button's webhook action). A run reads
 * several databases one request at a time, longer than Notion's button waits, so a POST answers 202 at once and runs
 * after the reply (2026-11-24: "button failed to execute"); what it did is in the function's log.
 */

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function keyOk(request: NextRequest): boolean {
  const key = process.env.QUOTE_PROJECT_WEEK_KEY?.trim();
  if (!key) return false;
  return same(request.headers.get("x-project-week-key") ?? "", key);
}

export async function POST(request: NextRequest) {
  if (isCustomerDeployment()) return new NextResponse("Not found", { status: 404 });
  if (!keyOk(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const what = request.nextUrl.searchParams.get("scope");
  let scope: RunScope;
  if (what === "all") scope = { kind: "all" };
  // The Friday 3 pm send and the 3-day heads-up (2026-11-25), from .github/workflows/quote-project-week.yml. The run
  // checks the Toronto clock itself.
  else if (what === "weekly") scope = { kind: "weekly" };
  else if (what === "headsup") scope = { kind: "headsup" };
  else if (what === "one") {
    const body = (await request.json().catch(() => null)) as { data?: { id?: unknown } } | null;
    const id = typeof body?.data?.id === "string" ? body.data.id : "";
    if (!id) return NextResponse.json({ ok: false, message: "No Titan Team row in the request." }, { status: 400 });
    scope = { kind: "one", memberId: id };
  } else return NextResponse.json({ ok: false, message: "scope must be all, one, weekly or headsup." }, { status: 400 });
  after(async () => {
    try {
      console.log("project-week", JSON.stringify(await runProjectWeek(scope)));
    } catch (e) {
      console.error("project-week failed", e instanceof Error ? e.message.slice(0, 300) : typeof e);
    }
  });
  return NextResponse.json({ ok: true, started: scope.kind }, { status: 202 });
}

export async function GET(request: NextRequest) {
  if (isCustomerDeployment()) return new NextResponse("Not found", { status: 404 });
  const cron = process.env.CRON_SECRET?.trim();
  if (!cron || !same(request.headers.get("authorization") ?? "", `Bearer ${cron}`)) return NextResponse.json({ ok: false }, { status: 401 });
  const result = await runProjectWeek({ kind: "rebuild" });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
