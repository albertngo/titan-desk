import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { listQuotes } from "@/lib/quotes/load";

export const dynamic = "force-dynamic";

export default async function QuoteList() {
  const email = await requireQuoter();
  const quotes = await listQuotes();
  return (
    <div className="wrap">
      <TopBar email={email} />
      <div className="app">
        <div className="apphead">
          <div className="who">
            <h2>Quotes</h2>
            <div className="sub">Newest first · read from Airtable</div>
          </div>
          <span className="pill ro">Read-only</span>
        </div>
        {quotes.length === 0 ? (
          <p className="empty">No quotes in Airtable yet.</p>
        ) : (
          <div className="gwrap">
            <table className="list">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>City</th>
                  <th>Quote</th>
                  <th>Status</th>
                  <th>Basis</th>
                  <th>Options</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <Link href={`/q/${q.id}`}>{q.customerName ?? "No customer"}</Link>
                    </td>
                    <td>{q.siteCity}</td>
                    <td className="num">
                      {q.quoteId ?? "No quote ID"}
                      {q.version !== null && ` · v${q.version}`}
                    </td>
                    <td>{q.status}</td>
                    <td>{q.basis}</td>
                    <td>{q.optionCount > 0 ? q.optionCount : <span className="note">old A/B/C format</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
