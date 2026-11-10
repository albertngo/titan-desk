import { notFound } from "next/navigation";
import { SettingsForm } from "@/components/SettingsForm";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { DEFS, shown } from "@/lib/settings/registry";
import { loadSettings } from "@/lib/settings/settings";

export const dynamic = "force-dynamic";

/** Settings (Albert, 2026-11-10: "for all the items that are permission / turn on/off based"). Admin only. */
export default async function SettingsPage() {
  const email = await requireQuoter();
  const view = await loadSettings();
  if (!view) notFound();
  const items = DEFS.map((d) => ({ ...d, value: shown(view.s, d.key), by: view.meta[d.key]?.by ?? null, when: view.meta[d.key]?.when ?? null }));
  return (
    <>
      <TopBar email={email} />
      <div className="page">
        <div className="pagehead">
          <div className="titles">
            <h1>Settings</h1>
            <p>The app&apos;s switches and dials. A change applies within a minute, with no redeploy, and is logged with who and when. Keys and passwords stay in Vercel.</p>
          </div>
        </div>
        <div className="tape" aria-hidden />
        <SettingsForm items={items} />
      </div>
    </>
  );
}
