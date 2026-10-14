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
            <p>Every quote version in Airtable, newest first.</p>
          </div>
          <Link className="btn primary" href="/new">+ New quote</Link>
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
                    <th>Links</th>
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
                        {q.quoteNumber ?? q.quoteId ?? <span className="faint">No number</span>}
                        {q.version !== null && <span className="faint"> · v{q.version}</span>}
                      </td>
                      <td>
                        {q.linkStatus === "Needs linking" && <span className="chip bad">Needs linking</span>}{" "}
                        {q.addressStatus === "Unconfirmed" && <span className="chip warn">Address unconfirmed</span>}
                        {q.addressStatus === "No address" && <span className="chip warn">No address yet</span>}
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
