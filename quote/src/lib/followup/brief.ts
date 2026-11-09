/**
 * The Follow up brief (Albert, 2026-11-07; vault 05_decisions/2026-11-07-quote-follow-up-worklist, step 2). Pure:
 * the words Claude is given, the cleaning of what it gives back, and the signature that says when a kept brief is
 * still current. src/lib/quotes/brief.ts reads, asks and keeps. Tested in tests/followup.test.ts.
 *
 * What Claude is given: the quote's customer-facing facts (number, basis, options and their customer totals, when it
 * was sent, the good-until date, opens), and the GHL thread with call summaries. Never a cost, a margin or a
 * contractor: front-desk staff read the brief (decision: "no margin, since staff read it").
 */

export const STEP_KINDS = ["call", "text", "email", "visit", "wait", "close"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export type Brief = {
  /** Where it stands, one or two sentences. */
  standing: string;
  /** What the customer asked or pushed back on, and whether we answered. */
  asked: { text: string; answered: boolean }[];
  step: { kind: StepKind; why: string };
  /** The message for that step, in our voice, for staff to copy into GHL. Empty for wait / close. */
  draft: string;
  /** The day the customer named ("next week"), as a date, and the words it came from; null when they named none. */
  nextDay: string | null;
  nextQuote: string | null;
  /** On a "close" step, the GHL lost reason the conversation points to, by its exact name, for the Lost dropdown to start on. */
  lostReason?: string | null;
  /**
   * What the conversation shows about intent (2026-11-09), for the score in src/lib/followup/score.ts. Missing on a
   * brief written before then, which the score reads as "not known", never as "no".
   */
  signals?: {
    buyingQuestion: boolean;
    namedDate: boolean;
    competitor: boolean;
    objection: boolean;
    commercial: boolean;
    complaint: boolean;
    /** The customer's latest message: intent (a question, a plan, a date), a closer ("thanks, will look"), or FYI. */
    replyClass: "intent" | "closer" | "fyi" | "none";
  } | null;
  /** The signature it was written for; a different one means something happened since. */
  basedOn: string;
  at: string;
  model: string;
};

export type ThreadLine = { at: string | null; who: "customer" | "staff" | "automated" | "note"; channel: string; body: string | null; subject?: string | null; callSeconds?: number | null; id: string; status?: string | null };

/**
 * What a kept brief was written from: the newest thing in the thread, the opens, the follow-ups logged here, and the
 * postpone. Any of them moving means a new brief.
 */
export function briefSignature(i: { lastMessage: { id: string; at: string | null } | null; opens: number; touches: number; postponeUntil: string | null; sentAt: string; visit?: string | null }): string {
  return [i.sentAt, i.lastMessage ? `${i.lastMessage.id}@${i.lastMessage.at ?? ""}` : "none", `o${i.opens}`, `t${i.touches}`, `p${i.postponeUntil ?? ""}`, `v${i.visit ?? ""}`].join("|");
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** Claude's answer, cleaned: anything missing or the wrong shape is dropped or blanked, never guessed. Null when nothing usable came back. */
export function cleanBrief(raw: unknown, meta: { basedOn: string; at: string; model: string; today: string; lostReasons?: readonly string[] }): Brief | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const standing = clip(d.standing, 400);
  if (!standing) return null;
  const asked = Array.isArray(d.asked)
    ? (d.asked as Record<string, unknown>[])
        .map((a) => ({ text: clip(a?.text, 200), answered: a?.answered === true }))
        .filter((a) => a.text)
        .slice(0, 5)
    : [];
  const s = (d.step ?? {}) as Record<string, unknown>;
  const kind = (STEP_KINDS as readonly string[]).includes(String(s.kind)) ? (s.kind as StepKind) : "text";
  const rawDraft = typeof d.draft === "string" ? d.draft.trim().slice(0, 1200) : "";
  const draft = kind === "wait" || kind === "close" ? "" : rawDraft;
  // A named day counts only when it is a real date after today and within a year.
  const next = typeof d.nextDay === "string" && DAY.test(d.nextDay) && !Number.isNaN(Date.parse(d.nextDay)) ? d.nextDay : null;
  const nextDay = next && next > meta.today && Date.parse(next) - Date.parse(meta.today) <= 366 * 86_400_000 ? next : null;
  return {
    standing,
    asked,
    step: { kind, why: clip(s.why, 240) },
    draft,
    nextDay,
    nextQuote: nextDay ? clip(d.nextQuote, 160) || null : null,
    // Only one of GHL's own reasons, word for word, and only when the step is to close it out.
    signals: cleanSignals(d.signals),
    ...(kind === "close" && typeof d.lostReason === "string" && (!meta.lostReasons || meta.lostReasons.includes(d.lostReason)) ? { lostReason: clip(d.lostReason, 120) } : {}),
    basedOn: meta.basedOn,
    at: meta.at,
    model: meta.model,
  };
}

const REPLY_CLASSES = ["intent", "closer", "fyi", "none"] as const;

/** The signals block, cleaned: only booleans that came back true count; a missing block is null (not known). */
function cleanSignals(v: unknown): Brief["signals"] {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  const yes = (k: string) => d[k] === true;
  const rc = String(d.replyClass);
  return {
    buyingQuestion: yes("buyingQuestion"),
    namedDate: yes("namedDate"),
    competitor: yes("competitor"),
    objection: yes("objection"),
    commercial: yes("commercial"),
    complaint: yes("complaint"),
    replyClass: (REPLY_CLASSES as readonly string[]).includes(rc) ? (rc as (typeof REPLY_CLASSES)[number]) : "none",
  };
}

/** A kept brief, read back from Quotes → Follow Up; null when it isn't one. */
export function parseBrief(v: unknown): Brief | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (typeof d.basedOn !== "string" || typeof d.at !== "string") return null;
  // A kept day was checked against the day it was written; read it back against that same day.
  const writtenDay = /^\d{4}-\d{2}-\d{2}/.exec(d.at)?.[0] ?? "0000-00-00";
  return cleanBrief(d, { basedOn: d.basedOn, at: d.at, model: typeof d.model === "string" ? d.model : "", today: writtenDay }) ?? null;
}

const whoWords: Record<ThreadLine["who"], string> = { customer: "CUSTOMER", staff: "TITAN STAFF", automated: "AUTOMATED (workflow)", note: "INTERNAL NOTE (staff only; call summaries live here)" };

export type BriefFacts = {
  today: string;
  customer: string | null;
  quoteNumber: string | null;
  basis: string | null;
  sentDay: string;
  age: number;
  validUntil: string | null;
  opens: number;
  lastOpened: string | null;
  options: { name: string; total: number | null }[];
  sender: string | null;
  typicalCloseDay: number;
  scheduleDays: readonly number[];
  postponedTo: string | null;
  loggedHere: { at: string; note?: string }[];
  /** Where the lead is: "No visit yet", "Visit booked Nov 12 · in-home", "Visited Nov 4 · in store"… */
  visit: string;
  /** GHL's lost reasons by name, for "lostReason" on a close step. */
  lostReasons?: readonly string[];
  /** Where visits went ahead, so the brief can steer a home-only lead to the store and the other way round. */
  visitedWhere?: readonly string[];
  /**
   * Real open in-home slots in the next days (2026-11-09: "a firm date offered… we have an opening and I happen to be
   * in the area"), from GHL's calendar. `near` = right next to another visit booked that day. Never invented.
   */
  openSlots?: { label: string; near: boolean }[];
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;

/** The one message Claude gets. The schema rides in the words (as the site-sheet reader learned, 2026-10-28). */
export function briefPrompt(f: BriefFacts, lines: ThreadLine[]): string {
  const thread = lines
    .map((l) => {
      const when = l.at ? l.at.slice(0, 16).replace("T", " ") : "?";
      const call = l.channel === "call" ? ` (call, ${l.callSeconds ? `${Math.round(l.callSeconds / 60)} min` : "not connected"})` : "";
      const body = [l.subject ? `Subject: ${l.subject}` : "", l.body ?? ""].filter(Boolean).join(" | ").replace(/\s+/g, " ").slice(0, 900);
      const failed = l.who !== "customer" && /^(failed|undelivered|bounced?|error|rejected)$/.test((l.status ?? "").toLowerCase()) ? " [NOT DELIVERED]" : "";
      return `[${when}] ${whoWords[l.who]} via ${l.channel}${call}${failed}: ${body || "(no text)"}`;
    })
    .join("\n");
  const opts = f.options.length ? f.options.map((o) => `- ${o.name}${o.total != null ? `: ${money(o.total)} with HST` : ""}`).join("\n") : "- (no priced option)";
  return `You help Titan Flooring (a flooring installer in the Toronto area) follow up on quotes it has sent. Read the facts and the customer's conversation, then write a short brief for the staff member who will follow up.

Today is ${f.today}.

QUOTE
- Customer: ${f.customer ?? "unknown"}
- Quote: ${f.quoteNumber ?? "?"} (${f.basis ?? "quote"}). A Preliminary is a rough estimate sent as a price range before anyone has measured; the next step for one is usually booking an in-home measure or a store visit. A Measured quote is the real price after a site visit; the next step is the customer accepting.
- Sent ${f.sentDay}, ${f.age} days ago, by ${f.sender ?? "staff"}. Most quotes close by about day ${f.typicalCloseDay}.
- Good until: ${f.validUntil ?? "no date (preliminary)"}
- Visit (from GHL appointments): ${f.visit}. A preliminary with no visit yet should usually be steered to booking one; a preliminary whose visit has happened is owed a measured quote, so say so.
- The customer has opened the quote link ${f.opens} time${f.opens === 1 ? "" : "s"}${f.lastOpened ? `, last on ${f.lastOpened.slice(0, 10)}` : ""}.
- Options:
${opts}
${f.visitedWhere?.length ? `- Visits that went ahead: ${f.visitedWhere.join(", ")}. A customer seen both at home and in the store closes about 4 in 5; home only or store only, about 1 in 4.\n` : ""}${f.openSlots?.length ? `- Real open in-home measure slots (GHL calendar): ${f.openSlots.map((x) => `${x.label}${x.near ? " (we already have a visit that day)" : ""}`).join("; ")}\n` : ""}${f.postponedTo ? `- Postponed: the customer asked to be followed up around ${f.postponedTo}.\n` : ""}${f.loggedHere.length ? `- Follow-ups staff logged outside GHL: ${f.loggedHere.map((t) => `${t.at.slice(0, 10)}${t.note ? ` (${t.note})` : ""}`).join("; ")}\n` : ""}
CONVERSATION (oldest first; internal notes are never seen by the customer)
${thread || "(no messages)"}

Write the brief as ONE JSON object and nothing else:
{
  "standing": "1-2 plain sentences: where this stands and how warm it is.",
  "asked": [{"text": "what the customer asked or pushed back on", "answered": true or false}],
  "step": {"kind": "call" | "text" | "email" | "visit" | "wait" | "close", "why": "one sentence"},
  "draft": "the message for that step, ready to send",
  "nextDay": "YYYY-MM-DD or null",
  "nextQuote": "the customer's exact words that gave nextDay, or null",
  "lostReason": "only when step is close: exactly one of ${(f.lostReasons ?? []).map((r) => JSON.stringify(r)).join(", ") || "(none)"}, else null",
  "signals": {"buyingQuestion": bool, "namedDate": bool, "competitor": bool, "objection": bool, "commercial": bool, "complaint": bool, "replyClass": "intent" | "closer" | "fyi" | "none"}
}

Rules:
- Only what the conversation shows. Never invent a price, a promise, a date or a detail. If the thread is empty, say so.
- "asked": at most 5, newest first; [] when there are none. "answered" is true only if a Titan reply in the thread answers it.
- "step": "call" for a warm customer with open questions or a large job; "text" for a quick nudge; "email" when they wrote by email; "visit" to book a measure or store visit (preliminaries); "wait" when the customer said when to come back and that day hasn't come; "close" when they clearly said no or went elsewhere.
- "draft": written as ${f.sender ? `the person who sent the quote (${f.sender}), signed with their first name` : "Titan staff, signed with a first name placeholder [Name]"}. Warm, short and specific to what they said. A text is under 300 characters, plain ASCII (straight quotes, no emoji, no dashes other than -). An email may be a few short lines. For a call, the 2-3 points to raise. Empty string for "wait" or "close". Never mention internal notes, costs or margins.
- "visit" steps: a preliminary with no visit should be offered one. When real open slots are listed above, offer ONE of them by its day and time, preferring one where we already have a visit that day: "We have an opening Thursday, Nov 12 at 2pm. Want me to hold it for you?". Never say "in the area", "nearby", "close by" or name a city or neighbourhood, unless the CONVERSATION itself (a message or a call summary) says where the customer is; then only their place as they said it ("for your place in Markham"), never a claim about where we are or our route. The address on file is often wrong. Never offer a time that isn't listed. A measured quote whose customer was measured at home but has not been in the store: invite them to the showroom to see and touch the floor before deciding. Seen in the store but never measured: offer the measure.
- A MEASURED quote the customer has never opened (0 opens) and hasn't written about since it went: the step is "call", with 2-3 points (did it arrive, the total, what's included, the next step); the draft is a backup text that states the total in the message, so they don't need the link.
- If a Titan message carrying the quote shows as failed or undelivered, the step is "call": confirm their email and number, then resend.
- "signals", about the CUSTOMER's own messages only (false when unsure): buyingQuestion = asked about price, timing, install dates or availability; namedDate = named a day or window for the work or a visit; competitor = mentioned another company or another quote; objection = pushed back (price too high, thinking about it, waiting on a partner); commercial = a contractor, business, landlord or multi-unit job; complaint = unhappy with Titan. replyClass is about their LATEST message: "intent" when it asks something or makes a plan, "closer" for thanks / ok / sounds good / will look, "fyi" for information with nothing to answer, "none" when they haven't written since the quote.
- "nextDay": only when the customer named a time to come back ("next week", "after the holidays", "in March"): the date that means, after today. Otherwise null.`;
}
