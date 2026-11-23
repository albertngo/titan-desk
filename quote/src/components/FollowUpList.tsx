"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  autoFollowUpsAction,
  briefAction,
  changeStepAction,
  followedUpAction,
  logChoiceAction,
  lostAction,
  noteAction,
  postponeAction,
  reasonAction,
  sendFollowUpAction,
  snoozeAction,
} from "@/app/follow-up/actions";
import { ConversationDrawer } from "@/components/Conversation";
import { STEP_KINDS, type Brief, type StepKind } from "@/lib/followup/brief";
import { REASONS, type Group } from "@/lib/followup/choices";
import { byMorning, doneToday, dueShort, LATER, laterOf, pinOf, placeOf, primaryOf, sendableOf, shortMoney, STEP_WORDS, stepLine, summaryLine, type Done, type LaterKind, type Primary } from "@/lib/followup/morning";
import { SNOOZE_CHOICES } from "@/lib/followup/plan";
import { TIER_WORDS } from "@/lib/followup/score";
import type { ClosedToday, FollowUpPage, FollowUpResult, FollowUpRow } from "@/lib/quotes/followup";

const EVERYONE = "Everyone";
/** Briefs written at once, so a first visit doesn't ask Claude for every quote together. */
const BRIEFS_AT_ONCE = 2;

/** The Toronto day of a time; a bare day stays as it is. */
const torontoDay = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }));

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
type Result = { id: string; who: string; ok: boolean; lines: string[]; askWhy?: StepKind } | null;
type Ctx = { score: number | null; group: Group | null };

type Item = { row: FollowUpRow; done: Done | null; place: Group };

/**
 * Follow up as a morning brief (Albert, 2026-11-22; vault 05_decisions/2026-11-22-follow-up-morning-brief). A sentence
 * for the day, then one line per person with the one button that does the brief's step: Reach today (Needs you, and
 * visits owed a quote), If you have time (Watch), and everything else folded under Later. Expanding a person (one at a
 * time) shows the brief, the facts and every action, and points the conversation drawer at them. Rows done today stay,
 * ticked, at the bottom of their group. Every button records what was suggested against what was done (the choice log,
 * src/lib/followup/choices.ts); going against the suggestion offers one tap for why.
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
  const [result, setResult] = useState<Result>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Closed until a person is expanded (Albert, 2026-11-22), then it follows whoever is open.
  const [conv, setConv] = useState<{ contactId: string; name: string | null; signal: number } | null>(null);
  const [briefs, setBriefs] = useState<Record<string, BriefState>>(() =>
    Object.fromEntries(data.rows.map((r) => [r.quoteRecordId, { brief: r.brief, busy: false, error: null, stale: r.briefStale }])),
  );

  const mine = (name: string | null) => who === EVERYONE || name === who;
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const r of data.rows) {
      if (!mine(r.ownerName)) continue;
      const done = doneToday(r, data.today, torontoDay);
      out.push({ row: r, done, place: placeOf(r, done, data.today, torontoDay) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.rows, data.today, who]);
  const visits = (data.visits ?? []).filter((v) => mine(v.visitorName));
  const closed = (data.closedToday ?? []).filter((c) => mine(c.ownerName));
  const rowsIn = (g: Group) => items.filter((i) => i.place === g);
  const sorted = (g: Group) => [...rowsIn(g)].sort(byMorning);
  const reach = sorted("reach");
  const time = sorted("time");
  const later = rowsIn("later");
  const closedIn = (g: Group) => closed.filter((c) => (c.group ?? "reach") === g);

  // The sentence at the top counts Reach today: each person by the brief's step, the visits as quotes to write.
  const summary = summaryLine(who, [
    ...visits.map(() => ({ kind: "quote" as const, done: false })),
    ...reach.map((i) => ({ kind: i.row.due.reason.kind === "measure" ? ("quote" as const) : (briefs[i.row.quoteRecordId]?.brief?.step.kind ?? null), done: Boolean(i.done) })),
    ...closedIn("reach").map(() => ({ kind: "close" as const, done: true })),
  ]);
  const total = visits.length + reach.length + closedIn("reach").length;
  const doneN = reach.filter((i) => i.done).length + closedIn("reach").length;
  const countFor = (name: string) =>
    data.rows.filter((r) => r.due.bucket === "due" && r.score.tier === "needs" && !r.waiting && (name === EVERYONE || r.ownerName === name)).length +
    (data.visits ?? []).filter((v) => name === EVERYONE || v.visitorName === name).length;

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
        setResult({ id: row.quoteRecordId, who: row.customer ?? row.quoteNumber ?? "This quote", ok: r.ok, lines: r.ok ? r.notes : [r.message], ...(r.ok && r.askWhy ? { askWhy: r.askWhy } : {}) });
        if (r.ok) {
          setModal(null);
          router.refresh();
        }
      } catch {
        setResult({ id: row.quoteRecordId, who: row.customer ?? "This quote", ok: false, lines: ["Lost the connection, so it may not have gone through. Reload to check."] });
      }
    });
  };

  // Logged without waiting: Open in GHL and Copy booking link change nothing here.
  const logOnly = (row: FollowUpRow, did: "ghl" | "link", ctx: Ctx) => {
    void logChoiceAction(row.quoteRecordId, did, ctx)
      .then((r) => r.ok && r.askWhy && setResult({ id: row.quoteRecordId, who: row.customer ?? "This quote", ok: true, lines: [], askWhy: r.askWhy }))
      .catch(() => undefined);
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

  const toggle = (id: string, contactId: string | null, name: string | null) => {
    const opening = openId !== id;
    setOpenId(opening ? id : null);
    if (opening && contactId) setConv((c) => ({ contactId, name, signal: (c?.signal ?? 0) + 1 }));
  };

  const primary = (row: FollowUpRow, p: Primary, ctx: Ctx) => {
    const b = briefs[row.quoteRecordId]?.brief ?? null;
    if (p.act === "expand") return openId !== row.quoteRecordId && toggle(row.quoteRecordId, row.contactId, row.customer);
    if (p.act === "lost") return setModal({ kind: "lost", row });
    if (p.act === "snooze") return run(row, () => snoozeAction(row.quoteRecordId, row.seen, 7, ctx));
    if (p.act === "link") {
      void copy(`visit:${row.quoteRecordId}`, data.inHomeUrl, "Copy the in-home booking link:");
      return logOnly(row, "link", ctx);
    }
    if (p.act === "copyGhl" && b?.draft) void copy(`draft:${row.quoteRecordId}`, b.draft, "Copy the draft:");
    logOnly(row, "ghl", ctx);
  };

  const rowView = (i: Item) => {
    const r = i.row;
    const ctx: Ctx = { score: r.score.score, group: i.place };
    return (
      <PersonRow
        key={r.quoteRecordId}
        row={r}
        done={i.done}
        ctx={ctx}
        today={data.today}
        open={openId === r.quoteRecordId}
        busy={busy}
        copied={copied}
        brief={briefs[r.quoteRecordId]}
        briefsOn={data.briefsOn}
        dials={data.dials}
        onToggle={() => toggle(r.quoteRecordId, r.contactId, r.customer)}
        onPrimary={(p) => primary(r, p, ctx)}
        onModal={(kind) => setModal({ kind, row: r })}
        onSnooze={(d) => run(r, () => snoozeAction(r.quoteRecordId, r.seen, d, ctx))}
        onCopyDraft={(text) => copy(`draft:${r.quoteRecordId}`, text, "Copy the draft:")}
        onRewrite={() => askBrief(r, true)}
        onConv={() => r.contactId && setConv((c) => ({ contactId: r.contactId as string, name: r.customer, signal: (c?.signal ?? 0) + 1 }))}
        onGhl={() => logOnly(r, "ghl", ctx)}
        onSend={(text, subject) => run(r, () => sendFollowUpAction(r.quoteRecordId, r.seen, text, subject, ctx))}
        onAuto={(on) => run(r, () => autoFollowUpsAction(r.quoteRecordId, r.seen, on))}
        onStep={(kind) => {
          setResult(null);
          setBriefs((b) => ({ ...b, [r.quoteRecordId]: { ...b[r.quoteRecordId], busy: true, error: null } }));
          start(async () => {
            try {
              const x = await changeStepAction(r.quoteRecordId, r.seen, kind, ctx);
              setBriefs((b) => ({ ...b, [r.quoteRecordId]: { ...b[r.quoteRecordId], busy: false, ...(x.ok && x.brief ? { brief: x.brief, stale: false } : {}), error: x.ok ? null : x.message } }));
              setResult({ id: r.quoteRecordId, who: r.customer ?? "This quote", ok: x.ok, lines: x.ok ? x.notes : [x.message], ...(x.ok && x.askWhy ? { askWhy: x.askWhy } : {}) });
              if (x.ok) router.refresh();
            } catch {
              setBriefs((b) => ({ ...b, [r.quoteRecordId]: { ...b[r.quoteRecordId], busy: false, error: "Lost the connection. Try again." } }));
            }
          });
        }}
        onNote={(text) => {
          setResult(null);
          start(async () => {
            try {
              const x = await noteAction(r.quoteRecordId, r.seen, text);
              setResult({ id: r.quoteRecordId, who: r.customer ?? "This quote", ok: x.ok, lines: x.ok ? [text.trim() ? "Note saved. The brief will follow it." : "Note cleared.", ...x.notes] : [x.message] });
              if (x.ok) {
                router.refresh();
                void askBrief(r, true);
              }
            } catch {
              setResult({ id: r.quoteRecordId, who: r.customer ?? "This quote", ok: false, lines: ["Lost the connection, so it may not have been saved. Reload to check."] });
            }
          });
        }}
      />
    );
  };

  const laterCounts = LATER.map((l) => ({ ...l, rows: later.filter((i) => laterOf(i.row) === l.kind) })).filter((l) => l.rows.length);
  const laterTotal = later.length;
  const warnings = [
    !data.ghlOn && "GHL isn't connected here, so only \"I followed up\" counts and the GHL buttons are off.",
    data.ghlOn && !data.lostReasons?.length && "GHL's lost reasons couldn't be read, so Lost is off for now.",
    !data.briefsOn && "Briefs aren't set up on this deployment (the Claude key isn't set).",
    data.visits === null && data.ghlOn && "GHL's calendars couldn't be read, so visits without a quote aren't shown.",
  ].filter((w): w is string => Boolean(w));

  return (
    <>
      <section className="mb">
        <div className="mb-hello">
          <h2 className="mb-line">
            {summary.text} {summary.done && <span className="mb-done">{summary.done}</span>}
          </h2>
          <div className="mb-pills" role="group" aria-label="Last sent by">
            {[...senders, EVERYONE].map((name) => (
              <button key={name} type="button" className="mb-pill" aria-pressed={who === name} onClick={() => setWho(name)} title={`${countFor(name)} need you now`}>
                {name} <span className="n">{countFor(name)}</span>
              </button>
            ))}
          </div>
        </div>
        {total > 0 && (
          <div className="mb-progress" role="progressbar" aria-valuenow={doneN} aria-valuemin={0} aria-valuemax={total} aria-label={`${doneN} of ${total} done`}>
            <span style={{ width: `${Math.round((doneN / total) * 100)}%` }} />
          </div>
        )}
        {warnings.length > 0 && <p className="mb-warn">{warnings.join(" ")}</p>}
        {result && (
          <div className={`fu-result${result.ok ? "" : " bad"}`} role="status">
            {(!result.ok || result.lines.length > 0 || !result.askWhy) && <strong>{result.ok ? `${result.who}: done.` : `${result.who}: not done.`}</strong>}
            {result.lines.map((l) => (
              <span key={l}>{l}</span>
            ))}
            {result.ok && result.askWhy && (
              <span className="mb-why" role="group" aria-label="Why not the suggested step?">
                <span>
                  {result.who}: not the suggested step ({STEP_WORDS[result.askWhy].toLowerCase()}). Why? <span className="mb-why-opt">Optional.</span>
                </span>
                {REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    className="btn small"
                    onClick={() => {
                      const id = result.id;
                      setResult(null);
                      void reasonAction(id, reason).catch(() => undefined);
                    }}
                  >
                    {reason}
                  </button>
                ))}
              </span>
            )}
            <button type="button" className="linkbtn" onClick={() => setResult(null)}>
              Dismiss
            </button>
          </div>
        )}

        <div className="mb-group">
          <h3 className="mb-gh">
            Reach today <span className="n">{total}</span>
          </h3>
          {total === 0 ? (
            <p className="mb-empty">Nobody needs a person today.</p>
          ) : (
            <div className="mb-list">
              {visits.map((v) => (
                <div key={v.contactId} className={`mb-row${openId === `v:${v.contactId}` ? " open" : ""}`}>
                  <div className="mb-line-row" onClick={(e) => !(e.target as Element).closest("a, button") && toggle(`v:${v.contactId}`, v.contactId, v.name)}>
                    <span className="mb-score none" title="No quote to score yet">
                      <span className="sr-only">No score yet</span>
                    </span>
                    <span className="mb-who">
                      <span className="mb-name">{v.name ?? "Customer"}</span>
                      <span className="mb-sub">
                        {v.visitorName ? `with ${v.visitorName}` : "visit, no quote yet"}
                      </span>
                    </span>
                    <span className="mb-step">
                      <span className="mb-pin">Owed</span>
                      {v.rescheduling ? (
                        <>
                          <b>Waiting on them to rebook:</b> called off {dayWords(v.rescheduling.day, data.today)} by text
                        </>
                      ) : (
                        <>
                          <b>Write the measured quote:</b> visited {v.days === 0 ? "today" : `${v.days} day${v.days === 1 ? "" : "s"} ago`}, {v.quote?.quoteNumber ? "nothing sent since" : "no quote in the app yet"}
                        </>
                      )}
                    </span>
                    <span className="mb-due late">{v.days === 0 ? "today" : `${v.days} day${v.days === 1 ? "" : "s"}`}</span>
                    <Link className="btn primary mb-go" href={v.quote?.versionId ? `/q/${v.quote.versionId}/edit` : "/new"}>
                      {v.quote?.versionId ? "Write quote" : "Start a quote"}
                    </Link>
                    <span className="mb-chev" aria-hidden>
                      ⌄
                    </span>
                  </div>
                  {openId === `v:${v.contactId}` && (
                    <div className="mb-more">
                      <div className="mb-facts">
                        <div>{v.quote?.quoteNumber ? `${v.quote.quoteNumber} · no measured quote sent since the visit` : "No quote in the app yet"}</div>
                        <div>
                          Visited {dayWords(v.day, data.today)} · {v.where}
                        </div>
                      </div>
                      <div className="mb-acts">
                        <a className="btn small" href={v.ghlUrl} target="_blank" rel="noreferrer">
                          Open in GHL
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {reach.filter((i) => !i.done).map(rowView)}
              {reach.filter((i) => i.done).map(rowView)}
              {closedIn("reach").map((c) => (
                <ClosedRow key={c.quoteRecordId} c={c} />
              ))}
            </div>
          )}
        </div>

        {(time.length > 0 || closedIn("time").length > 0) && (
          <div className="mb-group">
            <h3 className="mb-gh">
              If you have time <span className="n">{time.length + closedIn("time").length}</span> <span className="mb-hint">some interest, not hot yet</span>
            </h3>
            <div className="mb-list">
              {time.map(rowView)}
              {closedIn("time").map((c) => (
                <ClosedRow key={c.quoteRecordId} c={c} />
              ))}
            </div>
          </div>
        )}

        {laterTotal > 0 && (
          <details className="mb-later">
            <summary>
              Later <span className="n">{laterTotal}</span> <span className="mb-hint">· {laterCounts.map((l) => `${l.title.toLowerCase()} ${l.rows.length}`).join(" · ")}</span>
            </summary>
            {laterCounts.map((l) => (
              <div key={l.kind} className={`mb-later-sec ${l.kind satisfies LaterKind}`}>
                <h4 className="mb-lh">
                  {l.title} <span className="n">{l.rows.length}</span> <span className="mb-hint">{l.hint}</span>
                </h4>
                <div className="mb-list">{[...l.rows].sort(byMorning).map(rowView)}</div>
              </div>
            ))}
            {closedIn("later").map((c) => (
              <ClosedRow key={c.quoteRecordId} c={c} />
            ))}
          </details>
        )}

        {items.length === 0 && who !== EVERYONE && data.rows.length > 0 && (
          <p className="mb-empty">
            None sent by {who}.{" "}
            <button type="button" className="linkbtn" onClick={() => setWho(EVERYONE)}>
              See everyone&apos;s ({data.rows.length})
            </button>
          </p>
        )}
      </section>
      {modal && <ActionModal modal={modal} data={data} busy={busy} ctx={{ score: modal.row.score.score, group: items.find((i) => i.row.quoteRecordId === modal.row.quoteRecordId)?.place ?? null }} onClose={() => setModal(null)} onRun={(f) => run(modal.row, f)} />}
      {conv && <ConversationDrawer contactId={conv.contactId} title={conv.name} openSignal={conv.signal} />}
    </>
  );
}

/** A quote marked Lost today: ticked, until tomorrow (2026-11-22). */
function ClosedRow({ c }: { c: ClosedToday }) {
  return (
    <div className="mb-row done">
      <div className="mb-line-row">
        <span className="mb-score">{c.score ?? ""}</span>
        <span className="mb-who">
          {c.versionId ? (
            <Link href={`/q/${c.versionId}`} className="mb-name">
              {c.customer ?? "No customer"}
            </Link>
          ) : (
            <span className="mb-name">{c.customer ?? "No customer"}</span>
          )}
          <span className="mb-sub">
            with {c.ownerName ?? "nobody yet"}
            {shortMoney(c.value) ? ` · ${shortMoney(c.value)}` : ""}
          </span>
        </span>
        <span className="mb-step">{c.reason ? `Lost: ${c.reason}` : "Lost"}</span>
        <span className="mb-due" />
        <span className="mb-donetag">✓ Marked lost</span>
        <span className="mb-chev" aria-hidden />
      </div>
    </div>
  );
}

function PersonRow(p: {
  row: FollowUpRow;
  done: Done | null;
  ctx: Ctx;
  today: string;
  open: boolean;
  busy: boolean;
  copied: string | null;
  brief: BriefState | undefined;
  briefsOn: boolean;
  dials: FollowUpPage["dials"];
  onToggle: () => void;
  onPrimary: (p: Primary) => void;
  onModal: (k: "lost" | "postpone" | "touch") => void;
  onSnooze: (d: number) => void;
  onCopyDraft: (text: string) => void;
  onRewrite: () => void;
  onConv: () => void;
  onGhl: () => void;
  onSend: (text: string, subject: string | null) => void;
  onAuto: (on: boolean) => void;
  onStep: (kind: StepKind) => void;
  onNote: (text: string) => void;
}) {
  const { row, today, busy, open, done } = p;
  const b = p.brief?.brief ?? null;
  const pin = pinOf(row);
  const line = stepLine(b, row.why);
  const prime = primaryOf(row, b);
  const late = row.due.bucket === "due" && row.due.day < today;
  const prelim = row.basis === "Preliminary";
  const lastNote = [...row.state.touches].reverse().find((t) => t.note && !t.note.startsWith("App "))?.note;
  const money = shortMoney(row.value);
  const pick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest("a, button, input, select, textarea, label")) return;
    p.onToggle();
  };
  const primaryEl =
    prime.act === "ghl" || prime.act === "copyGhl" ? (
      <a className="btn primary mb-go" href={row.ghlUrl as string} target="_blank" rel="noreferrer" onClick={() => p.onPrimary(prime)}>
        {prime.act === "copyGhl" && p.copied === `draft:${row.quoteRecordId}` ? "Copied, GHL open" : prime.label}
      </a>
    ) : (
      <button type="button" className="btn primary mb-go" disabled={busy && prime.act === "snooze"} onClick={() => p.onPrimary(prime)}>
        {prime.act === "link" && p.copied === `visit:${row.quoteRecordId}` ? "Link copied" : prime.label}
      </button>
    );
  return (
    <div className={`mb-row${open ? " open" : ""}${done ? " done" : ""}`}>
      <div className="mb-line-row" onClick={pick}>
        <span className={`mb-score ${row.score.tier}`} title={`Score ${row.score.score} of 100, ${TIER_WORDS[row.score.tier]}. ${row.score.reasons.join(" · ")}`}>
          {row.score.score}
        </span>
        <span className="mb-who">
          <Link href={`/q/${row.versionId}`} className="mb-name">
            {row.customer ?? "No customer"}
          </Link>
          <span className="mb-sub">
            with {row.ownerName ?? "nobody yet"}
            {money ? ` · ${money}` : ""}
          </span>
        </span>
        <span className="mb-step">
          {pin && <span className="mb-pin">{pin}</span>}
          {p.brief?.busy && !b ? (
            <span className="mb-wait">Writing the brief…</span>
          ) : (
            <>
              {line.lead && <b>{line.lead}:</b>} {line.text}
            </>
          )}
        </span>
        <span className={`mb-due${late ? " late" : ""}`}>{row.due.bucket === "due" || row.due.bucket === "upcoming" ? dueShort(row.due.day, today) : dayWords(row.due.day, today)}</span>
        {done ? <span className="mb-donetag">✓ {done.words}</span> : primaryEl}
        <button type="button" className="mb-chev" aria-expanded={open} aria-label={open ? "Less" : "More"} onClick={p.onToggle}>
          ⌄
        </button>
      </div>
      {open && (
        <div className="mb-more">
          <div className="mb-brief">
            {p.briefsOn ? <BriefBox state={p.brief} row={row} busy={busy} copied={p.copied === `draft:${row.quoteRecordId}`} onCopy={p.onCopyDraft} onRewrite={p.onRewrite} onSend={p.onSend} onStep={p.onStep} /> : <p className="mb-muted">{row.why}</p>}
          </div>
          <div className="mb-facts">
            <div className="mb-scoreblock">
              <span>
                <b>Score {row.score.score}</b>, {TIER_WORDS[row.score.tier]}
              </span>
              <span className={`fu-bar ${row.score.tier}`} role="progressbar" aria-valuenow={row.score.score} aria-valuemin={0} aria-valuemax={100} aria-label={`Intent score ${row.score.score} of 100`}>
                <span className={`fu-bar-fill ${row.score.tier}`} style={{ width: `${row.score.score}%` }} />
                <span className="fu-bar-tick" style={{ left: `${p.dials.watchAt}%` }} title={`Watch from ${p.dials.watchAt}`} />
                <span className="fu-bar-tick" style={{ left: `${p.dials.needsYouAt}%` }} title={`Needs you from ${p.dials.needsYouAt}`} />
              </span>
              <span className="mb-muted">{row.score.reasons.join(" · ")}</span>
            </div>
            <div>
              <b>{row.quoteNumber ?? "Quote"}</b> · {row.basis ?? "Quote"}
              {row.description ? ` · ${row.description}` : ""}
            </div>
            {row.visitText && <div>{row.visitText}</div>}
            {row.outside && <div title={row.outside.note}>{row.outside.words}</div>}
            <div>
              {row.why} · due {dayWords(row.due.day, today)}
            </div>
            <div>
              {row.age} · {row.due.touches === 0 ? "no follow-up yet" : `${row.due.touches} follow-up${row.due.touches === 1 ? "" : "s"}, last ${dayWords(row.due.lastTouch as string, today)}`}
              {!row.ghlRead && row.contactId ? " · GHL not read" : ""}
            </div>
            {row.state.postpone?.note && <div>Postponed: {row.state.postpone.note}</div>}
            {lastNote && <div>Last note: {lastNote}</div>}
            <NoteBox note={row.note?.text ?? ""} busy={busy} onSave={p.onNote} />
          </div>
          <div className="mb-acts">
            {row.contactId && (
              <button type="button" className="btn small" onClick={p.onConv}>
                Conversation
              </button>
            )}
            {row.ghlUrl && (
              <a className="btn small" href={row.ghlUrl} target="_blank" rel="noreferrer" onClick={p.onGhl}>
                Open in GHL
              </a>
            )}
            <button type="button" className="btn small" disabled={busy} onClick={() => p.onModal("touch")}>
              I followed up
            </button>
            <span className="mb-snooze" role="group" aria-label="Still deciding, check again in">
              <span className="k">Snooze</span>
              {SNOOZE_CHOICES.map((d) => (
                <button key={d} type="button" className="btn small" disabled={busy} onClick={() => p.onSnooze(d)} title={`Still deciding: check again in ${d} days`}>
                  {d}d
                </button>
              ))}
            </span>
            {prelim && prime.act !== "link" && (
              <button type="button" className="btn small" onClick={() => p.onPrimary({ label: "Copy booking link", act: "link" })} title="Copy the in-home measurement booking link">
                {p.copied === `visit:${row.quoteRecordId}` ? "Link copied" : "Copy booking link"}
              </button>
            )}
            <button type="button" className="btn small" disabled={busy} onClick={() => p.onModal("postpone")}>
              Postpone…
            </button>
            {!prelim && (
              <label className="mb-auto" title={row.state.autoOff ? "The app won't send this quote's follow-ups on its own." : row.autoWhy ? `Not on its own right now: ${row.autoWhy}` : "The app may send the next routine follow-up on its own."}>
                <input type="checkbox" checked={!row.state.autoOff} disabled={busy} onChange={(e) => p.onAuto(e.target.checked)} /> Auto follow-ups
              </label>
            )}
            <button type="button" className="btn small danger mb-lost" disabled={busy} onClick={() => p.onModal("lost")}>
              Lost…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The customer's standing note for the brief (2026-11-22): every brief follows it, on this quote and their next. */
function NoteBox({ note, busy, onSave }: { note: string; busy: boolean; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note);
  if (!editing)
    return (
      <div className="mb-note">
        <span className="k">Note for the brief</span>
        {note ? <span className="mb-note-text">{note}</span> : <span className="mb-muted">None. Add one the brief should always follow, like &quot;wife decides, call evenings&quot;.</span>}
        <button
          type="button"
          className="linkbtn"
          onClick={() => {
            setText(note);
            setEditing(true);
          }}
        >
          {note ? "Edit" : "Add"}
        </button>
      </div>
    );
  return (
    <div className="mb-note editing">
      <span className="k">Note for the brief</span>
      <textarea className="in" rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="Wife decides, call evenings" aria-label="Note for the brief" autoFocus />
      <div className="mb-note-acts">
        <button
          type="button"
          className="btn small primary"
          disabled={busy || text.trim() === note.trim()}
          onClick={() => {
            onSave(text);
            setEditing(false);
          }}
        >
          Save
        </button>
        {note && (
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={() => {
              onSave("");
              setEditing(false);
            }}
          >
            Clear
          </button>
        )}
        <button type="button" className="linkbtn" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      <span className="mb-muted">Also goes into their GHL conversation as an internal comment.</span>
    </div>
  );
}

/** The brief, open: where it stands, what they asked, the step (staff can pick another) and the draft. */
function BriefBox({ state, row, busy, copied, onCopy, onRewrite, onSend, onStep }: { state: BriefState | undefined; row: FollowUpRow; busy: boolean; copied: boolean; onCopy: (t: string) => void; onRewrite: () => void; onSend: (text: string, subject: string | null) => void; onStep: (k: StepKind) => void }) {
  const b = state?.brief ?? null;
  const sendable = sendableOf(row, b);
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
  const picked = row.state.stepOverride && row.state.stepOverride.basedOn === b.basedOn ? row.state.stepOverride : null;
  return (
    <div className="fu-brief mb-briefbox">
      <div className="fu-brief-h">
        <label className="mb-steppick">
          <span className="k">Next step</span>
          <select className="in" value={b.step.kind} disabled={busy || state?.busy} onChange={(e) => onStep(e.target.value as StepKind)} aria-label="Next step">
            {STEP_KINDS.map((k) => (
              <option key={k} value={k}>
                {STEP_WORDS[k]}
              </option>
            ))}
          </select>
          {picked && <span className="mb-muted">picked by {picked.by.split("@")[0]}</span>}
        </label>
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
              <span className="tick" aria-hidden>
                {a.answered ? "✓" : "?"}
              </span>
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

function ActionModal({ modal, data, busy, ctx, onClose, onRun }: { modal: NonNullable<Modal>; data: FollowUpPage; busy: boolean; ctx: Ctx; onClose: () => void; onRun: (f: () => Promise<FollowUpResult>) => void }) {
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
    if (kind === "lost") onRun(() => lostAction(row.quoteRecordId, row.seen, reason, note, ctx));
    else if (kind === "postpone") onRun(() => postponeAction(row.quoteRecordId, row.seen, until, note, ctx));
    else onRun(() => followedUpAction(row.quoteRecordId, row.seen, note, ctx));
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
                    <li>Mark the quote Lost; it stays on today&apos;s list, ticked, until tomorrow</li>
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
