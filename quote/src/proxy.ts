import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isQuoter, quoterAllowlist } from "@/lib/access";

/**
 * Next 16 proxy: refresh the Supabase session on every request, send anonymous visitors to
 * /login, and send signed-in people who are not on QUOTE_ALLOWED_EMAILS to /denied.
 * The page loaders check again (src/lib/auth.ts), so this is the first lock, not the only one.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const url = request.nextUrl.clone();
  if (!data?.claims) {
    url.pathname = "/login";
    url.search = request.nextUrl.pathname === "/" ? "" : `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (!isQuoter(data.claims.email, quoterAllowlist())) {
    url.pathname = "/denied";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Everything except static assets, login, auth callbacks and the denied page.
  matcher: ["/((?!_next/|login|auth/|denied|favicon\\.ico|robots\\.txt).*)"],
};
