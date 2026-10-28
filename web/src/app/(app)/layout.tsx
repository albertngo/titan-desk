import { SiteHeader } from "@/components/shell/SiteHeader";
import { AskBert } from "@/components/askbert/AskBert";
import { bugReportsOn } from "@/lib/bug/notion";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream font-brand text-ink">
      <SiteHeader bugReports={bugReportsOn()} />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-3 sm:px-6">{children}</main>
      <AskBert />
    </div>
  );
}
