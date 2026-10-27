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
    <main className="flex min-h-screen flex-col items-center justify-center bg-cream px-6 text-ink">
      <div className="w-full max-w-sm text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/brand/titan-mascot-blue.png" alt="" className="mx-auto h-28 w-28 object-contain" />
        <h1 className="mt-4 font-display text-[34px] font-bold leading-tight text-denim">askBert</h1>
        <p className="mt-1 text-ink/65">The Titan Flooring catalogue, for staff.</p>
        {error && <p className="mt-5 rounded-xl bg-peach px-4 py-3 text-left text-sm text-campfire-dark">{error}</p>}
        <button
          onClick={signIn}
          disabled={busy}
          className="mt-8 h-12 w-full rounded-full bg-denim px-5 font-semibold text-cream transition hover:bg-denim-dark active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim"
        >
          {busy ? "Opening Microsoft sign-in…" : "Sign in with Microsoft 365"}
        </button>
        <p className="mt-6 text-xs leading-relaxed text-ink/55">
          Install the app first (Share → Add to Home Screen on iPhone), then sign in inside it.
        </p>
      </div>
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
