import type { Metadata } from "next";
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { requireQuoter } from "@/lib/auth";
import { byDay, dayLabel, KIND_LABEL } from "@/lib/changes";

export const metadata: Metadata = { title: "What's new" };

const KIND_CHIP = { new: "accent", changed: "", fixed: "good", removed: "warn" } as const;

export default async function ChangesPage() {
  const email = await requireQuoter();
  return (
    <>
      <TopBar email={email} />
      <div className="page">
        <div className="pagehead">
          <div className="titles">
            <h1>What&apos;s new</h1>
            <p>Every change to Titan Quotes, newest first.</p>
          </div>
          <div className="pageacts">
            <Link className="btn" href="/">← Quotes</Link>
          </div>
        </div>
        <div className="changes">
          {byDay().map((day) => (
            <section key={day.date} className="card changes-day">
              <h2>{dayLabel(day.date)}</h2>
              <ul>
                {day.changes.map((c, i) => (
                  <li key={i}>
                    <div className="changes-head">
                      <span className={`chip ${KIND_CHIP[c.kind]}`}>{KIND_LABEL[c.kind]}</span>
                      <strong>{c.title}</strong>
                    </div>
                    <ul className="changes-details">
                      {c.details.map((d, j) => <li key={j}>{d}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
