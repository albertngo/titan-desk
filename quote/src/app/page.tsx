import Link from "next/link";
import { QuoteList } from "@/components/QuoteList";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { listQuoteGroups } from "@/lib/quotes/load";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const email = await requireQuoter();
  const groups = await listQuoteGroups();
  return (
    <>
      <TopBar email={email} />
      <div className="page">
        <div className="pagehead">
          <div className="titles">
            <h1>Quotes</h1>
            <p>Every quote, newest first. Open a row to see its versions.</p>
          </div>
          <div className="pageacts">
            <Link className="btn" href="/new?kind=preliminary">+ Preliminary quote</Link>
            <Link className="btn primary" href="/new">+ New quote</Link>
          </div>
        </div>
        <QuoteList groups={groups} />
      </div>
    </>
  );
}
