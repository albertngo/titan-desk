import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { loadPerformance, WINDOW_DAYS } from "@/lib/quotes/performance";
import type { PersonPerf } from "@/lib/followup/perf";
import { LostBars, OutcomeTrend, PersonBars, ReplyTrend } from "@/components/PerfCharts";

export const dynamic = "force-dynamic";

const hrs = (h: number | null) => (h === null ? "n/a" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h * 10) / 10} h` : `${Math.round(h / 24)} days`);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
const money = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;

/** Follow-up performance (Albert, 2026-11-10: "for me first. can you build me a dashboard?"). Admin only; reads, never writes. */
export default async function PerformancePage() {
  const email = await requireQuoter();
  const data = await loadPerformance();
  const rows = [...data.people, data.everyone];
  return (
    <>
      <TopBar email={email} />
      <div className="page">
        <div className="pagehead">
          <div className="titles">
            <h1>Follow-up performance</h1>
            <p>
              Last {WINDOW_DAYS} days ({data.since} to {data.today}), by whoever last sent the quote. Only you can see this page. <Link href="/follow-up">Back to Follow up</Link>
            </p>
          </div>
        </div>
        <div className="tape" aria-hidden />
        {/* The graphs (Albert, 2026-11-10: "i need graphs"); the tables below are the exact numbers. */}
        <section className="card pc-grid-wrap">
          <ReplyTrend weeks={data.weeks} />
          <OutcomeTrend weeks={data.weeks} />
          <PersonBars title="Median reply time" note="Hours to our first human reply. Lower is better." people={data.people} value={(p) => p.replies.medianHours} fmt={(n) => `${n} h`} />
          <PersonBars title="Follow-ups on time" note="Share of due follow-ups done on the day." people={data.people} value={(p) => (p.onTime.onDay + p.onTime.late ? Math.round((p.onTime.onDay / (p.onTime.onDay + p.onTime.late)) * 100) : null)} fmt={(n) => `${n}%`} max={100} />
          <PersonBars title="Time to act on Needs you" note="Median hours from Needs you to a follow-up. Lower is better." people={data.people} value={(p) => p.needsYou.medianHours} fmt={(n) => `${n} h`} />
          <PersonBars title="Win rate" note="Accepted out of accepted plus lost, quotes first sent in the window." people={data.people} value={(p) => p.outcomes.winRate} fmt={(n) => `${n}%`} max={100} />
          <PersonBars title="Value won" note="Likely total of accepted quotes, with HST." people={data.people} value={(p) => (p.outcomes.accepted ? p.outcomes.wonValue : null)} fmt={(n) => `$${Math.round(n / 100) / 10}k`} />
          <LostBars reasons={data.everyone.outcomes.lostReasons} />
        </section>
        <section className="card pf">
          <Table
            title="Reply speed"
            note="From a customer's message to our first human reply (text, email, chat or a call that connected), on open quotes."
            rows={rows}
            head={["Messages", "Median reply", "Over 24 h", "Still waiting"]}
            cells={(p) => [String(p.replies.count), hrs(p.replies.medianHours), `${p.replies.over24} (${pct(p.replies.over24, p.replies.count - p.replies.waiting)})`, String(p.replies.waiting)]}
          />
          <Table
            title="On-time follow-ups"
            note="Each time a quote fell due, whether the next follow-up came that day or later."
            rows={rows}
            head={["Times due", "On the day", "Late", "Not done yet", "Avg days late"]}
            cells={(p) => [String(p.onTime.due), `${p.onTime.onDay} (${pct(p.onTime.onDay, p.onTime.onDay + p.onTime.late)})`, String(p.onTime.late), String(p.onTime.open), p.onTime.avgDaysLate === null ? "n/a" : String(p.onTime.avgDaysLate)]}
          />
          <Table
            title="Needs you"
            note="How fast a quote was acted on after it became Needs you, and hours quotes spent in each tier."
            rows={rows}
            head={["Times flagged", "Median to act", "Needs you now", "Hours in Needs you", "Watch", "On auto"]}
            cells={(p) => [String(p.needsYou.stints), hrs(p.needsYou.medianHours), String(p.needsYou.open), String(p.needsYou.hours.needs), String(p.needsYou.hours.watch), String(p.needsYou.hours.auto)]}
          />
          <Table
            title="Outcomes"
            note="Quotes first sent in the window: what has happened to them so far."
            rows={rows}
            head={["Sent", "Accepted", "Lost", "Postponed", "Win rate", "Value won"]}
            cells={(p) => [String(p.outcomes.sent), String(p.outcomes.accepted), String(p.outcomes.lost), String(p.outcomes.postponed), p.outcomes.winRate === null ? "n/a" : `${p.outcomes.winRate}%`, money(p.outcomes.wonValue)]}
          />
          <div className="pf-sec">
            <h2 className="pf-h">Why we lost</h2>
            {Object.keys(data.everyone.outcomes.lostReasons).length === 0 ? (
              <p className="pf-note">No lost quotes in the window.</p>
            ) : (
              <ul className="pf-reasons">
                {Object.entries(data.everyone.outcomes.lostReasons)
                  .sort((a, b) => b[1] - a[1])
                  .map(([r, n]) => (
                    <li key={r}>
                      <span>{r}</span> <strong>{n}</strong>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <p className="pf-note pf-foot">
            On-time and Needs you build up from the state log, which started {data.stateLogSince ?? "today"}: these numbers fill in over the coming weeks. Reply speed reads GHL directly, so it covers the whole window for quotes still open.
          </p>
        </section>
      </div>
    </>
  );
}

function Table({ title, note, rows, head, cells }: { title: string; note: string; rows: PersonPerf[]; head: string[]; cells: (p: PersonPerf) => string[] }) {
  return (
    <div className="pf-sec">
      <h2 className="pf-h">{title}</h2>
      <p className="pf-note">{note}</p>
      <div className="pf-scroll">
        <table className="pf-t">
          <thead>
            <tr>
              <th>Person</th>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.person} className={p.person === "Everyone" ? "all" : undefined}>
                <th scope="row">{p.person}</th>
                {cells(p).map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
