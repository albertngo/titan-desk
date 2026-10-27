"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SyncStatus } from "@/components/SyncStatus";

const NAV = [
  { href: "/", label: "Shop", short: "Shop", match: (p: string) => p === "/" || p.startsWith("/p/") },
  { href: "/design", label: "Help me choose", short: "Choose", match: (p: string) => p.startsWith("/design") },
];

/** The desk's top bar: Titan mascot and name, the two destinations, and the data freshness. */
export function SiteHeader() {
  const path = usePathname() ?? "/";
  return (
    <header className="pt-safe sticky top-0 z-20 bg-denim text-cream">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:gap-5 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img src="/brand/titan-mascot-cream.png" alt="" className="h-10 w-10 object-contain" />
          <span className="leading-none">
            <span className="hidden font-display text-[19px] font-bold min-[400px]:block">askBert</span>
            <span className="mt-0.5 hidden text-[11px] tracking-wide text-sky sm:block">Titan Flooring desk</span>
          </span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {NAV.map((n) => {
            const active = n.match(path);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream ${
                  active ? "bg-cream text-denim" : "text-cream/85 hover:bg-cream/10 hover:text-cream"}`}>
                <span className="sm:hidden">{n.short}</span>
                <span className="hidden sm:inline">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <SyncStatus />
        </div>
      </div>
    </header>
  );
}
