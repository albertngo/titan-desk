"use client";

import { useEffect, useRef, useState } from "react";
import type { LatestSheet } from "@/lib/files/sheets";

/**
 * Company files in the top bar (Albert, 2026-11-07), beside What's new: the newest Flooring and Stair Site
 * Sheets and the Follow up staff guide, each its own download (`/files/<kind>`), with its version. Staff only; TopBar leaves it out in
 * Customer view. Opens like the account menu: Escape or a click away closes it.
 */
/** The files under their group headings, in the order they come. */
function groupsOf(sheets: LatestSheet[]): [string, LatestSheet[]][] {
  const out = new Map<string, LatestSheet[]>();
  for (const s of sheets) out.set(s.group, [...(out.get(s.group) ?? []), s]);
  return [...out];
}

export function CompanyFiles({ sheets }: { sheets: LatestSheet[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLAnchorElement>(null);

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

  if (sheets.length === 0) return null;
  return (
    <div className="acct files" ref={root}>
      <button type="button" className="tb-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Company files" onClick={() => setOpen((o) => !o)}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
        <span className="lbl">Company files</span>
      </button>
      {open && (
        <div className="acct-pop files-pop" role="menu">
          {groupsOf(sheets).map(([group, items]) => (
            <div key={group} className="files-group">
              <div className="em">
                {group}
                <span>{group === "Site sheets" ? "Latest versions. Print on Letter." : "Latest versions, for training."}</span>
              </div>
              {items.map((s) => (
                <a key={s.kind} ref={s.kind === sheets[0].kind ? first : undefined} className="acct-item file-item" role="menuitem" href={`/files/${s.kind}`} download={s.downloadName} onClick={() => setOpen(false)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5" />
                  </svg>
                  <span className="fi-t">
                    <b>{s.title}</b>
                    <span>{s.note}</span>
                  </span>
                  <span className="fi-v">v{s.version}</span>
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
