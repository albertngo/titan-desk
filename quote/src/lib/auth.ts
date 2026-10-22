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

/**
 * The signed-in quoter as a person: email plus the display name Microsoft put on the sign-in,
 * for the edit history and for the From line of a sent quote (2026-10-22). Same checks as
 * requireQuoter.
 */
export async function requireQuoterPerson(): Promise<{ email: string; name: string | null }> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  if (!data?.claims) redirect("/login");
  if (!isQuoter(email, quoterAllowlist())) redirect("/denied");
  const meta = (data.claims as { user_metadata?: Record<string, unknown> }).user_metadata ?? {};
  const name = [meta.full_name, meta.name, meta.preferred_username].find((v) => typeof v === "string" && v.trim() && !String(v).includes("@"));
  return { email: String(email), name: typeof name === "string" ? name.trim() : null };
}

export async function signedInEmail(): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  return typeof email === "string" ? email : null;
}
