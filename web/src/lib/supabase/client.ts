"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";

let client: ReturnType<typeof createBrowserClient<Database, "api">> | null = null;

/** Browser client bound to the `api` schema. The anon key is public; grants are the security. */
export function supabaseBrowser() {
  if (!client) {
    client = createBrowserClient<Database, "api">(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { db: { schema: "api" } },
    );
  }
  return client;
}
