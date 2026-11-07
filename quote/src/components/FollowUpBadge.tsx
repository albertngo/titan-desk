"use client";

import { useEffect, useState } from "react";
import { dueCountAction } from "@/app/follow-up/actions";

/**
 * The red count on the top bar's Follow up (Albert, 2026-11-07: "a red notif on the top bar for number of ones due
 * now"): everyone's quotes due now, asked for after the page has drawn so it never slows a page; the server keeps the
 * count three minutes. Nothing shows at zero.
 */
export function FollowUpBadge() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    dueCountAction()
      .then((c) => live && setN(c))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!n) return null;
  return (
    <span className="tb-badge" aria-label={`${n} due now`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}
