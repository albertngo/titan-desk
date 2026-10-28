import Link from "next/link";
import { bugReportsOn } from "@/lib/bug/notion";
import { CHANGES } from "@/lib/changes";
import { customerView } from "@/lib/view";
import { ReportBug } from "./ReportBug";
import { ViewSwitch } from "./ViewSwitch";

export async function TopBar({ email }: { email: string }) {
  const customer = await customerView();
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand">
          <span className="brand-mark">T</span>
          Titan Quotes
        </Link>
        <ViewSwitch on={customer} />
        {/* What's new sits here, out of the way (2026-10-27); internal, so not while a customer is looking. */}
        {!customer && (
          <Link className="linkbtn" href="/changes" title={`Last change ${CHANGES[0]?.date ?? ""}: ${CHANGES[0]?.title ?? ""}`}>
            What&apos;s new
          </Link>
        )}
        {/* Report a bug (2026-10-28): staff only, and only once the Notion token is set. */}
        {!customer && bugReportsOn() && <ReportBug />}
        <div className="who">
          <span className="email">{email}</span>
          <span className="avatar" aria-hidden>{email.slice(0, 2)}</span>
          <form action="/auth/signout" method="post">
            <button className="linkbtn">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
