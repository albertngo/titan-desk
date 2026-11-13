/**
 * A price given outside the app (Albert, 2026-11-13: "When a manual quote is provided through sms or phone convo; the
 * system should 'create' a draft in the quote app with the item (as a custom item) in the install section with the
 * price… Then mark it as 'sent' but note that it was given through another channel"; "app should read on its own. and
 * use the already available quote. creating a new one only if it needs to"; "As of right now; no quote should auto
 * sent"). Vault 05_decisions/2026-11-13-quote-price-given-outside-app.
 *
 * Pure: which messages are worth asking Claude about, the prompt, cleaning its answer, and what to do with it. The
 * reads and writes are in src/lib/quotes/followup.ts (the twice-a-day recheck). Nothing here sends anything to a
 * customer, and nothing anywhere in the recheck does.
 */
import type { Message } from "@/lib/conversation/thread";

export type OffChannelHow = "sms" | "email" | "call";
export const HOW_WORDS: Record<OffChannelHow, string> = { sms: "by text", email: "by email outside the app", call: "on a call" };
/** The chip and the badge ("Sent by text"). */
export const SENT_WORDS: Record<OffChannelHow, string> = { sms: "Sent by text", email: "Sent by email", call: "Given on a call" };

/** What the recheck keeps on Quotes → Follow Up when it finds one (state.offChannel). */
export type OffChannel = {
  /** When the price was given (the message's time). */
  at: string;
  how: OffChannelHow;
  /** Firm: one price for named work. Ballpark: a range or "around". Only firm marks the quote sent. */
  kind: "firm" | "ballpark";
  /** Dollars, as said. A ballpark keeps its low and high. */
  amount: number | null;
  low?: number | null;
  high?: number | null;
  /** Whether the words said HST on top, included, or nothing. */
  hst: "plus" | "included" | "unknown";
  /** What the price was for, in a few words ("main floor vinyl install"). */
  what: string;
  /** The line it was read from, short. */
  quote: string;
  messageId: string;
  /** What the recheck did: matched an existing option, added a custom option, or only noted it. */
  did: "matched" | "added" | "noted";
  /** The option it matched or added, when there is one. */
  optionId?: string | null;
  found: string;
};

/** A dollar figure in a message: "$4,850", "4850 dollars", "$4.8k", "4.8k". */
const MONEY = /\$\s?\d[\d,]*(\.\d+)?\s?k?\b|\b\d[\d,]*(\.\d+)?\s?k\b|\b\d[\d,]{2,}(\.\d+)?\s?(dollars|bucks|\+\s?hst|plus hst)\b/i;
export const hasMoney = (s: string | null | undefined) => Boolean(s && MONEY.test(s));

/** Notes the quote app itself posts (open tracking, follow-up buttons): never a price someone gave. */
const APP_NOTE = /^(quote (opened|summary)|opened |follow-up:|first open|the quote app|q-\d+ (opened|was opened))/i;

/**
 * The messages that could hold a price we gave: our own human texts, emails and chats, and internal comments (call
 * summaries come in as those, Make 4951497), since `since`, with a dollar figure in them. Customer messages are left
 * out of this test (they quote other people's prices) but go to Claude as context.
 */
/** The app's own quote messages (src/lib/send/plan.ts) and any message carrying a customer quote link. */
const APP_SEND = /\/c\/[A-Za-z0-9_-]{8,}|thanks for telling us about your project|your (rough |measured )?([a-z]+ )?(estimate|quote) is (ready|\$)/i;
/** How close to a send the app made a message counts as that send (GHL's time can lag Airtable's a little). */
const APP_SEND_MINUTES = 15;

export function priceCandidates(messages: Message[], since: string | null, appSends: readonly string[] = []): Message[] {
  const sends = appSends.map((x) => Date.parse(x)).filter((t) => !Number.isNaN(t));
  const nearSend = (at: string | null) => Boolean(at) && sends.some((t) => Math.abs(Date.parse(at as string) - t) <= APP_SEND_MINUTES * 60_000);
  return messages.filter((m) => {
    if (since && m.at && m.at < since) return false;
    if (!m.body || !hasMoney(m.body)) return false;
    if (m.channel === "note") return !APP_NOTE.test(m.body.trim());
    // The app's own quote sends and follow-ups (2026-11-13: Q-1054's preliminary text read as a ballpark) are never a price given outside it.
    if (APP_SEND.test(m.body) || nearSend(m.at)) return false;
    return m.direction === "out" && !m.automated && (m.channel === "sms" || m.channel === "email" || m.channel === "chat");
  });
}

export type OffChannelFacts = { today: string; customer: string | null; quoteNumber: string | null; options: { name: string; total: number | null }[] };

const short = (s: string | null, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** The prompt: the thread around the candidates, and exactly what to return. */
export function offChannelPrompt(f: OffChannelFacts, messages: Message[], candidateIds: string[]): string {
  const lines = messages.slice(-40).map((m) => {
    const who = m.channel === "note" ? "internal note (call summaries arrive as these)" : m.automated ? "automated" : m.direction === "in" ? "customer" : "staff";
    return `[${m.id}] ${m.at ?? "?"} ${who} ${m.channel}${candidateIds.includes(m.id) ? " (has a dollar figure)" : ""}: ${short(m.body, 700)}`;
  });
  return [
    "You read a flooring company's conversation with one customer. Decide whether our staff gave the customer a price outside the quoting app: in a text, an email, or on a call (call summaries appear as internal notes).",
    "Only a price WE gave counts. A customer repeating another company's price, a supplier cost, a deposit or payment amount, an invoice, or a price that is part of a quote link the app sent does not count.",
    "firm = one price for named work (\"$4,850 installed\", \"it'll be 3200 plus HST for the stairs\"). ballpark = a range or a rough figure (\"around 4 to 5k\", \"roughly 3k\", \"ballpark\").",
    "If several prices were given, return the most recent one we gave.",
    `Today is ${f.today}. Customer: ${f.customer ?? "unknown"}. Quote ${f.quoteNumber ?? "(no number)"} in the app has these options: ${f.options.length ? f.options.map((o) => `${o.name} ${o.total === null ? "(no total)" : `$${o.total}`}`).join("; ") : "none"}.`,
    "",
    "Conversation, oldest first:",
    ...lines,
    "",
    "Return only JSON, no prose:",
    '{"found": bool, "messageId": "the [id] it was in", "kind": "firm" | "ballpark", "amount": number | null, "low": number | null, "high": number | null, "hst": "plus" | "included" | "unknown", "what": "what it was for, at most 8 words", "quote": "the words it was said in, at most 160 characters, copied"}',
  ].join("\n");
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1_000_000 ? Math.round(v * 100) / 100 : null);

/** Claude's answer, cleaned; null when nothing was found or the answer doesn't hold up against the thread. */
export function cleanOffChannel(raw: unknown, messages: Message[], candidateIds: string[]): Omit<OffChannel, "did" | "optionId" | "found"> | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.found !== true || typeof d.messageId !== "string") return null;
  // It must point at one of the messages that had a dollar figure, so a made-up line can never mark a quote sent.
  if (!candidateIds.includes(d.messageId)) return null;
  const m = messages.find((x) => x.id === d.messageId);
  if (!m || !m.at) return null;
  const kind = d.kind === "firm" ? "firm" : d.kind === "ballpark" ? "ballpark" : null;
  if (!kind) return null;
  const amount = num(d.amount);
  const low = num(d.low);
  const high = num(d.high);
  if (kind === "firm" && amount === null) return null;
  if (kind === "ballpark" && amount === null && low === null && high === null) return null;
  const how: OffChannelHow = m.channel === "note" ? "call" : m.channel === "email" ? "email" : "sms";
  const quote = short(typeof d.quote === "string" ? d.quote : "", 160) || short(m.body, 160);
  return {
    at: m.at,
    how,
    kind,
    amount,
    ...(kind === "ballpark" ? { low, high } : {}),
    hst: d.hst === "plus" ? "plus" : d.hst === "included" ? "included" : "unknown",
    what: short(typeof d.what === "string" ? d.what : "", 80) || "the work discussed",
    quote: quote.replace(/[\u2013\u2014]/g, "-"),
    messageId: m.id,
  };
}

/** An option's total matches a firm price within a dollar, either side of HST. */
export function matchingOption(options: { id: string; total: number | null; preHst?: number | null; notOffered?: boolean }[], amount: number): string | null {
  const near = (x: number | null | undefined) => typeof x === "number" && Math.abs(x - amount) <= 1;
  return options.find((o) => !o.notOffered && (near(o.total) || near(o.preHst)))?.id ?? null;
}

/**
 * What the recheck does with a find:
 * - a ballpark: a note only, never marked sent;
 * - a firm price an option already carries: that option, marked sent by the channel;
 * - a firm price nothing carries: one custom option, one Install line at that price, marked sent by the channel.
 */
export function offChannelPlan(found: Pick<OffChannel, "kind" | "amount">, options: Parameters<typeof matchingOption>[0]): { did: OffChannel["did"]; optionId: string | null } {
  if (found.kind !== "firm" || found.amount === null) return { did: "noted", optionId: null };
  const match = matchingOption(options, found.amount);
  return match ? { did: "matched", optionId: match } : { did: "added", optionId: null };
}

/** The custom option's name and its one line's words. */
export function addedOptionName(f: Pick<OffChannel, "how" | "at">, torontoDay: (iso: string) => string): string {
  return `Price given ${HOW_WORDS[f.how]} ${torontoDay(f.at)}`.slice(0, 80);
}

/** The note on the quote and the version's History: what was said, how, and when. */
export function offChannelNote(f: Pick<OffChannel, "how" | "kind" | "amount" | "low" | "high" | "hst" | "quote" | "what" | "at">, torontoDay: (iso: string) => string): string {
  const price = f.kind === "firm" ? `$${f.amount}` : f.low !== null && f.low !== undefined && f.high ? `$${f.low} to $${f.high}` : `about $${f.amount}`;
  const hst = f.hst === "plus" ? " plus HST" : f.hst === "included" ? " with HST" : "";
  const label = f.kind === "firm" ? (f.how === "call" ? "Given verbally" : "Sent through messages") : "Ballpark only";
  return `${label}: ${price}${hst} for ${f.what}, ${HOW_WORDS[f.how]} on ${torontoDay(f.at)}. "${f.quote}" Not sent from the app.`;
}

/** The message the Send card fills in for the formal copy; staff edit it and send it themselves. */
export function formalCopyMessage(how: OffChannelHow): string {
  const where = how === "call" ? "on the phone" : how === "email" ? "by email" : "by text";
  return `Here's the written copy of the price we went over ${where}, so you have everything in one place.`;
}

export function parseOffChannel(v: unknown): OffChannel | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  const how = d.how === "sms" || d.how === "email" || d.how === "call" ? d.how : null;
  const kind = d.kind === "firm" || d.kind === "ballpark" ? d.kind : null;
  const did = d.did === "matched" || d.did === "added" || d.did === "noted" ? d.did : null;
  if (!how || !kind || !did || typeof d.at !== "string" || Number.isNaN(Date.parse(d.at)) || typeof d.messageId !== "string") return null;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const s = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
  return {
    at: d.at,
    how,
    kind,
    amount: n(d.amount),
    ...(kind === "ballpark" ? { low: n(d.low), high: n(d.high) } : {}),
    hst: d.hst === "plus" ? "plus" : d.hst === "included" ? "included" : "unknown",
    what: s(d.what, 80),
    quote: s(d.quote, 160),
    messageId: s(d.messageId, 80),
    did,
    optionId: typeof d.optionId === "string" ? d.optionId : null,
    found: typeof d.found === "string" ? d.found : d.at,
  };
}

/** Marked sent outside the app: a firm price, and no send from the app after it. */
export const sentOutside = (o: OffChannel | null | undefined, lastAppSend: string | null): o is OffChannel => Boolean(o && o.kind === "firm" && (!lastAppSend || lastAppSend < o.at));
