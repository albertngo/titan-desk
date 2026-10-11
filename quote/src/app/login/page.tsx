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
    // Same flow as the desk: skipBrowserRedirect + location.assign keeps an installed iOS app in-app.
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
    <main className="center">
      <h1>Titan Quotes</h1>
      <p>Quoting for Titan Flooring. Access is limited to named quoters.</p>
      {error && <p className="err">{error}</p>}
      <button className="btn" onClick={signIn} disabled={busy}>
        {busy ? "Opening Microsoft sign-in…" : "Sign in with Microsoft 365"}
      </button>
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
