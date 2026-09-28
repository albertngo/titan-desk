"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

function LoginInner() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const error = params.get("error");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    // skipBrowserRedirect + location.assign from the tap keeps the flow inside an installed iOS
    // PWA (a plain redirect can escape to Safari, which does not share cookies with the app).
    const { data, error: err } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "azure",
      options: { scopes: "email openid profile", redirectTo, skipBrowserRedirect: true },
    });
    if (err || !data?.url) {
      setBusy(false);
      alert(err?.message ?? "Sign-in could not start");
      return;
    }
    window.location.assign(data.url);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">askBert</h1>
      <p className="mt-1 text-zinc-600">Catalogue lookup for Titan Flooring staff.</p>
      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button
        onClick={signIn}
        disabled={busy}
        className="mt-8 rounded-lg bg-zinc-900 px-4 py-3 text-white disabled:opacity-60"
      >
        {busy ? "Opening Microsoft sign-in…" : "Sign in with Microsoft 365"}
      </button>
      <p className="mt-6 text-xs text-zinc-500">
        Install the app first (Share → Add to Home Screen on iPhone), then sign in inside it.
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
