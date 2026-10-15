import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isQuoter, quoterAllowlist } from "@/lib/access";
import { isCustomerDeployment } from "@/lib/mode";

/** Pages a staff member reaches before signing in, and the booking step Make calls (it checks its own key). */
const OPEN_ON_STAFF = /^\/(login|auth\/|denied|api\/booking)/;
/** The only pages the customer deployment serves: customer links. */
const CUSTOMER_PAGES = /^\/c\/[A-Za-z0-9]+(\/[^/]+)?$/;

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });

/**
 * Next 16 proxy. On the customer deployment it serves customer links and nothing else. On the
 * staff app it refreshes the Supabase session, sends anonymous visitors to /login and signed-in
 * people who are not on QUOTE_ALLOWED_EMAILS to /denied; customer links 404 there. The page
 * loaders check again (src/lib/auth.ts), so this is the first lock, not the only one.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (isCustomerDeployment()) return CUSTOMER_PAGES.test(path) ? NextResponse.next() : notFound();
  if (path.startsWith("/c/")) return notFound();
  if (OPEN_ON_STAFF.test(path)) return NextResponse.next();

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
  // Everything except static assets. Which paths need no sign-in is decided above, in code,
  // because it depends on which deployment this is.
  matcher: ["/((?!_next/|favicon\\.ico|robots\\.txt).*)"],
};
