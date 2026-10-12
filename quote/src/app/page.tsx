import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { listQuotes } from "@/lib/quotes/load";

export const dynamic = "force-dynamic";

export default async function QuoteList() {
  const email = await requireQuoter();
  const quotes = await listQuotes();
  return (
    <>
      <TopBar email={email} />
      <div className="page">
        <div className="pagehead">
          <div className="titles">
            <h1>Quotes</h1>
            <p>Every quote in Airtable, newest first. Read-only for now.</p>
          </div>
        </div>
        <section className="card">
          <div className="card-h">
            All quotes <span className="right">{quotes.length}</span>
          </div>
          {quotes.length === 0 ? (
            <p className="empty">No quotes in Airtable yet.</p>
          ) : (
            <div className="tbl-wrap">
              <table className="list">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>City</th>
                    <th>Quote</th>
                    <th>Basis</th>
                    <th>Options</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <Link className="cust" href={`/q/${q.id}`}>{q.customerName ?? "No customer"}</Link>
                      </td>
                      <td className="muted">{q.siteCity}</td>
                      <td className="num">
                        {q.quoteId ?? <span className="faint">No quote ID</span>}
                        {q.version !== null && <span className="faint"> · v{q.version}</span>}
                      </td>
                      <td>{q.basis && <span className={`chip ${q.basis === "Measured" ? "good" : "warn"}`}>{q.basis}</span>}</td>
                      <td>{q.optionCount > 0 ? q.optionCount : <span className="note">old A/B/C format</span>}</td>
                      <td>{q.status && <span className={`status ${q.status}`}>{q.status}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
