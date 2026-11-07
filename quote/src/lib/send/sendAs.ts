/**
 * Send as someone else. Pure rules, no I/O: who can be chosen, and checking a choice on the server.
 *
 * 2026-11-04 (Albert): "give ALBERT an option to select who I want it sent out from? Only Albert has the option to".
 * 2026-11-05 (Albert): "Lets open up the 'choose' sender option for people that isn't Albert. BUT Albert is not an
 * option. Only Albert logged in has himself as the option"; "number and email sent is the same person"; "lets make the
 * picker always default to the person logged in". So everyone signed in may pick, the person signed in is always the
 * default, and Albert is on the list only for Albert.
 *
 * The choices are the people allowed into the app (QUOTE_ALLOWED_EMAILS) on the company's own email domain, since GHL
 * sends only from a domain it has verified; each one's name comes from their GHL user. Choosing someone sends as them in
 * every way the customer sees: their email address, their GHL number for the text, and their first name signing it. The
 * person who pressed Send is still the one in the Edit Log.
 */

/** The sign-ins nobody else may send as: each is a choice only for itself. */
export const ONLY_THEMSELVES: readonly string[] = ["albert@titanfloors.ca"];

export type SendAsChoice = { email: string; name: string | null };

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
const domainOf = (e: string) => norm(e).split("@")[1] ?? "";

/**
 * The people the signed-in person can send as: the app's allowlist on the company's domain (all of it when no company
 * address is set), minus Albert unless it is Albert signed in, named from their GHL user, the person signed in first and
 * the rest by address.
 */
export function sendAsChoices(me: string, allow: Iterable<string>, companyEmail: string | null, users: { email: string | null; name: string | null }[]): SendAsChoice[] {
  const domain = companyEmail ? domainOf(companyEmail) : "";
  const self = norm(me);
  const emails = [...new Set([...allow].map(norm))].filter((e) => e.includes("@") && (!domain || domainOf(e) === domain) && (e === self || !ONLY_THEMSELVES.includes(e)));
  if (self && !emails.includes(self)) emails.push(self);
  return emails
    .sort((a, b) => (a === self ? -1 : b === self ? 1 : a.localeCompare(b)))
    .map((email) => ({ email, name: users.find((u) => u.email === email)?.name ?? null }));
}

/**
 * Who a send goes out as. No choice, or the person themselves: them. Anyone else only when the address is one of the
 * signed-in person's choices; otherwise the send is refused, never quietly sent as them.
 */
export function resolveSender<P extends { email: string; name: string | null }>(person: P, asEmail: unknown, choices: SendAsChoice[]): { ok: true; sender: { email: string; name: string | null }; as: boolean } | { ok: false; message: string } {
  const want = typeof asEmail === "string" ? norm(asEmail) : "";
  if (!want || want === norm(person.email)) return { ok: true, sender: person, as: false };
  if (ONLY_THEMSELVES.includes(want)) return { ok: false, message: "Only Albert can send a quote as Albert." };
  const choice = choices.find((c) => c.email === want);
  if (!choice) return { ok: false, message: "That person can't send quotes from the app. Pick someone on the list." };
  return { ok: true, sender: { email: choice.email, name: choice.name }, as: true };
}

/** "Last sent by Joey · v1 · 2026-11-05" for the Send card: the newest version of this quote that went out. Null when none has. */
export type LastSent = { email: string; name: string | null; version: number | null; on: string | null };

export function lastSentOf(versions: { version: number | null; sentBy: string | null; sentAt: string | null; status: string | null }[]): Omit<LastSent, "name"> | null {
  const out = versions
    .filter((v) => norm(v.sentBy) && v.status !== "Draft")
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? "") || (b.version ?? 0) - (a.version ?? 0))[0];
  return out ? { email: norm(out.sentBy), version: out.version, on: out.sentAt } : null;
}

/**
 * How the newest version that went out was sent (Albert, 2026-11-06: "send card should also show and default to the
 * 'breakdown' or 'lumpsum' selection of the previously sent version… or preliminary was sent as a range or exact
 * price"), read from its frozen copy: a preliminary by whether its options carry a range, a measured quote by the
 * copy's pricing (a copy frozen before `pricing` existed was itemised). Null when none went out or it can't be read.
 */
export type SentWay = "lump" | "itemised" | "range" | "exact";
export type LastSentWay = { version: number | null; way: SentWay };
export function lastSentWay(versions: { version: number | null; sentAt: string | null; status: string | null; basis: string | null; copy: string | null }[]): LastSentWay | null {
  const out = versions
    .filter((v) => v.sentAt && v.status !== "Draft" && v.copy)
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? "") || (b.version ?? 0) - (a.version ?? 0))[0];
  if (!out) return null;
  try {
    const c = JSON.parse(out.copy!) as { pricing?: string; options?: { range?: unknown }[] };
    if (out.basis === "Preliminary") return { version: out.version, way: (c.options ?? []).some((o) => o.range) ? "range" : "exact" };
    return { version: out.version, way: c.pricing === "lump" ? "lump" : "itemised" };
  } catch {
    return null;
  }
}

/** The card's words for it: "a range", "an exact price", "a lump sum", "a breakdown". */
export const sentWayWords: Record<SentWay, string> = { range: "a range", exact: "an exact price", lump: "a lump sum", itemised: "a breakdown" };
/** "Last version (v2) was sent as a breakdown." The Send card's line under its pricing choice. */
export const lastSentWords = (l: LastSentWay) => `Last version${l.version !== null ? ` (v${l.version})` : ""} was sent as ${sentWayWords[l.way]}.`;
