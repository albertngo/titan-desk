/**
 * Route auth for askBert: the staff member's existing Microsoft 365 (Supabase) session, and
 * nothing else. No second login, key or account.
 *
 * The panel sends `Authorization: Bearer <access token>` (fresh on every request); a browser
 * request with only the session cookies works too. The token is verified with the same
 * `getClaims()` check proxy.ts uses, then handed to the catalogue tool through the session's
 * auth attributes so the tool reads the database as this person. Every authenticated Supabase
 * user is staff: sign-up is limited to staff by the Before User Created hook.
 * Anything else returns null, and eve answers 401 (it fails closed).
 */
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { extractBearerToken, type AuthFn } from "eve/channels/auth";

/** Attribute that carries the caller's access token to the tool (never shown to the model). */
export const ACCESS_TOKEN_ATTR = "access_token";

export function supabaseStaff(): AuthFn<Request> {
  return async (request) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;

    const cookies = parseCookieHeader(request.headers.get("cookie") ?? "").map((c) => ({ name: c.name, value: c.value ?? "" }));
    const supabase = createServerClient(url, key, {
      cookies: { getAll: () => cookies, setAll: () => {} }, // read-only: the app's proxy refreshes sessions
    });
    const bearer = extractBearerToken(request.headers.get("authorization"));
    const token = bearer ?? (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return null;

    const { data, error } = await supabase.auth.getClaims(token);
    const claims = data?.claims;
    if (error || !claims || claims.role !== "authenticated" || typeof claims.sub !== "string") return null;

    return {
      authenticator: "supabase",
      principalId: claims.sub,
      principalType: "user",
      attributes: {
        ...(typeof claims.email === "string" ? { email: claims.email } : {}),
        [ACCESS_TOKEN_ATTR]: token,
      },
    };
  };
}
