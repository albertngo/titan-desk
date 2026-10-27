import { SiteHeader } from "@/components/shell/SiteHeader";
import { AskBert } from "@/components/askbert/AskBert";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream font-brand text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-5 sm:px-6 lg:px-8">{children}</main>
      <AskBert />
    </div>
  );
}
