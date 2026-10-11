import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server client, used for the session only. The quoting app reads no Supabase tables yet:
 * quotes and rates come from Airtable through src/lib/airtable/client.ts.
 * Same Supabase project and Microsoft sign-in as the desk (web/); this app's own cookie.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot set cookies; the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}
