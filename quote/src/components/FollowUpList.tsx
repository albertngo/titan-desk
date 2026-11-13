"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { autoFollowUpsAction, briefAction, followedUpAction, lostAction, postponeAction, sendFollowUpAction, snoozeAction } from "@/app/follow-up/actions";
import { ConversationDrawer } from "@/components/Conversation";
import type { Brief, StepKind } from "@/lib/followup/brief";
import { SNOOZE_CHOICES, type Bucket } from "@/lib/followup/plan";
import { TIER_WORDS } from "@/lib/followup/score";
import type { FollowUpPage, FollowUpResult, FollowUpRow } from "@/lib/quotes/followup";

const SECTIONS: { bucket: Bucket; title: string; empty: string }[] = [
  { bucket: "due", title: "Due now", empty: "Nothing due. Nice." },
  { bucket: "upcoming", title: "Coming up", empty: "Nothing scheduled." },
  { bucket: "snoozed", title: "Snoozed", empty: "Nothing snoozed." },
  { bucket: "postponed", title: "Postponed", empty: "Nothing postponed." },
];

/** Due now, split by need (Albert, 2026-11-09): what needs a person, what to keep an eye on, and what waits past the day's cap. */
const DUE_GROUPS: { key: "needs" | "watch" | "next"; title: string; hint: string }[] = [
  { key: "needs", title: "Needs you", hint: "A high score, or they asked, pushed back, went cold, or it's a big job" },
  { key: "watch", title: "Watch", hint: "Some interest, not hot yet" },
  { key: "next", title: "Next up", hint: "Needs you, past today's limit for this person" },
];
const groupOf = (r: FollowUpRow) => (r.waiting ? "next" : r.score.tier === "needs" ? "needs" : "watch");

const STEP_WORDS: Record<StepKind, string> = { call: "Call them", text: "Send a text", email: "Send an email", visit: "Book the visit", wait: "Wait", close: "Close it out" };
const EVERYONE = "Everyone";
/** Briefs written at once, so a first visit doesn't ask Claude for every quote together. */
const BRIEFS_AT_ONCE = 2;

const dayWords = (d: string, today: string) => {
  const n = Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000);
  if (n === 0) return "today";
  if (n === -1) return "yesterday";
  if (n === 1) return "tomorrow";
  const label = new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
  return n < 0 ? `${label} (${-n} days ago)` : label;
};

type Modal = { kind: "lost" | "postpone" | "touch"; row: FollowUpRow } | null;
type BriefState = { brief: Brief | null; busy: boolean; error: string | null; stale: boolean };

/**
 * The Follow up page's list (Albert, 2026-11-07). "Last sent by: Pourya | Joey | Albert | Everyone" (each name is
 * whoever last sent a quote on the list), starting on the signed-in person when they have any; column headings; four
 * sections by where each quote stands; on each row, what's due and why, the brief, then the buttons. The customer's
 * conversation opens in the drawer on the right. Every button goes to the server, which reads the quote again before
 * writing; the page reloads after.
 */
export function FollowUpList({ data }: { data: FollowUpPage }) {
  const router = useRouter();
  const senders = useMemo(
    () => [...new Set([...data.rows.map((r) => r.ownerName), ...(data.visits ?? []).map((v) => v.visitorName)].filter((n): n is string => Boolean(n)))].sort((a, b) => a.localeCompare(b)),
    [data.rows, data.visits],
  );
  const myName = data.rows.find((r) => r.owner === data.me)?.ownerName ?? null;
  const [who, setWho] = useState<string>(myName ?? EVERYONE);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, start] = useTransition();
  const [result, setResult] = useState<{ who: string; ok: boolean; lines: string[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [conv, setConv] = useState<{ contactId: string; name: string | null; signal: number } | null>(() => {
    // The first row's customer to start (Albert, 2026-11-07: "default to the first row"); rows come most urgent first.
    const first = data.rows.find((r) => r.contactId);
    return first?.contactId ? { contactId: first.contactId, name: first.customer, signal: 0 } : null;
  });
  const [briefs, setBriefs] = useState<Record<string, BriefState>>(() =>
    Object.fromEntries(data.rows.map((r) => [r.quoteRecordId, { brief: r.brief, busy: false, error: null, stale: r.briefStale }])),
  );

  // Snoozed lives in its own tab, out of the way (Albert, 2026-11-09).
  const [tab, setTab] = useState<"list" | "snoozed">("list");
  const shown = useMemo(() => (who === EVERYONE ? data.rows : data.rows.filter((r) => r.ownerName === who)), [who, data.rows]);
  const visitsShown = (data.visits ?? []).filter((v) => who === EVERYONE || v.visitorName === who);
  const dueOf = (name: string) =>
    data.rows.filter((r) => r.due.bucket === "due" && r.score.tier === "needs" && !r.waiting && (name === EVERYONE || r.ownerName === name)).length +
    (data.visits ?? []).filter((v) => name === EVERYONE || v.visitorName === name).length;
  const [autoOpen, setAutoOpen] = useState(false);
  const autoRows = shown.filter((r) => r.due.bucket === "auto");

  const askBrief = async (row: FollowUpRow, force: boolean) => {
    setBriefs((b) => ({ ...b, [row.quoteRecordId]: { ...b[row.quoteRecordId], busy: true, error: null } }));
    try {
      const r = await briefAction(row.quoteRecordId, force);
      setBriefs((b) => ({ ...b, [row.quoteRecordId]: r.ok ? { brief: r.brief, busy: false, error: null, stale: false } : { ...b[row.quoteRecordId], busy: false, error: r.message } }));
    } catch {
      setBriefs((b) => ({ ...b, [row.quoteRecordId]: { ...b[row.quoteRecordId], busy: false, error: "Lost the connection. Try again." } }));
    }
  };

  // Stale briefs for what is due or coming up are rewritten after the page draws, a couple at a time, due first.
  const started = useRef(new Set<string>());
  useEffect(() => {
    if (!data.briefsOn) return;
    const todo = data.rows.filter((r) => r.briefStale && (r.due.bucket === "due" || r.due.bucket === "upcoming") && !started.current.has(r.quoteRecordId));
    todo.forEach((r) => started.current.add(r.quoteRecordId));
    let live = true;
    (async () => {
      for (let i = 0; i < todo.length && live; i += BRIEFS_AT_ONCE) await Promise.all(todo.slice(i, i + BRIEFS_AT_ONCE).map((r) => askBrief(r, false)));
    })();
    return () => {
      live = false;
    };
  }, [data.rows, data.briefsOn]);

  const run = (row: FollowUpRow, f: () => Promise<FollowUpResult>) => {
    setResult(null);
    start(async () => {
      try {
        const r = await f();
        setResult({ who: row.customer ?? row.quoteNumber ?? "This quote", ok: r.ok, lines: r.ok ? r.notes : [r.message] });
        if (r.ok) {
          setModal(null);
          router.refresh();
        }
      } catch {
        setResult({ who: row.customer ?? "This quote", ok: false, lines: ["Lost the connection, so it may not have gone through. Reload to check."] });
      }
    });
  };

  const copy = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt(label, text);
    }
  };

  const openConv = (row: FollowUpRow) => row.contactId && setConv((c) => ({ contactId: row.contactId as string, name: row.customer, signal: (c?.signal ?? 0) + 1 }));

  return (
    <>
      <section className="card fu-card">
        <div className="ql-tools fu-tools">
          <div className="fu-who-pick">
            <span className="k" id="fu-who-k">Last sent by</span>
            <div className="ql-filters" role="group" aria-labelledby="fu-who-k">
              {[...senders, EVERYONE].map((name) => (
                <button key={name} type="button" className="ql-f" aria-pressed={who === name} onClick={() => setWho(name)} title={`${dueOf(name)} need you now`}>
                  {name} <span className="n">{dueOf(name)}</span>
                </button>
              ))}
            </div>
          </div>
          {!data.ghlOn && <p className="fu-warn">GHL isn&apos;t connected here, so only &quot;I followed up&quot; counts and the GHL buttons are off.</p>}
          {data.ghlOn && !data.lostReasons?.length && <p className="fu-warn">GHL&apos;s lost reasons couldn&apos;t be read, so Lost is off for now. Mark a lost quote in GHL, or reload in a moment.</p>}
          {!data.briefsOn && <p className="fu-warn">Briefs aren&apos;t set up on this deployment (the Claude key isn&apos;t set).</p>}
          {/* The Stage 2 report (2026-11-09): Albert switches automatic sending on when this says ready. */}
          <p className="fu-sending" title="Measured follow-ups sent from the app with Send. Automatic sending is Albert's switch.">
            Sent from the app: {data.sending.taps}
            {data.sending.taps ? `, ${Math.round(data.sending.share * 100)}% as written` : ""}
            {" · "}
            {data.sending.autoOn ? "automatic sending is on" : data.sending.ready ? "ready for automatic sending: ask Albert" : `automatic sending after 30 sent with 80% as written`}
          </p>
        </div>
        {result && (
          <div className={`fu-result${result.ok ? "" : " bad"}`} role="status">
            <strong>{result.ok ? `${result.who}: done.` : `${result.who}: not done.`}</strong>
            {result.lines.map((l) => (
              <span key={l}>{l}</span>
            ))}
            <button type="button" className="linkbtn" onClick={() => setResult(null)}>
              Dismiss
            </button>
          </div>
        )}
        <div className="fu-tabs" role="tablist" aria-label="Follow up views">
          <button type="button" role="tab" className="ql-f" aria-selected={tab === "list"} aria-pressed={tab === "list"} onClick={() => setTab("list")}>
            To follow up
          </button>
          <button type="button" role="tab" className="ql-f" aria-selected={tab === "snoozed"} aria-pressed={tab === "snoozed"} onClick={() => setTab("snoozed")}>
            Snoozed <span className="n">{shown.filter((r) => r.due.bucket === "snoozed").length}</span>
          </button>
        </div>
        <div className="fu-cols" aria-hidden>
          <span>Customer · in conversation with</span>
          <span>Score</span>
          <span>Why it&apos;s due</span>
          <span>Age and follow-ups</span>
        </div>
        {/* Visited, no quote yet (2026-11-07): the visits still owed a measured quote, above everything else. */}
        {data.visits === null && data.ghlOn && <p className="fu-warn fu-pad">GHL&apos;s calendars couldn&apos;t be read, so visits without a quote aren&apos;t shown.</p>}
        {tab === "list" && visitsShown.length > 0 && (
          <div className="fu-sec visits">
            <h2 className="fu-h">
              Visited, no quote yet <span className="n">{visitsShown.length}</span>
            </h2>
            {visitsShown.map((v) => (
              <div key={v.contactId} className={`fu-row can-pick${conv?.contactId === v.contactId ? " picked" : ""}`} onClick={(e) => !(e.target as Element).closest("a, button") && setConv((c) => ({ contactId: v.contactId, name: v.name, signal: (c?.signal ?? 0) + 1 }))}>
                <div className="fu-who">
                  <span className="fu-name-line">
                    {v.quote?.versionId ? (
                      <Link href={`/q/${v.quote.versionId}`} className="fu-name">
                        {v.name ?? "Customer"}
                      </Link>
                    ) : (
                      <span className="fu-name">{v.name ?? "Customer"}</span>
                    )}
                    {v.visitorName && <span className="fu-with">with {v.visitorName}</span>}
                  </span>
                  <span className="fu-meta">{v.quote?.quoteNumber ? `${v.quote.quoteNumber} · no measured quote sent since the visit` : "No quote in the app yet"}</span>
                </div>
                <div className="fu-scorecol" data-k="Score"><span className="fu-score-none">No quote yet</span></div>
                <div className="fu-why" data-k="Why it's due">
                  {v.rescheduling ? (
                    <span className="chip" title={`"${v.rescheduling.quote}"`}>
                      Called off {dayWords(v.rescheduling.day, data.today)} by text: waiting on them to rebook
                    </span>
                  ) : (
                    <span className="chip warn">Visited: the measured quote is owed</span>
                  )}
                  <span className="fu-when">
                    Visited {dayWords(v.day, data.today)} · {v.where}
                  </span>
                </div>
                <div className="fu-facts" data-k="Age and follow-ups">
                  <span>{v.days === 0 ? "Today" : `${v.days} day${v.days === 1 ? "" : "s"} since the visit`}</span>
                </div>
                <div className="fu-acts">
                  <button type="button" className={`btn${conv?.contactId === v.contactId ? " on" : ""}`} onClick={() => setConv((c) => ({ contactId: v.contactId, name: v.name, signal: (c?.signal ?? 0) + 1 }))}>
                    Conversation
                  </button>
                  <a className="btn" href={v.ghlUrl} target="_blank" rel="noreferrer">
                    Open in GHL
                  </a>
                  <Link className="btn primary" href={v.quote?.versionId ? `/q/${v.quote.versionId}/edit` : "/new"}>
                    {v.quote?.versionId ? "Write the measured quote" : "Start a quote"}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
        {SECTIONS.filter((s) => (tab === "snoozed" ? s.bucket === "snoozed" : s.bucket !== "snoozed")).map((s) => {
          const rows = shown.filter((r) => r.due.bucket === s.bucket);
          if (s.bucket !== "due" && s.bucket !== "snoozed" && rows.length === 0) return null;
          return (
            <div key={s.bucket} className={`fu-sec ${s.bucket}`}>
              <h2 className="fu-h">
                {s.title} <span className="n">{rows.length}</span>
              </h2>
              {rows.length === 0 && <p className="fu-empty">{s.empty}</p>}
              {(s.bucket === "due" ? DUE_GROUPS.map((g) => ({ g, rows: rows.filter((r) => groupOf(r) === g.key) })) : [{ g: null, rows }]).map(({ g, rows: rs }) =>
                rs.length === 0 ? null : (
                  <div key={g?.key ?? "all"} className={g ? `fu-group ${g.key}` : undefined}>
                    {g && (
                      <h3 className="fu-gh" title={g.hint}>
                        {g.title} <span className="n">{rs.length}</span>
                      </h3>
                    )}
                    {rs.map((r) => (
                <Row
                  dials={data.dials}
                  key={r.quoteRecordId}
                  row={r}
                  today={data.today}
                  busy={busy}
                  copied={copied}
                  brief={briefs[r.quoteRecordId]}
                  briefsOn={data.briefsOn}
                  convOn={conv?.contactId === r.contactId}
                  onModal={(kind) => setModal({ kind, row: r })}
                  onSnooze={(d) => run(r, () => snoozeAction(r.quoteRecordId, r.seen, d))}
                  onVisit={() => copy(`visit:${r.quoteRecordId}`, data.inHomeUrl, "Copy the in-home booking link:")}
                  onCopyDraft={(text) => copy(`draft:${r.quoteRecordId}`, text, "Copy the draft:")}
                  onRewrite={() => askBrief(r, true)}
                  onConv={() => openConv(r)}
                  onSend={(text, subject) => run(r, () => sendFollowUpAction(r.quoteRecordId, r.seen, text, subject))}
                  onAuto={(on) => run(r, () => autoFollowUpsAction(r.quoteRecordId, r.seen, on))}
                />
                    ))}
                  </div>
                ),
              )}
            </div>
          );
        })}
        {/* Preliminaries GHL's texts are handling (2026-11-09): folded; each comes back up the moment it needs a person. */}
        {tab === "list" && autoRows.length > 0 && (
          <div className="fu-sec auto">
            <h2 className="fu-h">
              <button type="button" className="linkbtn" aria-expanded={autoOpen} onClick={() => setAutoOpen((o) => !o)}>
                {autoOpen ? "▾" : "▸"} On auto: GHL&apos;s texts are handling these
              </button>{" "}
              <span className="n">{autoRows.length}</span>
            </h2>
            {!autoOpen && <p className="fu-empty">Preliminaries with little back-and-forth yet. Each moves up to Needs you or Watch as soon as the customer engages.</p>}
            {autoOpen &&
              autoRows.map((r) => (
                <div key={r.quoteRecordId} className={`fu-row auto-row${conv?.contactId === r.contactId ? " picked" : ""}${r.contactId ? " can-pick" : ""}`} onClick={(e) => !(e.target as Element).closest("a, button") && openConv(r)}>
                  <div className="fu-who">
                    <span className="fu-name-line">
                      <Link href={`/q/${r.versionId}`} className="fu-name">
                        {r.customer ?? "No customer"}
                      </Link>
                      <span className="fu-with">with {r.ownerName ?? "nobody yet"}</span>
                    </span>
                    <span className="fu-meta">
                      {r.quoteNumber ?? ""} · {r.basis ?? "Quote"}
                      {r.outside ? ` · ${r.outside.words}` : ""}
                    </span>
                  </div>
                  <div className="fu-scorecol" data-k="Score">
                    <ScoreChip row={r} dials={data.dials} />
                  </div>
                  <div className="fu-why" data-k="Why it's due">
                    <span className="chip">On auto</span>
                  </div>
                  <div className="fu-facts" data-k="Age and follow-ups">
                    <span>{r.age}</span>
                  </div>
                </div>
              ))}
          </div>
        )}
        {shown.length === 0 && who !== EVERYONE && data.rows.length > 0 && (
          <p className="fu-empty">
            None sent by {who}.{" "}
            <button type="button" className="linkbtn" onClick={() => setWho(EVERYONE)}>
              See everyone&apos;s ({data.rows.length})
            </button>
          </p>
        )}
      </section>
      {modal && <ActionModal modal={modal} data={data} busy={busy} onClose={() => setModal(null)} onRun={(f) => run(modal.row, f)} />}
      {conv && <ConversationDrawer contactId={conv.contactId} title={conv.name} openSignal={conv.signal} />}
    </>
  );
}

function Row(p: {
  row: FollowUpRow;
  today: string;
  busy: boolean;
  copied: string | null;
  brief: BriefState | undefined;
  briefsOn: boolean;
  convOn: boolean;
  onModal: (k: "lost" | "postpone" | "touch") => void;
  onSnooze: (d: number) => void;
  onVisit: () => void;
  onCopyDraft: (text: string) => void;
  onRewrite: () => void;
  onConv: () => void;
  onSend: (text: string, subject: string | null) => void;
  onAuto: (on: boolean) => void;
  dials: FollowUpPage["dials"];
}) {
  const { row, today, busy } = p;
  const r = row.due.reason.kind;
  const tone = r === "replied" || r === "expired" ? "bad" : row.due.bucket === "due" ? "warn" : "";
  const prelim = row.basis === "Preliminary";
  const lastNote = [...row.state.touches].reverse().find((t) => t.note)?.note;
  // Clicking the row (anywhere but a button or link) shows this customer's conversation (Albert, 2026-11-07).
  const pick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest("a, button, input, select, textarea, label")) return;
    p.onConv();
  };
  return (
    <div className={`fu-row${p.convOn ? " picked" : ""}${row.contactId ? " can-pick" : ""}`} onClick={pick}>
      <div className="fu-who">
        <span className="fu-name-line">
          <Link href={`/q/${row.versionId}`} className="fu-name">
            {row.customer ?? "No customer"}
          </Link>
          {/* Who the customer is talking to: whoever last sent the quote (Albert, 2026-11-07), the filter's own names. */}
          <span className="fu-with" title="Last sent the quote, so in conversation with the customer">
            with {row.ownerName ?? "nobody yet"}
          </span>
        </span>
        <span className="fu-meta">
          {row.quoteNumber ?? ""} · {row.basis ?? "Quote"}
          {row.description ? ` · ${row.description}` : ""}
        </span>
        {/* Where the lead is in the journey (2026-11-07): from the contact's GHL appointments. */}
        {row.visit && <span className={`fu-visit ${row.visit.kind}`}>{row.visitText}</span>}
        {/* Given by text or on a call (2026-11-13): marked sent, with what was said. */}
        {row.outside && <span className="chip warn fu-outside" title={row.outside.note}>{row.outside.words}</span>}
      </div>
      <div className="fu-scorecol" data-k="Score">
        <ScoreChip row={row} dials={p.dials} />
      </div>
      <div className="fu-why" data-k="Why it's due">
        <span className={`chip${tone ? ` ${tone}` : ""}`}>{row.why}</span>
        <span className="fu-when">
          {row.due.bucket === "postponed" ? "Back on the list" : "Due"} {dayWords(row.due.day, today)}
        </span>
      </div>
      <div className="fu-facts" data-k="Age and follow-ups">
        <span>{row.age}</span>
        <span>
          {row.due.touches === 0 ? "No follow-up yet" : `${row.due.touches} follow-up${row.due.touches === 1 ? "" : "s"}, last ${dayWords(row.due.lastTouch as string, today)}`}
          {!row.ghlRead && row.contactId ? " · GHL not read" : ""}
        </span>
        {row.state.postpone?.note && <span className="fu-note">Postponed: {row.state.postpone.note}</span>}
        {lastNote && <span className="fu-note">Last note: {lastNote}</span>}
      </div>
      {p.briefsOn && <BriefBox state={p.brief} row={row} open={p.convOn} busy={busy} copied={p.copied === `draft:${row.quoteRecordId}`} onCopy={p.onCopyDraft} onRewrite={p.onRewrite} onSend={p.onSend} />}
      <div className="fu-acts">
        {row.contactId && (
          <button type="button" className={`btn${p.convOn ? " on" : ""}`} onClick={p.onConv}>
            Conversation
          </button>
        )}
        {row.ghlUrl && (
          <a className="btn" href={row.ghlUrl} target="_blank" rel="noreferrer">
            Open in GHL
          </a>
        )}
        <button type="button" className="btn" disabled={busy} onClick={() => p.onModal("touch")}>
          I followed up
        </button>
        <span className="fu-snooze" role="group" aria-label="Still deciding, check again in">
          <span className="k">Snooze</span>
          {SNOOZE_CHOICES.map((d) => (
            <button key={d} type="button" className="btn small" disabled={busy} onClick={() => p.onSnooze(d)} title={`Still deciding: check again in ${d} days`}>
              {d}d
            </button>
          ))}
        </span>
        {prelim && (
          <button type="button" className="btn" onClick={p.onVisit} title="Copy the in-home measurement booking link">
            {p.copied === `visit:${row.quoteRecordId}` ? "Link copied" : "Book the visit"}
          </button>
        )}
        <button type="button" className="btn" disabled={busy} onClick={() => p.onModal("postpone")}>
          Postpone…
        </button>
        {!prelim && (
          <label className="fu-auto" title={row.state.autoOff ? "The app won't send this quote's follow-ups on its own." : row.autoWhy ? `Not on its own right now: ${row.autoWhy}` : "The app may send the next routine follow-up on its own."}>
            <input type="checkbox" checked={!row.state.autoOff} disabled={busy} onChange={(e) => p.onAuto(e.target.checked)} /> Auto follow-ups
          </label>
        )}
        <button type="button" className="btn danger" disabled={busy} onClick={() => p.onModal("lost")}>
          Lost…
        </button>
      </div>
    </div>
  );
}

/** The score (2026-11-09): roughly the chance it closes, its tier, and the top reasons. */
function ScoreChip({ row, dials }: { row: FollowUpRow; dials: FollowUpPage["dials"] }) {
  const s = row.score;
  return (
    <span className={`fu-score ${s.tier}`} title={`Score ${s.score} of 100, roughly the chance this closes. ${s.reasons.join(" · ")}`}>
      <span className="fu-score-n">{s.score}</span>
      <span className="fu-score-t">{TIER_WORDS[s.tier]}</span>
      {/* The score as a bar (Albert, 2026-11-09), with marks where Watch and Needs you start. Width is the one inline style. */}
      <span className="fu-bar" role="progressbar" aria-valuenow={s.score} aria-valuemin={0} aria-valuemax={100} aria-label={`Intent score ${s.score} of 100, ${TIER_WORDS[s.tier]}`}>
        <span className="fu-bar-fill" style={{ width: `${s.score}%` }} />
        <span className="fu-bar-tick" style={{ left: `${dials.watchAt}%` }} title={`Watch from ${dials.watchAt}`} />
        <span className="fu-bar-tick" style={{ left: `${dials.needsYouAt}%` }} title={`Needs you from ${dials.needsYouAt}`} />
      </span>
      <span className="fu-score-why">{s.reasons.join(" · ")}</span>
    </span>
  );
}

/** The brief (step 2): where it stands, what they asked, the next step and a draft to copy into GHL. */
function BriefBox({ state, row, open, busy, copied, onCopy, onRewrite, onSend }: { state: BriefState | undefined; row: FollowUpRow; open: boolean; busy: boolean; copied: boolean; onCopy: (t: string) => void; onRewrite: () => void; onSend: (text: string, subject: string | null) => void }) {
  const b = state?.brief ?? null;
  // A measured quote's draft is sent from the app (2026-11-09, round 3): editable, then Send. Preliminaries keep Copy.
  const sendable = row.basis !== "Preliminary" && Boolean(row.channel) && Boolean(b?.draft);
  // Folded to one line unless this row is the selected one (Albert, 2026-11-07: "make the brief expand only when selected").
  if (b && !open)
    return (
      <div className="fu-brief folded" title="Click the row to open the brief">
        <span className="k">Brief</span>
        <span className="fu-fold-step">{STEP_WORDS[b.step.kind]}</span>
        <span className="fu-fold-text">{b.standing}</span>
        {state?.busy && <span className="fu-brief-meta">Updating…</span>}
      </div>
    );
  if (!b && state?.busy) return <div className="fu-brief wait">Writing the brief…</div>;
  if (!b && state?.error)
    return (
      <div className="fu-brief bad">
        {state.error}{" "}
        <button type="button" className="linkbtn" onClick={onRewrite}>
          Try again
        </button>
      </div>
    );
  if (!b)
    return (
      <div className="fu-brief wait">
        No brief yet.{" "}
        <button type="button" className="linkbtn" onClick={onRewrite}>
          Write one
        </button>
      </div>
    );
  return (
    <div className="fu-brief">
      <div className="fu-brief-h">
        <span className="k">Brief</span>
        <span className="fu-brief-meta">
          {state?.busy ? "Updating…" : state?.stale ? "New activity since: updating soon" : `Written ${new Date(b.at).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" })}`}
          {!state?.busy && (
            <button type="button" className="linkbtn" onClick={onRewrite}>
              Rewrite
            </button>
          )}
        </span>
      </div>
      <p className="fu-standing">{b.standing}</p>
      {b.asked.length > 0 && (
        <ul className="fu-asked">
          {b.asked.map((a) => (
            <li key={a.text} className={a.answered ? "done" : ""}>
              <span className="tick" aria-hidden>{a.answered ? "✓" : "?"}</span>
              {a.text}
              <span className="sr">{a.answered ? " (answered)" : " (not answered yet)"}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="fu-step">
        <strong>{STEP_WORDS[b.step.kind]}.</strong> {b.step.why}
        {b.nextDay && (
          <span className="fu-named">
            {" "}
            Next follow-up {b.nextDay}
            {b.nextQuote ? `, because they said "${b.nextQuote}"` : ""}.
          </span>
        )}
      </p>
      {b.draft && sendable && <SendBox key={`${b.at}|${b.draft}`} draft={b.draft} subject={b.subject ?? ""} email={row.channel === "email"} to={`${row.customer ?? "the customer"}${row.toWords ? `, ${row.toWords}` : ""}`} busy={busy} copied={copied} onCopy={onCopy} onSend={onSend} />}
      {b.draft && !sendable && (
        <div className="fu-draft">
          <p>{b.draft}</p>
          <div className="fu-draft-acts">
            <button type="button" className="btn small" onClick={() => onCopy(b.draft)}>
              {copied ? "Copied" : "Copy"}
            </button>
            {row.ghlUrl && (
              <a className="btn small" href={row.ghlUrl} target="_blank" rel="noreferrer" onClick={() => onCopy(b.draft)}>
                Copy and open GHL
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The measured draft, editable, then Send (2026-11-09). Keyed on the brief, so a new brief starts it afresh. */
function SendBox({ draft, subject: firstSubject, email, to, busy, copied, onCopy, onSend }: { draft: string; subject: string; email: boolean; to: string; busy: boolean; copied: boolean; onCopy: (t: string) => void; onSend: (text: string, subject: string | null) => void }) {
  const [text, setText] = useState(draft);
  const [subject, setSubject] = useState(firstSubject);
  // A real customer gets it (Albert, 2026-11-09: "is there a 'you sure you want to send'"): a preview to confirm first.
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="fu-draft send">
      {email && <input className="in" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Email subject" />}
      <textarea className="in" rows={email ? 6 : 3} value={text} onChange={(e) => setText(e.target.value)} aria-label="The follow-up to send" />
      <div className="fu-draft-acts">
        <button type="button" className="btn small primary" disabled={busy || !text.trim()} onClick={() => setConfirming(true)}>
          {email ? "Send email" : "Send text"}
        </button>
        <span className="fu-brief-meta">From you, in their GHL conversation</span>
        <button type="button" className="btn small" onClick={() => onCopy(text)}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {confirming && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Send this to the customer?" onClick={() => setConfirming(false)} onKeyDown={(e) => e.key === "Escape" && setConfirming(false)}>
          <div className="modal-card fu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-h">Send this {email ? "email" : "text"} to the customer?</div>
            <div className="card-b">
              <p className="sub">
                To <strong>{to}</strong>, from your own GHL {email ? "address" : "number"}. It goes into their GHL conversation right away and can&apos;t be taken back.
              </p>
              {email && subject.trim() && (
                <p className="sub">
                  <strong>Subject:</strong> {subject}
                </p>
              )}
              <blockquote className="fu-preview">{text}</blockquote>
              <div className="fu-modal-acts">
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  autoFocus
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    onSend(text, email ? subject : null);
                  }}
                >
                  Send now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionModal({ modal, data, busy, onClose, onRun }: { modal: NonNullable<Modal>; data: FollowUpPage; busy: boolean; onClose: () => void; onRun: (f: () => Promise<FollowUpResult>) => void }) {
  const { row, kind } = modal;
  const [note, setNote] = useState("");
  const [until, setUntil] = useState("");
  // The brief's pick (2026-11-07): on a close step it names the GHL reason the conversation points to; staff confirm or change it.
  const suggested = data.lostReasons?.find((r) => r.name === row.brief?.lostReason)?.id ?? "";
  const [reason, setReason] = useState(kind === "lost" ? suggested : "");
  const first = useRef<HTMLElement | null>(null);
  useEffect(() => first.current?.focus(), []);
  const linked = Boolean(row.opportunityId);
  const title = kind === "lost" ? "Mark lost" : kind === "postpone" ? "Postpone" : "I followed up";
  const reasons = data.lostReasons ?? [];
  const needReason = kind === "lost" && linked;
  const noReasons = needReason && reasons.length === 0;
  const ready = kind === "postpone" ? until > data.today : needReason ? reason !== "" && !noReasons : true;
  const submit = () => {
    if (!ready) return;
    if (kind === "lost") onRun(() => lostAction(row.quoteRecordId, row.seen, reason, note));
    else if (kind === "postpone") onRun(() => postponeAction(row.quoteRecordId, row.seen, until, note));
    else onRun(() => followedUpAction(row.quoteRecordId, row.seen, note));
  };
  const reasonName = reasons.find((r) => r.id === reason)?.name;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`${title}: ${row.customer ?? ""}`} onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="modal-card fu-modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-h">
          {title}: {row.customer ?? row.quoteNumber}
          <button type="button" className="linkbtn right" onClick={onClose}>
            Cancel
          </button>
        </div>
        <div className="card-b">
          {kind === "touch" && <p className="sub">For a call, a visit or a talk in the store that GHL doesn&apos;t show. Texts, emails and calls in GHL already count on their own.</p>}
          {kind === "postpone" && (
            <label className="fu-field">
              <span className="k">Follow up around</span>
              <input ref={(el) => void (first.current = el)} className="in" type="date" min={data.today} value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
          )}
          {noReasons && <p className="fu-warn">GHL&apos;s lost reasons couldn&apos;t be read, so this can&apos;t be marked lost here. Mark it lost in GHL instead.</p>}
          {kind === "lost" && needReason && !noReasons && (
            <label className="fu-field">
              <span className="k">Why (GHL&apos;s lost reasons){suggested && reason === suggested ? " · suggested from the conversation" : ""}</span>
              <select ref={(el) => void (first.current = el)} className="in" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Pick a reason…</option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="fu-field">
            <span className="k">Note (optional)</span>
            <textarea ref={kind === "touch" ? (el) => void (first.current = el) : undefined} className="in" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "lost" ? "Went with someone else, $2k cheaper" : kind === "postpone" ? "Moving in March, wants it done before" : "Called, they're deciding this weekend"} />
          </label>
          {kind !== "touch" && (
            <div className="fu-will" role="note">
              <span className="k">This will</span>
              <ul>
                {kind === "lost" && (
                  <>
                    <li>{linked ? `Mark the GHL opportunity Lost${reasonName ? ` (${reasonName})` : ""}` : "Leave GHL alone (no opportunity linked)"}</li>
                    <li>Mark the quote Lost and take it off this list</li>
                    {linked && <li>Write the reason{note.trim() ? " and your note" : ""} into the opportunity&apos;s Lost Details</li>}
                  </>
                )}
                {kind === "postpone" && (
                  <>
                    <li>{linked ? `Move the opportunity to Postponed${until ? `, Postponed Until ${until}` : ""}` : "Leave GHL alone (no opportunity linked)"}</li>
                    <li>Bring it back on this list a month before the date (halfway, if it&apos;s sooner)</li>
                  </>
                )}
                <li>Take the &quot;quote sent&quot; tags off, so the automated texts stop</li>
                {note.trim() && <li>Post the note in the GHL conversation and the quote&apos;s History</li>}
              </ul>
            </div>
          )}
          <div className="fu-modal-acts">
            <button type="button" className={`btn ${kind === "lost" ? "danger" : "primary"}`} disabled={busy || !ready} onClick={submit}>
              {busy ? "Working…" : kind === "lost" ? "Mark lost" : kind === "postpone" ? "Postpone" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
