"use client";

import { useEffect } from "react";

/**
 * Reports that the customer's quote page was opened (2026-10-27): once, after the page has been in
 * view for a moment, so a link preview or a mail scanner that fetches the page never counts. Staff
 * looking at a customer link from the quote page open it with #staff, which is never reported.
 */
export function SeenBeacon({ path }: { path: string }) {
  useEffect(() => {
    if (window.location.hash === "#staff") return;
    let timer: number | undefined;
    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      if (!navigator.sendBeacon?.(path)) fetch(path, { method: "POST", keepalive: true }).catch(() => undefined);
    };
    const arm = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") timer = window.setTimeout(send, 1500);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [path]);
  return null;
}
