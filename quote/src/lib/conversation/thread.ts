/**
 * The customer's GHL conversation, as the quote screens show it (Albert, 2026-10-20). Pure:
 * takes what the GHL API returns and gives back a thread the screen can draw. No fetch, no
 * secrets; tested in tests/conversation.test.ts with invented messages.
 *
 * GHL's message list gives each message a type number, a messageType name ("TYPE_SMS"), a
 * direction, a body, a date, a status, a source ("app", "workflow", "api"…) and a list of
 * attachment URLs. Shapes have varied between releases, so every read here is defensive.
 */

export type Channel = "sms" | "email" | "call" | "chat" | "note" | "activity" | "other";

export type Attachment = {
  url: string;
  /**
   * Shown inline as a picture, played inline (a voicemail or call recording), or a link to open.
   * Decided by the URL's extension; without one, a call's attachment is its recording and anything
   * else is tried as a picture.
   */
  kind: "image" | "audio" | "file";
  /** The file name from the URL, for the link text. */
  name: string;
};

export type Message = {
  id: string;
  channel: Channel;
  /** What the screen calls the channel ("Text", "Email", "Call"…). */
  label: string;
  direction: "in" | "out";
  body: string | null;
  subject: string | null;
  attachments: Attachment[];
  /** ISO time; null when GHL gave none. */
  at: string | null;
  status: string | null;
  /** Sent by a workflow, campaign or bulk action, or an activity entry: shown with the rest, drawn lighter. */
  automated: boolean;
  callSeconds: number | null;
  /** The id to fetch the full email with when the list gave no body. */
  emailId: string | null;
};

export type ThreadSummary = {
  total: number;
  photos: number;
  automated: number;
  /** When the customer last wrote / was last written to (ISO). */
  lastIn: string | null;
  lastOut: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** GHL's numeric message types, for responses that carry the number and not the name. */
const TYPE_NUMBERS: Record<number, string> = {
  1: "TYPE_CALL",
  2: "TYPE_SMS",
  3: "TYPE_EMAIL",
  4: "TYPE_SMS_REVIEW_REQUEST",
  5: "TYPE_WEBCHAT",
  6: "TYPE_SMS_NO_SHOW_REQUEST",
  7: "TYPE_CAMPAIGN_SMS",
  8: "TYPE_CAMPAIGN_EMAIL",
  9: "TYPE_CAMPAIGN_CALL",
  10: "TYPE_CAMPAIGN_VOICEMAIL",
  11: "TYPE_FACEBOOK",
  12: "TYPE_CAMPAIGN_FACEBOOK",
  13: "TYPE_CAMPAIGN_MANUAL_CALL",
  14: "TYPE_CAMPAIGN_MANUAL_SMS",
  15: "TYPE_GMB",
  16: "TYPE_CAMPAIGN_GMB",
  17: "TYPE_REVIEW",
  18: "TYPE_INSTAGRAM",
  19: "TYPE_WHATSAPP",
  20: "TYPE_CUSTOM_SMS",
  21: "TYPE_CUSTOM_EMAIL",
  22: "TYPE_CUSTOM_PROVIDER_SMS",
  23: "TYPE_CUSTOM_PROVIDER_EMAIL",
  24: "TYPE_IVR_CALL",
  25: "TYPE_ACTIVITY_CONTACT",
  26: "TYPE_ACTIVITY_INVOICE",
  27: "TYPE_ACTIVITY_PAYMENT",
  28: "TYPE_ACTIVITY_OPPORTUNITY",
  29: "TYPE_LIVE_CHAT",
  30: "TYPE_LIVE_CHAT_INFO_MESSAGE",
  31: "TYPE_ACTIVITY_APPOINTMENT",
  32: "TYPE_FACEBOOK_COMMENT",
  33: "TYPE_INSTAGRAM_COMMENT",
  34: "TYPE_ACTIVITY",
  35: "TYPE_INTERNAL_COMMENT",
};

const LABELS: Record<Channel, string> = {
  sms: "Text",
  email: "Email",
  call: "Call",
  chat: "Chat",
  note: "Internal note",
  activity: "Activity",
  other: "Message",
};

/** The channel a GHL message type name belongs to. */
export function channelOf(messageType: string | null): Channel {
  const t = (messageType ?? "").toUpperCase();
  if (!t) return "other";
  if (t.includes("INTERNAL_COMMENT")) return "note";
  if (t.includes("ACTIVITY") || t.includes("INFO_MESSAGE")) return "activity";
  // VOICEMAIL contains EMAIL: calls are decided first.
  if (t.includes("CALL") || t.includes("VOICEMAIL")) return "call";
  if (t.includes("SMS")) return "sms";
  if (t.includes("EMAIL")) return "email";
  if (["WEBCHAT", "LIVE_CHAT", "WHATSAPP", "FACEBOOK", "INSTAGRAM", "GMB", "REVIEW"].some((k) => t.includes(k))) return "chat";
  return "other";
}

/** Sent by a machine, not a person: a workflow, campaign or bulk action, or GHL's own activity entries. */
export function isAutomated(messageType: string | null, source: string | null): boolean {
  const t = (messageType ?? "").toUpperCase();
  const s = (source ?? "").toLowerCase();
  if (["workflow", "campaign", "bulk_actions", "bulk_action", "automation", "trigger"].includes(s)) return true;
  return ["CAMPAIGN", "REVIEW_REQUEST", "NO_SHOW", "ACTIVITY", "IVR", "INFO_MESSAGE"].some((k) => t.includes(k));
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|amr|webm)$/i;
const FILE_EXT = /\.[a-z0-9]{2,5}$/i;

/**
 * An attachment the screen may show: https only. The kind follows the extension; without one, a
 * call's attachment is its recording (a voicemail is never a photo, Albert 2026-10-21) and anything
 * else is tried as a picture.
 */
export function attachmentOf(raw: unknown, channel: Channel = "other"): Attachment | null {
  const url = typeof raw === "string" ? raw.trim() : typeof raw === "object" && raw !== null ? str((raw as Record<string, unknown>).url) : null;
  if (!url || !/^https:\/\//i.test(url)) return null;
  let pathname = url;
  try {
    pathname = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  const name = pathname.split("/").filter(Boolean).pop() ?? "attachment";
  const kind: Attachment["kind"] = IMAGE_EXT.test(name)
    ? "image"
    : AUDIO_EXT.test(name) || (channel === "call" && !FILE_EXT.test(name))
      ? "audio"
      : !FILE_EXT.test(name)
        ? "image"
        : "file";
  return { url, kind, name };
}

/** A readable version of an HTML email: tags gone, entities decoded, blank lines collapsed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseOne(raw: unknown): Message | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const id = str(m.id);
  if (!id) return null;
  const typeNumber = typeof m.type === "number" ? TYPE_NUMBERS[m.type] ?? null : null;
  const messageType = str(m.messageType) ?? typeNumber;
  const channel = channelOf(messageType);
  const meta = typeof m.meta === "object" && m.meta !== null ? (m.meta as Record<string, unknown>) : {};
  const email = typeof meta.email === "object" && meta.email !== null ? (meta.email as Record<string, unknown>) : {};
  const call = typeof meta.call === "object" && meta.call !== null ? (meta.call as Record<string, unknown>) : {};
  const emailIds = Array.isArray(email.messageIds) ? email.messageIds.filter((x): x is string => typeof x === "string") : [];
  const rawBody = str(m.body);
  const body = rawBody && channel === "email" && /<[a-z][\s\S]*>/i.test(rawBody) ? htmlToText(rawBody) || null : rawBody;
  const direction = str(m.direction)?.toLowerCase() === "inbound" ? "in" : "out";
  const attachments = (Array.isArray(m.attachments) ? m.attachments : []).map((a) => attachmentOf(a, channel)).filter((a): a is Attachment => a !== null);
  const seconds = typeof call.duration === "number" && call.duration >= 0 ? Math.round(call.duration) : null;
  return {
    id,
    channel,
    label: LABELS[channel],
    direction,
    body,
    subject: str(email.subject) ?? str(m.subject),
    attachments,
    at: str(m.dateAdded) ?? str(m.createdAt),
    status: str(m.status)?.toLowerCase() ?? null,
    automated: isAutomated(messageType, str(m.source)),
    callSeconds: seconds,
    emailId: channel === "email" ? (emailIds[0] ?? str(m.emailMessageId) ?? id) : null,
  };
}

/**
 * The messages in one GHL "get messages" answer, oldest first. GHL has wrapped the list as
 * `{messages: {messages: [...]}}`, `{messages: [...]}` and a bare array; all three are read.
 */
export function parseMessages(raw: unknown): Message[] {
  let list: unknown = raw;
  for (let i = 0; i < 2 && typeof list === "object" && list !== null && !Array.isArray(list); i++) {
    list = (list as Record<string, unknown>).messages;
  }
  if (!Array.isArray(list)) return [];
  return sortThread(list.map(parseOne).filter((m): m is Message => m !== null));
}

/** Whether a "get messages" answer says there are older messages past this page. */
export function hasMore(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const outer = raw as Record<string, unknown>;
  const inner = typeof outer.messages === "object" && outer.messages !== null && !Array.isArray(outer.messages) ? (outer.messages as Record<string, unknown>) : outer;
  return inner.nextPage === true;
}

/** Oldest first, one entry per id, undated messages last. */
export function sortThread(messages: Message[]): Message[] {
  const seen = new Set<string>();
  return messages
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .sort((a, b) => {
      if (a.at === null || b.at === null) return a.at === null ? (b.at === null ? 0 : 1) : -1;
      return a.at.localeCompare(b.at);
    });
}

/** Every picture in the thread, newest first, for the photo strip. */
export function photos(messages: Message[]): Attachment[] {
  return [...messages].reverse().flatMap((m) => m.attachments.filter((a) => a.kind === "image"));
}

/** The whole thread counts (Albert, 2026-10-20): automated messages are shown with the rest, only drawn differently. */
export function summarize(messages: Message[]): ThreadSummary {
  const last = (dir: Message["direction"]) => messages.filter((m) => m.direction === dir && m.at).map((m) => m.at as string).sort().pop() ?? null;
  return {
    total: messages.length,
    photos: photos(messages).length,
    automated: messages.filter((m) => m.automated).length,
    lastIn: last("in"),
    lastOut: last("out"),
  };
}

/** How much of an email shows before "Show full email" (Albert, 2026-10-20): a peek, not the whole thing. */
export const PEEK_CHARS = 160;

/**
 * The first lines of an email, cut at a word so it reads as a sentence start. `more` says a
 * fuller body is waiting behind it; a short email is shown whole and never gets a toggle.
 */
export function emailPeek(body: string, max = PEEK_CHARS): { peek: string; more: boolean } {
  const text = body.trim();
  const firstBreak = text.indexOf("\n\n");
  const paragraph = firstBreak > 0 ? text.slice(0, firstBreak).trim() : text;
  if (paragraph.length <= max && paragraph.length === text.length) return { peek: text, more: false };
  let cut = paragraph.slice(0, max);
  if (paragraph.length > max) {
    const space = cut.lastIndexOf(" ");
    if (space > max / 2) cut = cut.slice(0, space);
    cut = cut.replace(/[\s,;:.!?-]+$/, "") + "…";
  }
  return { peek: cut, more: true };
}

/** "3 min" / "45 s" for a call's length. */
export function callLength(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 60) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
}
