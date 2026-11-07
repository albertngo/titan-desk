import Link from "next/link";
import { bugReportsOn } from "@/lib/bug/notion";
import { CHANGES } from "@/lib/changes";
import { customerView } from "@/lib/view";
import { AccountMenu } from "./AccountMenu";
import { BuildLine } from "./BuildLine";
import { ReportBug } from "./ReportBug";
import { ViewSwitch } from "./ViewSwitch";

export async function TopBar({ email }: { email: string }) {
  const customer = await customerView();
  return (
    <>
    <header className="topbar">
      {/* Which build is running (2026-11-03): internal, so not while a customer is looking. */}
      {!customer && <BuildLine />}
      <div className="topbar-in">
        <Link href="/" className="brand">
          <span className="brand-mark">T</span>
          <span className="brand-name">Titan Quotes</span>
        </Link>
        {/* Grouped (2026-10-28): the view, then help, then the account, with a thin line between groups. */}
        <div className="tb-group">
          <ViewSwitch on={customer} />
        </div>
        {/* What's new and Report a bug are internal, so not while a customer is looking. */}
        {!customer && (
          <>
            <span className="tb-sep" aria-hidden />
            <div className="tb-group">
              <Link className="tb-btn" href="/changes" aria-label="What's new" title={`Last change ${CHANGES[0]?.date ?? ""}: ${CHANGES[0]?.title ?? ""}`}>
                {/* A newspaper, not the AI sparkle (2026-11-07). */}
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                  <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z" />
                </svg>
                <span className="lbl">What&apos;s new</span>
              </Link>
              {/* Report a bug (2026-10-28): staff only, and only once the Notion token is set. */}
              {!customer && bugReportsOn() && <ReportBug />}
            </div>
          </>
        )}
        <span className="tb-sep" aria-hidden />
        <AccountMenu email={email} />
      </div>
    </header>
    </>
  );
}
