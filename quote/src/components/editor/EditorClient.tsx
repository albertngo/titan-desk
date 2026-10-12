"use client";

import dynamic from "next/dynamic";

/**
 * The editor runs in the browser only: it restores an unsaved draft from this device on
 * open, which a server render cannot see.
 */
export const EditorClient = dynamic(() => import("./Editor"), {
  ssr: false,
  loading: () => (
    <div className="page">
      <p className="empty">Opening the editor…</p>
    </div>
  ),
});
