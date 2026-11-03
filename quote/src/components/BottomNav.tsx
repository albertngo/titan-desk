"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ReportBug } from "./ReportBug";
import { writeCustomerView } from "./ViewSwitch";

type Sheet = "new" | "more" | null;

/**
 * The phone's menu (Albert, 2026-11-03: "Bottom tab bar"): Quotes, New, Customer view and More along the bottom,
 * within reach of a thumb. Shown only at phone widths (globals.css), where the top bar is hidden; on a computer or a
 * tablet nothing here is drawn. Same destinations as the top bar and the front page, nothing new: New offers the
 * two ways to start a quote, More holds What's new, Report a bug and the account.
 */
export function BottomNav({ email, customer, bugs }: { email: string; customer: boolean; bugs: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [pending, start] = useTransition();
  const quotesOn = path === "/" || path.startsWith("/q/");
  const newOn = path.startsWith("/new");

  useEffect(() => {
    if (!sheet) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".modal") && setSheet(null);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [sheet]);

  const open = (s: Exclude<Sheet, null>) => setSheet((now) => (now === s ? null : s));
  const close = () => setSheet(null);
  const toggleView = () => {
    close();
    writeCustomerView(!customer);
    start(() => router.refresh());
  };

  return (
    <>
      {sheet && <div className="bnav-back" onClick={close} aria-hidden />}
      {sheet === "new" && (
        <div className="bnav-sheet" id="bnav-new" aria-label="Start a quote">
          <Link className="bnav-item" href="/new?kind=preliminary" onClick={close}>
            Preliminary quote
            <span>Pick the work first and get a priced estimate</span>
          </Link>
          <Link className="bnav-item" href="/new" onClick={close}>
            New quote
            <span>A measured quote that opens empty in the editor</span>
          </Link>
        </div>
      )}
      {sheet === "more" && (
        <div className="bnav-sheet" id="bnav-more" aria-label="More">
          {/* What's new and Report a bug are internal, so not while a customer is looking (as in the top bar). */}
          {!customer && (
            <Link className="bnav-item" href="/changes" onClick={close}>
              What&apos;s new
            </Link>
          )}
          {!customer && bugs && <ReportBug />}
          <div className="bnav-em">
            Signed in as<b>{email}</b>
          </div>
          <form action="/auth/signout" method="post">
            <button className="bnav-item">Sign out</button>
          </form>
        </div>
      )}
      <nav className="bnav" aria-label="Main">
        <Link className="bnav-b" href="/" aria-current={quotesOn ? "page" : undefined} onClick={close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 3h7l5 5v13H7z" />
            <path d="M14 3v5h5M10 13h6M10 17h6" />
          </svg>
          Quotes
        </Link>
        <button type="button" className={`bnav-b${newOn ? " here" : ""}`} aria-expanded={sheet === "new"} aria-controls="bnav-new" onClick={() => open("new")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          New
        </button>
        <button type="button" className="bnav-b" role="switch" aria-checked={customer} aria-label="Customer view" disabled={pending} onClick={toggleView}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {customer ? "Customer on" : "Customer"}
        </button>
        <button type="button" className="bnav-b" aria-expanded={sheet === "more"} aria-controls="bnav-more" onClick={() => open("more")}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
          More
        </button>
      </nav>
    </>
  );
}
