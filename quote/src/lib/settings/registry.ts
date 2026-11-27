/**
 * The app's switches and dials (Albert, 2026-11-10: "for all the items that are permission / turn on/off based; can
 * these sit in a settings panel?… anything and everything that is possible"). Pure: what each setting is, its default,
 * and how a typed value is checked. Stored one row per key in the Airtable "App Settings" table
 * (src/lib/settings/settings.ts); keys, tokens and webhook addresses stay in Vercel and never appear here.
 * Tested in tests/settings.test.ts.
 */

export type Kind = "switch" | "number" | "emails" | "phone";
/** `empty`: an emails setting that may be cleared to nobody (the admin list may not, so someone can still open Settings). */
export type Def = { key: string; group: string; label: string; help: string; kind: Kind; min?: number; max?: number; unit?: string; empty?: boolean };

export const DEFS = [
  { key: "autoFollowUps", group: "Follow up: sending", label: "Automatic follow-ups", help: "Routine measured check-ins and nudges go out on their own, under every guardrail below. Each quote's own Auto follow-ups box still applies.", kind: "switch" },
  { key: "autoValueLimit", group: "Follow up: sending", label: "No automatic send at or above", help: "Jobs this size or bigger always get a person's tap.", kind: "number", min: 0, max: 1_000_000, unit: "$" },
  { key: "autoMaxMessages", group: "Follow up: sending", label: "Most automatic messages per quote", help: "After this many, a person takes over.", kind: "number", min: 1, max: 20 },
  { key: "autoGapHours", group: "Follow up: sending", label: "Hours between automatic messages", help: "At least this long since the app's last message to that customer.", kind: "number", min: 12, max: 336, unit: "h" },
  { key: "sendFrom", group: "Follow up: sending", label: "Automatic sending starts at", help: "Toronto time, Monday to Saturday.", kind: "number", min: 6, max: 20, unit: ":00" },
  { key: "sendTo", group: "Follow up: sending", label: "Automatic sending stops at", help: "Toronto time. Nothing goes at or after this hour.", kind: "number", min: 8, max: 22, unit: ":00" },
  { key: "needsYouAt", group: "Follow up: score", label: "Needs you from", help: "A score at or above this is Needs you.", kind: "number", min: 1, max: 100 },
  { key: "watchAt", group: "Follow up: score", label: "Watch from", help: "Below Needs you and at or above this is Watch; under it, a preliminary goes On auto.", kind: "number", min: 0, max: 99 },
  { key: "hotAt", group: "Follow up: score", label: "WhatsApp alert from", help: "A Needs you quote at or above this score (or with a flag) alerts.", kind: "number", min: 1, max: 100 },
  { key: "dailyCap", group: "Follow up: score", label: "Needs you a person a day", help: "Past this, the rest wait under Next up. Flags never wait.", kind: "number", min: 1, max: 50 },
  { key: "briefsPerRun", group: "Follow up: briefs", label: "Briefs rewritten each hour", help: "Stale briefs rewritten by the hourly run, at most.", kind: "number", min: 0, max: 50 },
  { key: "alertsOn", group: "Alerts", label: "WhatsApp alerts", help: "Hot quotes send one WhatsApp to the number below. Needs the Make alert route.", kind: "switch" },
  { key: "alertTo", group: "Alerts", label: "Alerts go to", help: "One WhatsApp number, with the country code (+1…). A test number first.", kind: "phone" },
  { key: "alertsPerRead", group: "Alerts", label: "Most alerts at once", help: "Per page read, so a full list can't flood the phone.", kind: "number", min: 1, max: 20 },
  { key: "lightspeedCustomers", group: "POS customers", label: "Lightspeed customers", help: "A won customer is found or created in Lightspeed when a quote is accepted, or started for someone already won. Never edits an existing customer.", kind: "switch" },
  { key: "hikeCustomers", group: "POS customers", label: "Hike customers", help: "The same, in Hike.", kind: "switch" },
  { key: "onlyThemselves", group: "Sending: who as whom", label: "Nobody else can send as", help: "Comma-separated sign-in emails. Each can send as anyone on the team, and is a choice only for themselves: nobody else can pick them on the Send card. Everyone else can send as each other.", kind: "emails", empty: true },
  { key: "markSentEmails", group: "Sending: who as whom", label: "Who can mark a quote sent without sending", help: "Comma-separated sign-in emails. They get Mark as sent on the Send card: the version is locked and counted as sent, with its link ready to copy, and nothing goes to the customer. Empty: nobody.", kind: "emails", empty: true },
  { key: "stairsRangeLowMargin", group: "Pricing: stairs", label: "Stairs range, low end at margin", help: "A preliminary's stairs priced step by step (not a Stair Profile) go as a range from the price at this margin up to the calculated price, never more than 20% under it. Profiles keep the usual range.", kind: "number", min: 0, max: 90, unit: "%" },
  { key: "stairsMarginFloor", group: "Pricing: stairs", label: "Stairs margin floor", help: "A stairs option priced under this margin shows a warning on its price card. It never stops a send.", kind: "number", min: 0, max: 90, unit: "%" },
  { key: "adminEmails", group: "Access", label: "Who sees Performance and Settings", help: "Comma-separated sign-in emails. They must also be allowed into the app.", kind: "emails" },
] as const satisfies readonly Def[];

export type Key = (typeof DEFS)[number]["key"];
export type Settings = {
  autoFollowUps: boolean;
  autoValueLimit: number;
  autoMaxMessages: number;
  autoGapHours: number;
  sendFrom: number;
  sendTo: number;
  needsYouAt: number;
  watchAt: number;
  hotAt: number;
  dailyCap: number;
  briefsPerRun: number;
  alertsOn: boolean;
  alertTo: string;
  alertsPerRead: number;
  lightspeedCustomers: boolean;
  hikeCustomers: boolean;
  onlyThemselves: string[];
  markSentEmails: string[];
  adminEmails: string[];
  stairsRangeLowMargin: number;
  stairsMarginFloor: number;
};

/** The settings that are lists of sign-in emails. */
type EmailsKey = "onlyThemselves" | "markSentEmails" | "adminEmails";

/** What applies when the table has no row: the old Vercel variable where there was one, else the built-in number. */
export function defaults(env: Record<string, string | undefined>): Settings {
  return {
    autoFollowUps: env.QUOTE_AUTO_FOLLOWUPS === "on",
    autoValueLimit: 25_000,
    autoMaxMessages: 4,
    autoGapHours: 48,
    sendFrom: 9,
    sendTo: 19,
    needsYouAt: 20,
    watchAt: 8,
    hotAt: 33,
    dailyCap: 8,
    briefsPerRun: 10,
    alertsOn: Boolean(env.QUOTE_ALERT_TO),
    alertTo: env.QUOTE_ALERT_TO ?? "",
    alertsPerRead: 5,
    // Live from the start (Albert, 2026-11-23); nothing goes until QUOTE_MAKE_POS_HOOK and _KEY are set.
    lightspeedCustomers: true,
    hikeCustomers: true,
    // Albert, 2026-11-05: "Only Albert logged in has himself as the option"; 2026-11-17: mark as sent "for admin ALBERT only".
    onlyThemselves: ["albert@titanfloors.ca"],
    markSentEmails: ["albert@titanfloors.ca"],
    adminEmails: emails(env.QUOTE_ADMIN_EMAILS ?? ""),
    // Albert, 2026-11-26: the customer anchors at the low end, so it sits at 40%, leaving room above the 35% floor.
    stairsRangeLowMargin: 40,
    stairsMarginFloor: 35,
  };
}

const emails = (raw: string) => [...new Set(raw.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)))];

export const defOf = (key: string) => DEFS.find((d) => d.key === key) as Def | undefined;

/** A typed value, checked: the stored text, or a message in plain words. */
export function checkValue(key: string, raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const d = defOf(key);
  if (!d) return { ok: false, message: "That isn't a setting." };
  const v = raw.trim();
  if (d.kind === "switch") return v === "on" || v === "off" ? { ok: true, value: v } : { ok: false, message: "Pick on or off." };
  if (d.kind === "number") {
    const n = Number(v.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, message: "Type a whole number." };
    if ((d.min !== undefined && n < d.min) || (d.max !== undefined && n > d.max)) return { ok: false, message: `Between ${d.min} and ${d.max}.` };
    return { ok: true, value: String(n) };
  }
  if (d.kind === "phone") {
    if (!v) return { ok: true, value: "" };
    const digits = v.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) return { ok: false, message: "A phone number with its country code, like +14165550100." };
    return { ok: true, value: `+${digits.length === 10 ? `1${digits}` : digits}` };
  }
  const list = emails(v);
  if (!list.length && d.empty && !v) return { ok: true, value: "" };
  if (!list.length) return { ok: false, message: d.empty ? "Type sign-in emails, or clear the box for nobody." : "At least one email, so someone can still open Settings." };
  return { ok: true, value: list.join(", ") };
}

/** The stored rows over the defaults. A row that no longer checks out is ignored (the default holds), never guessed. */
export function merge(base: Settings, rows: { key: string; value: string }[]): Settings {
  const out: Settings = { ...base, onlyThemselves: [...base.onlyThemselves], markSentEmails: [...base.markSentEmails], adminEmails: [...base.adminEmails] };
  for (const r of rows) {
    const c = checkValue(r.key, r.value ?? "");
    if (!c.ok) continue;
    const d = defOf(r.key) as Def;
    const k = r.key as Key;
    if (d.kind === "switch") (out as Record<string, unknown>)[k] = c.value === "on";
    else if (d.kind === "number") (out as Record<string, unknown>)[k] = Number(c.value);
    else if (d.kind === "emails") out[k as EmailsKey] = emails(c.value);
    else (out as Record<string, unknown>)[k] = c.value;
  }
  // The thresholds must stay in order, or the tiers stop making sense.
  if (out.watchAt >= out.needsYouAt) out.watchAt = Math.max(0, out.needsYouAt - 1);
  if (out.sendTo <= out.sendFrom) out.sendTo = Math.min(23, out.sendFrom + 1);
  return out;
}

/** The value as the form shows it. */
export function shown(s: Settings, key: Key): string {
  const v = s[key];
  if (typeof v === "boolean") return v ? "on" : "off";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
