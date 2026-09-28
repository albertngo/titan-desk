import Link from "next/link";
import { SyncStatus } from "@/components/SyncStatus";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="pt-safe sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/" className="font-semibold tracking-tight">askBert</Link>
          <nav className="ml-auto mr-2 text-sm">
            <Link href="/design" className="rounded-full border border-zinc-300 px-3 py-1 active:bg-zinc-100">Help me choose</Link>
          </nav>
          <SyncStatus />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-3">{children}</main>
    </div>
  );
}
