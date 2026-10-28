import Link from "next/link";
import { bugReportsOn } from "@/lib/bug/notion";
import { CHANGES } from "@/lib/changes";
import { customerView } from "@/lib/view";
import { AccountMenu } from "./AccountMenu";
import { ReportBug } from "./ReportBug";
import { ViewSwitch } from "./ViewSwitch";

export async function TopBar({ email }: { email: string }) {
  const customer = await customerView();
  return (
    <header className="topbar">
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
                <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                  <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z" />
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
  );
}
