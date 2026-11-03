"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CUSTOMER_VIEW, VIEW_COOKIE } from "@/lib/viewMode";

/** Writes the Customer view cookie for this device. The caller refreshes the page so the server renders it. */
export function writeCustomerView(on: boolean) {
  document.cookie = on
    ? `${VIEW_COOKIE}=${CUSTOMER_VIEW}; path=/; max-age=31536000; samesite=lax; secure`
    : `${VIEW_COOKIE}=; path=/; max-age=0; samesite=lax; secure`;
}

/** The Customer view switch in the top bar: hides cost, margin and profit on every page of this device. */
export function ViewSwitch({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function toggle() {
    writeCustomerView(!on);
    start(() => router.refresh());
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Customer view"
      className={`viewsw${on ? " on" : ""}`}
      onClick={toggle}
      disabled={pending}
      title={on ? "Customer view is on: cost, margin and profit are hidden. Switch off to see them." : "Hide cost, margin and profit while a customer can see the screen."}
    >
      {/* On a phone the words give way to an eye (2026-11-03); the switch keeps its name. */}
      <svg className="viewsw-eye" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span className="track" aria-hidden><span className="knob" /></span>
      <span className="viewsw-lbl">Customer view</span>
    </button>
  );
}
