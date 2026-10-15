"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CUSTOMER_VIEW, VIEW_COOKIE } from "@/lib/viewMode";

/** The Customer view switch in the top bar: hides cost, margin and profit on every page of this device. */
export function ViewSwitch({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function toggle() {
    document.cookie = on
      ? `${VIEW_COOKIE}=; path=/; max-age=0; samesite=lax; secure`
      : `${VIEW_COOKIE}=${CUSTOMER_VIEW}; path=/; max-age=31536000; samesite=lax; secure`;
    start(() => router.refresh());
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`viewsw${on ? " on" : ""}`}
      onClick={toggle}
      disabled={pending}
      title={on ? "Customer view is on: cost, margin and profit are hidden. Switch off to see them." : "Hide cost, margin and profit while a customer can see the screen."}
    >
      <span className="track" aria-hidden><span className="knob" /></span>
      Customer view
    </button>
  );
}
