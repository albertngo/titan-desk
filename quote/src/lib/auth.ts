import "server-only";
import { redirect } from "next/navigation";
import { isQuoter, quoterAllowlist } from "@/lib/access";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Second lock behind the proxy: every Airtable read calls this first, so a mistake in the
 * proxy matcher can never expose a quote. Returns the signed-in quoter's email.
 */
export async function requireQuoter(): Promise<string> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  if (!data?.claims) redirect("/login");
  if (!isQuoter(email, quoterAllowlist())) redirect("/denied");
  return String(email);
}

export async function signedInEmail(): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  return typeof email === "string" ? email : null;
}
