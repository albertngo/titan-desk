import { FOLLOW_UP_TAGS } from "@/lib/ghl/ids";
import { stamp } from "@/lib/quotes/history";

/**
 * Open tracking (Albert, 2026-10-27): what counts as an open, how it is recorded on the version, and
 * the words of the two GHL internal comments. Pure; tested in tests/activity.test.ts. The customer
 * deployment reports (src/lib/activity/relay.ts), the staff app records (src/lib/quotes/activity.ts).
 *
 * - An open is the customer's quote page running in a browser that is in view: a link preview or a
 *   mail scanner fetching the page never runs it. A reload within 30 minutes is the same open.
 * - A PDF download is the page's Download button only. GHL fetching the file to attach it, and the
 *   customer opening a copy they already have, are not seen.
 * - The first open of a sent version, and a summary three days after it was sent, go to the
 *   customer's GHL conversation as internal comments. On a measured quote they tag the sender; a
 *   preliminary's are the same notes with nobody tagged (its follow-up is the automation's).
 */

export const DEVICES = ["iPhone", "iPad", "Android phone", "Android tablet", "Mac", "Windows", "Chromebook", "Linux", "Other"] as const;
export type Device = (typeof DEVICES)[number];
export type ActivityKind = "open" | "pdf";

/** The device, in words, from the browser's User-Agent. */
export function deviceOf(ua: string | null | undefined): Device {
  const u = ua ?? "";
  if (/iPhone|iPod/.test(u)) return "iPhone";
  if (/iPad/.test(u)) return "iPad";
  if (/Android/.test(u)) return /Mobile/.test(u) ? "Android phone" : "Android tablet";
  if (/CrOS/.test(u)) return "Chromebook";
  if (/Windows/.test(u)) return "Windows";
  if (/Macintosh|Mac OS X/.test(u)) return "Mac";
  if (/Linux/.test(u)) return "Linux";
  return "Other";
}

/** Link previewers, scanners and crawlers: never an open, even if one runs the page. */
export function isBot(ua: string | null | undefined): boolean {
  const u = ua ?? "";
  return u === "" || /bot|crawl|spider|slurp|preview|scanner|facebookexternalhit|whatsapp|skypeuripreview|headless|lighthouse|python|curl|wget|okhttp|go-http|node-fetch|axios/i.test(u);
}

const TOKEN = /^[A-Za-z0-9]{32}$/;

/** A report from the customer deployment: {token, kind, device}. Anything else is refused. */
export function parseActivity(raw: unknown): { token: string; kind: ActivityKind; device: Device } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.token !== "string" || !TOKEN.test(r.token)) return null;
  if (r.kind !== "open" && r.kind !== "pdf") return null;
  const device = (DEVICES as readonly string[]).includes(r.device as string) ? (r.device as Device) : "Other";
  return { token: r.token, kind: r.kind, device };
}

/** A reload within this long of the last open is the same open. */
export const SAME_VISIT_MINUTES = 30;

/** What the version carries (Quote Versions → Opened Count … Activity Log). */
export type TrackState = {
  openedCount: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  pdfDownloads: number;
  activityLog: string | null;
};

const LOG_LINES_KEPT = 200;

/**
 * The version after one report. `counted` is false for a reload inside the same visit (only Last
 * Opened At moves); `firstOpen` is true for the very first open.
 */
export function applyActivity(state: TrackState, kind: ActivityKind, device: Device, now: Date): { next: TrackState; counted: boolean; firstOpen: boolean } {
  const log = (what: string) =>
    [...(state.activityLog ?? "").split("\n").filter(Boolean), `${stamp(now)} · ${what} · ${device}`].slice(-LOG_LINES_KEPT).join("\n");
  if (kind === "pdf") return { next: { ...state, pdfDownloads: state.pdfDownloads + 1, activityLog: log("PDF downloaded") }, counted: true, firstOpen: false };
  const last = state.lastOpenedAt ? Date.parse(state.lastOpenedAt) : NaN;
  if (Number.isFinite(last) && now.getTime() - last >= 0 && now.getTime() - last < SAME_VISIT_MINUTES * 60_000) {
    return { next: { ...state, lastOpenedAt: now.toISOString() }, counted: false, firstOpen: false };
  }
  return {
    next: {
      ...state,
      openedCount: state.openedCount + 1,
      firstOpenedAt: state.firstOpenedAt ?? now.toISOString(),
      lastOpenedAt: now.toISOString(),
      activityLog: log("opened"),
    },
    counted: true,
    firstOpen: state.openedCount === 0 && !state.firstOpenedAt,
  };
}

/** The log read back: opens and downloads with their devices, oldest first. */
export function activityEntries(log: string | null | undefined): { when: string; what: "opened" | "PDF downloaded"; device: string }[] {
  return (log ?? "")
    .split("\n")
    .map((l) => l.trim().split(" · "))
    .filter((p): p is [string, "opened" | "PDF downloaded", string] => p.length === 3 && (p[1] === "opened" || p[1] === "PDF downloaded"))
    .map(([when, what, device]) => ({ when, what, device }));
}

/** The devices the quote was opened on, in the order first seen. */
export function devicesSeen(log: string | null | undefined): string[] {
  return [...new Set(activityEntries(log).filter((e) => e.what === "opened").map((e) => e.device))];
}

/* ---------- the GHL comments ---------- */

/** What the comments say about the version. */
export type ActivityInfo = {
  quoteNumber: string;
  version: number | null;
  basis: string | null;
  /** YYYY-MM-DD. */
  sentAt: string | null;
  /** First name of whoever sent it; null for a shared box. */
  senderName: string | null;
  /** "Email, Text". */
  sentTo: string | null;
};

export const isMeasured = (basis: string | null | undefined) => basis !== "Preliminary";

const tz = "America/Toronto";
/** "Tue Oct 27, 2:03 pm", Toronto. */
export function whenWords(at: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).formatToParts(at);
  const part = (t: string) => (p.find((x) => x.type === t)?.value ?? "").replace(/\./g, "");
  const day = `${part("weekday")} ${part("month")} ${part("day")}`;
  const time = at.toLocaleTimeString("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s*a\.?m\.?/i, " am").replace(/\s*p\.?m\.?/i, " pm");
  return `${day}, ${time}`;
}
/** "Oct 24", from YYYY-MM-DD. */
const dayWords = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" }).replace(/\./g, "");

const what = (i: ActivityInfo) => `${i.quoteNumber}${i.version ? ` v${i.version}` : ""} (${isMeasured(i.basis) ? "measured" : "preliminary"})`;
const sentWords = (i: ActivityInfo) =>
  i.sentAt ? `Sent ${dayWords(i.sentAt)}${i.senderName ? ` by ${i.senderName}` : ""}${i.sentTo ? `, by ${i.sentTo.toLowerCase().split(", ").join(" and ")}` : ""}.` : "";
const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The first-open comment. `mention` is the tagged person's name, written in front as GHL's own mentions are. */
export function firstOpenComment(i: ActivityInfo, at: Date, device: Device, mention: string | null): string {
  return [
    `${mention ? `@${mention} ` : ""}Quote opened: ${what(i)} was opened by the customer for the first time, ${whenWords(at)} on ${device === "Other" ? "a device we couldn't name" : `${/^(iP|[AEIOU])/.test(device) ? "an" : "a"} ${device}`}.`,
    sentWords(i),
    isMeasured(i.basis) ? "A good moment to follow up." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The comment three days after sending: opens, devices, downloads, last open, or not opened yet. */
export function summaryComment(i: ActivityInfo, s: TrackState, mention: string | null): string {
  const head = `${mention ? `@${mention} ` : ""}Quote summary, ${SUMMARY_AFTER_DAYS} days after sending: ${what(i)}`;
  if (s.openedCount === 0) return `${head} has not been opened yet. ${sentWords(i)}`.trim();
  const devices = devicesSeen(s.activityLog);
  const last = s.lastOpenedAt ? ` Last opened ${whenWords(new Date(s.lastOpenedAt))}.` : "";
  const pdf = s.pdfDownloads ? ` PDF downloaded ${times(s.pdfDownloads)}.` : " PDF not downloaded.";
  return `${head} was opened ${times(s.openedCount)}${devices.length ? ` on ${list(devices.map((d) => (d === "Other" ? "another device" : d)))}` : ""}.${last}${pdf}`;
}

/** Days after sending that the summary goes. */
export const SUMMARY_AFTER_DAYS = 3;

/** The summary is due once SUMMARY_AFTER_DAYS have passed since it was sent (Toronto dates). */
export function summaryDue(sentAt: string | null, today: string): boolean {
  if (!sentAt || !/^\d{4}-\d{2}-\d{2}$/.test(sentAt) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  return (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${sentAt}T00:00:00Z`)) / 86_400_000 >= SUMMARY_AFTER_DAYS;
}

/**
 * Who a measured quote's comments tag (Albert, 2026-10-27): the person who sent it, found by email
 * among the location's users; else the user the opportunity is assigned to (usually the same
 * person); else Albert. A preliminary tags nobody.
 */
export function mentionFor(
  basis: string | null,
  senderEmail: string | null,
  users: { id: string; email: string | null; name: string | null }[],
  ownerId: string | null,
  fallbackId: string,
): { id: string; name: string | null } | null {
  if (!isMeasured(basis)) return null;
  const email = senderEmail?.trim().toLowerCase();
  const sender = email ? users.find((u) => u.email === email) : undefined;
  if (sender) return { id: sender.id, name: sender.name };
  const id = ownerId ?? fallbackId;
  return { id, name: users.find((u) => u.id === id)?.name ?? null };
}

/**
 * The follow-up tags a send sets, as the two bodies Make's `tags` route forwards: remove both quote
 * tags (the running sequence ends), then add this version's (its sequence starts again).
 */
export function followUpTagBodies(basis: string | null): { removeBody: string; addBody: string } {
  return {
    removeBody: JSON.stringify({ tags: [FOLLOW_UP_TAGS.preliminary, FOLLOW_UP_TAGS.measured] }),
    addBody: JSON.stringify({ tags: [isMeasured(basis) ? FOLLOW_UP_TAGS.measured : FOLLOW_UP_TAGS.preliminary] }),
  };
}
