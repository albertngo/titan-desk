"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * The signed-in person in the top bar (2026-10-28): initials that open the email and Sign out, so the bar stays short.
 * An admin also gets Settings here (Albert, 2026-11-17: "on the top main bar? under the user dropdown as an option").
 */
export function AccountMenu({ email, admin = false }: { email: string; admin?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLAnchorElement & HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="acct" ref={root}>
      <button type="button" className="acct-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Account: ${email}`} title={email} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" aria-hidden>{email.slice(0, 2)}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="acct-pop" role="menu">
          <div className="em">Signed in as<b>{email}</b></div>
          {admin && (
            <Link ref={first} href="/settings" className="acct-item" role="menuitem" onClick={() => setOpen(false)}>
              Settings
            </Link>
          )}
          <form action="/auth/signout" method="post">
            <button ref={admin ? undefined : first} className="acct-item" role="menuitem">Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
