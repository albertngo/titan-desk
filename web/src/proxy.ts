import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next 16 proxy (formerly middleware): refresh the Supabase session cookie on every
 * app request and send anonymous visitors to /login.
 *
 * The matcher EXCLUDES everything a browser fetches without cookies or before sign-in:
 * the PWA manifest, service worker, icons, offline page, login and auth callbacks.
 * Redirecting the manifest to /login would make the app uninstallable.
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

  // getClaims() verifies the JWT locally (no Auth server round trip on every navigation).
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = request.nextUrl.pathname === "/" ? "" : `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except: static assets, the manifest, the service worker, icons, offline page,
    // login, auth callbacks, and the sync trigger (which does its own auth for secret callers).
    "/((?!_next/|manifest\\.webmanifest|sw\\.js|swe-worker|icons/|offline|login|auth/|api/sync/trigger|favicon\\.ico|apple-touch-icon|robots\\.txt).*)",
  ],
};
