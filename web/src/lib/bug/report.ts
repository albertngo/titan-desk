/**
 * Report a bug (Albert, 2026-10-28): any staff member can send Albert a bug from the header of
 * either staff app. It lands as a Tactical Task, "BUG FIX: Desk App (<app>) <summary>", assigned to
 * him, with the screenshots on the page and the details written underneath.
 *
 * Pure, no I/O. The same file lives in quote/ and web/ (src/lib/bug/report.ts); quote's
 * tests/bug.test.ts fails if the two copies drift. Notion ids are not secrets; the token is.
 */

export const BUG = {
  /** ✅ Tactical Tasks List, Titan Flooring HQ (titan-agents platform-settings/notion-destinations.json). */
  database: "238596a4-505f-81f2-8eb0-c7599aa1745a",
  /** Albert's Notion person id (same registry, people.albert). */
  assignee: "c39aa5d3-c87c-4152-92ef-5ed13d9c4605",
  maxImages: 5,
  /** Vercel refuses a request body over 4.5 MB, so the browser shrinks screenshots before sending. */
  maxTotalBytes: 4_000_000,
  summaryMax: 120,
} as const;

export type BugApp = "Quotes" | "Catalogue";

export const URGENCY = [
  { key: "blocking", label: "Blocking my work", priority: "high" },
  { key: "annoying", label: "Annoying", priority: "medium" },
  { key: "minor", label: "Minor", priority: "low" },
] as const;
export type Urgency = (typeof URGENCY)[number]["key"];

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif"]);

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** Why this report can't be sent, in words for the person sending it; null when it can. */
export function checkReport(r: { summary: unknown; urgency: unknown; images: { type: string; size: number }[] }): string | null {
  const summary = typeof r.summary === "string" ? oneLine(r.summary) : "";
  if (summary.length < 3) return "Say in a few words what went wrong.";
  if (summary.length > BUG.summaryMax) return `Keep the summary under ${BUG.summaryMax} characters; there's room for detail in the screenshots.`;
  if (!URGENCY.some((u) => u.key === r.urgency)) return "Pick how urgent it is.";
  if (r.images.length > BUG.maxImages) return `Up to ${BUG.maxImages} screenshots.`;
  if (r.images.some((f) => !IMAGE_TYPES.has(f.type))) return "Screenshots must be images (PNG, JPEG, WebP, GIF or HEIC).";
  if (r.images.reduce((n, f) => n + f.size, 0) > BUG.maxTotalBytes) return "The screenshots are too big together. Remove one and try again.";
  return null;
}

export const bugTitle = (app: BugApp, summary: string) => `BUG FIX: Desk App (${app}) ${oneLine(summary)}`;

/** "iPhone · Safari", "Windows · Edge": enough to reproduce, never the whole user agent. */
export function deviceOf(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const os = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "Chromebook" : /Linux/.test(ua) ? "Linux" : null;
  const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
  const parts = [os, browser].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** The page the bug was on: an http(s) address on the app's own host, else nothing. */
export function pageOf(raw: unknown, host: string | null): string | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (host && u.host !== host) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const torontoTime = (d: Date) =>
  d.toLocaleString("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).replace(/\./g, "");

export type BugReport = {
  app: BugApp;
  summary: string;
  urgency: Urgency;
  page: string | null;
  reporter: { email: string; name: string | null };
  at: Date;
  device: string | null;
  screen: string | null;
};

type Text = { type: "text"; text: { content: string; link?: { url: string } | null } };
const text = (content: string, url?: string | null): Text => ({ type: "text", text: { content, ...(url ? { link: { url } } : {}) } });
const para = (...rich: Text[]) => ({ object: "block", type: "paragraph", paragraph: { rich_text: rich } });
const bullet = (label: string, value: string, url?: string | null) => ({
  object: "block",
  type: "bulleted_list_item",
  bulleted_list_item: { rich_text: [{ ...text(`${label}: `), annotations: { bold: true } }, text(value, url)] },
});

/**
 * The Notion "create a page" body: the task's properties, then the details and the screenshots
 * (Notion file-upload ids) as the page. A screenshot that failed to upload is counted, not lost
 * silently.
 */
export function taskBody(r: BugReport, uploadIds: string[], failed: number) {
  const who = r.reporter.name ? `${r.reporter.name} (${r.reporter.email})` : r.reporter.email;
  const when = torontoTime(r.at);
  const urgency = URGENCY.find((u) => u.key === r.urgency)!;
  const details = [
    bullet("Reported by", who),
    bullet("When", when),
    bullet("App", r.app),
    ...(r.page ? [bullet("Page", r.page, r.page)] : []),
    bullet("How urgent", urgency.label),
    ...(r.device ? [bullet("Device", r.device)] : []),
    ...(r.screen ? [bullet("Screen", r.screen)] : []),
  ];
  const shots = uploadIds.map((id) => ({ object: "block", type: "image", image: { type: "file_upload", file_upload: { id } } }));
  return {
    parent: { database_id: BUG.database },
    properties: {
      Name: { title: [text(bugTitle(r.app, r.summary))] },
      Status: { status: { name: "Not started" } },
      "Assign To": { people: [{ id: BUG.assignee }] },
      Priority: { select: { name: urgency.priority } },
      ...(r.page ? { url: { url: r.page } } : {}),
      Notes: { rich_text: [text(`Reported from the ${r.app} app by ${who}, ${when}.`)] },
    },
    children: [
      ...details,
      ...(shots.length || failed ? [{ object: "block", type: "heading_3", heading_3: { rich_text: [text("Screenshots")] } }] : []),
      ...shots,
      ...(failed ? [para(text(`${failed} screenshot${failed === 1 ? "" : "s"} could not be uploaded.`))] : []),
    ],
  };
}
