import "server-only";
import { createRecords, listRecords, updateRecord } from "@/lib/airtable/client";
import { SETTING, T } from "@/lib/airtable/fields";
import { isQuoter, parseAllowlist, quoterAllowlist } from "@/lib/access";
import { requireQuoterPerson } from "@/lib/auth";
import { appendLog, logLine } from "@/lib/quotes/history";
import { checkValue, defaults, merge, shown, type Key, type Settings } from "./registry";

/**
 * The app's settings (Albert, 2026-11-10), read from the Airtable "App Settings" table over the defaults, cached one
 * minute. Only an admin may change one (saveSetting), and every change appends to that row's Log.
 */

const CACHE_MS = 60_000;
let cache: { at: number; s: Settings; rows: Map<string, { id: string; value: string; log: string | null; by: string | null; when: string | null }> } | null = null;

async function readAll() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const base = defaults(process.env);
  try {
    const recs = await listRecords(T.settings, { fields: [SETTING.key, SETTING.value, SETTING.updatedBy, SETTING.updatedAt, SETTING.log] });
    const rows = new Map(
      recs
        .map((r) => ({ id: r.id, key: String(r.fields[SETTING.key] ?? "").trim(), value: String(r.fields[SETTING.value] ?? ""), log: (r.fields[SETTING.log] as string) ?? null, by: (r.fields[SETTING.updatedBy] as string) ?? null, when: (r.fields[SETTING.updatedAt] as string) ?? null }))
        .filter((r) => r.key)
        .map((r) => [r.key, r]),
    );
    cache = { at: Date.now(), s: merge(base, [...rows.entries()].map(([key, r]) => ({ key, value: r.value }))), rows };
  } catch (e) {
    console.error("settings", e);
    // Airtable unreadable: the defaults hold, and nothing is cached so the next read tries again.
    return { at: 0, s: base, rows: new Map() };
  }
  return cache;
}

/** The settings as they stand. Used by the app itself, signed in or not (the hourly run reads them too). */
export async function settings(): Promise<Settings> {
  return (await readAll()).s;
}

/**
 * Who is an admin: on the Settings list (or QUOTE_ADMIN_EMAILS, which always counts, so a bad save can't lock Albert
 * out), and allowed into the app.
 */
export async function isAdminEmail(email: unknown): Promise<boolean> {
  if (!isQuoter(email, quoterAllowlist())) return false;
  if (isQuoter(email, parseAllowlist(process.env.QUOTE_ADMIN_EMAILS))) return true;
  return isQuoter(email, new Set((await settings()).adminEmails));
}

export type SettingsView = { s: Settings; meta: Record<string, { by: string | null; when: string | null }> };

/** The Settings page: values and who changed each one last. Admin only. */
export async function loadSettings(): Promise<SettingsView | null> {
  const person = await requireQuoterPerson();
  if (!(await isAdminEmail(person.email))) return null;
  const all = await readAll();
  return { s: all.s, meta: Object.fromEntries([...all.rows.entries()].map(([k, r]) => [k, { by: r.by, when: r.when }])) };
}

/** Change one setting. Admin only; the value is checked first; the row's Log keeps every change. */
export async function saveSetting(key: unknown, raw: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  const person = await requireQuoterPerson();
  if (!(await isAdminEmail(person.email))) return { ok: false, message: "Only an admin can change settings." };
  const k = String(key ?? "");
  const c = checkValue(k, String(raw ?? ""));
  if (!c.ok) return c;
  cache = null;
  const all = await readAll();
  const before = shown(all.s, k as Key);
  const now = new Date();
  const line = logLine(now, person.email, `${before} → ${c.value}`);
  try {
    const row = all.rows.get(k);
    if (row) await updateRecord(T.settings, row.id, { [SETTING.value]: c.value, [SETTING.updatedBy]: person.email, [SETTING.updatedAt]: now.toISOString(), [SETTING.log]: appendLog(row.log, line) });
    else await createRecords(T.settings, [{ [SETTING.key]: k, [SETTING.value]: c.value, [SETTING.updatedBy]: person.email, [SETTING.updatedAt]: now.toISOString(), [SETTING.log]: line }]);
  } catch (e) {
    return { ok: false, message: `Airtable didn't take it (${e instanceof Error ? e.message.slice(0, 120) : "error"}).` };
  }
  cache = null;
  return { ok: true };
}
