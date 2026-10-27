import type { ReactNode } from "react";
import type { ShortcutIcon as Name } from "@/lib/askbert-shop";

export type IconName =
  | Name | "send" | "close" | "plus" | "spark"
  | "vinyl" | "laminate" | "engineered" | "solid" | "tile" | "carpet" | "tools"
  | "search" | "filter" | "back" | "external" | "chevron" | "check" | "grid" | "list";

/** The desk's icon set (askBert and the shop): one 24px grid, one 1.75 stroke, round joins. Decorative (aria-hidden). */
export function ShortcutIcon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

const PATHS: Record<string, ReactNode> = {
  tag: (<><path d="M3.5 12.3V4.8c0-.7.6-1.3 1.3-1.3h7.5l8.2 8.2a1.3 1.3 0 0 1 0 1.8l-7 7a1.3 1.3 0 0 1-1.8 0z" /><circle cx="8.3" cy="8.3" r="1.4" /></>),
  price: (<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /><path d="M12 8.6c-.4-.5-1-.8-1.7-.8-1 0-1.7.6-1.7 1.4 0 1.9 3.6 1 3.6 2.9 0 .8-.8 1.4-1.8 1.4-.8 0-1.4-.3-1.8-.9M10.4 6.8v.9m0 6v.9" /></>),
  drop: (<><path d="M12 3.5s-6 6.6-6 10.6a6 6 0 0 0 12 0c0-4-6-10.6-6-10.6z" /><path d="M9.2 14.6a2.9 2.9 0 0 0 2.6 2.6" /></>),
  stairs: (<><path d="M3.5 20.5h17M3.5 20.5v-4h4.5v-4h4.5v-4H17v-4h3.5v16" /></>),
  heat: (<><path d="M4 20.5h16" /><path d="M8 16.5c-1.4-1.6-1.4-3.4 0-5s1.4-3.4 0-5M12 16.5c-1.4-1.6-1.4-3.4 0-5s1.4-3.4 0-5M16 16.5c-1.4-1.6-1.4-3.4 0-5s1.4-3.4 0-5" /></>),
  paw: (<><circle cx="7" cy="10" r="1.8" /><circle cx="10.5" cy="6.2" r="1.8" /><circle cx="14.5" cy="6.2" r="1.8" /><circle cx="18" cy="10" r="1.8" /><path d="M12.5 11c-2.6 0-5 3.6-5 6.1 0 1.6 1.3 2.4 2.8 2.4.9 0 1.5-.4 2.2-.4s1.3.4 2.2.4c1.5 0 2.8-.8 2.8-2.4 0-2.5-2.4-6.1-5-6.1z" /></>),
  box: (<><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" /><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" /></>),
  compare: (<><path d="M7 4.5 3.5 8 7 11.5M3.5 8h13M17 12.5l3.5 3.5-3.5 3.5M20.5 16h-13" /></>),
  calc: (<><rect x="5" y="3.5" width="14" height="17" rx="2.2" /><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" /></>),
  send: (<><path d="M12 19.5v-15M5.5 11 12 4.5l6.5 6.5" /></>),
  close: (<><path d="M6 6l12 12M18 6 6 18" /></>),
  plus: (<><path d="M12 5v14M5 12h14" /></>),
  vinyl: (<><rect x="3.5" y="5" width="17" height="5" rx="1" /><rect x="3.5" y="14" width="17" height="5" rx="1" /><path d="M9 5v5M15 14v5" /></>),
  laminate: (<><path d="M3.5 9 12 5l8.5 4L12 13z" /><path d="m3.5 13 8.5 4 8.5-4M3.5 17l8.5 4 8.5-4" /></>),
  engineered: (<><rect x="3.5" y="6" width="17" height="12" rx="1.5" /><path d="M3.5 10h17" /><path d="M7 14c1.5-1 3-1 4.5 0s3 1 4.5 0" /></>),
  solid: (<><rect x="3.5" y="5" width="17" height="14" rx="1.5" /><path d="M6.5 9c2-1.6 4-1.6 6 0s4 1.6 5 0M6.5 13c2-1.6 4-1.6 6 0s4 1.6 5 0M6.5 17c1.5-1 3-1 4.5 0" /></>),
  tile: (<><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>),
  carpet: (<><path d="M4 7c2.7-1.5 5.3-1.5 8 0s5.3 1.5 8 0M4 12c2.7-1.5 5.3-1.5 8 0s5.3 1.5 8 0M4 17c2.7-1.5 5.3-1.5 8 0s5.3 1.5 8 0" /></>),
  tools: (<><path d="M14.5 4.5a4 4 0 0 0-4.9 5.4L4 15.5V20h4.5l5.6-5.6a4 4 0 0 0 5.4-4.9l-2.6 2.6-2.4-.6-.6-2.4z" /></>),
  search: (<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>),
  filter: (<><path d="M4 6.5h16M7 12h10M10 17.5h4" /></>),
  back: (<><path d="M19.5 12h-15M10.5 6l-6 6 6 6" /></>),
  external: (<><path d="M13.5 4.5h6v6M19.5 4.5l-8 8M10 5.5H6A1.5 1.5 0 0 0 4.5 7v11A1.5 1.5 0 0 0 6 19.5h11a1.5 1.5 0 0 0 1.5-1.5v-4" /></>),
  chevron: (<><path d="m9.5 6 6 6-6 6" /></>),
  check: (<><path d="m5 12.5 4.5 4.5L19 7.5" /></>),
  grid: (<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>),
  list: (<><path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" /><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" /></>),
  spark: (<><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></>),
};
