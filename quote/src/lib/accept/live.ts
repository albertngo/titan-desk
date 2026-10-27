import "server-only";
import { listByIds, listRecords } from "@/lib/airtable/client";
import { SETTINGS, SETTINGS_TABLE, TERMS, TERMS_TABLE } from "@/lib/airtable/fields";
import { isAirtableFile, type Terms } from "./terms";

/**
 * What switches acceptance on, read from Airtable on both deployments (Albert, 2026-10-27): the
 * **Online Acceptance** tick in Quote Settings, and the newest Project Expectations PDF in Terms
 * Versions. Ticking the box is the go-live and unticking it is the kill switch, with no redeploy.
 *
 * Read only. Each answer is kept for a minute, so a page view doesn't cost two extra Airtable reads.
 * Anything that can't be read reads as off: acceptance fails closed.
 */

/** A Terms Versions row with its PDF's address. The address is Airtable's, expires within hours, and is only ever fetched by our server. */
export type LiveTerms = Terms & { pdfUrl: string | null };

const MINUTE = 60_000;
const memo = new Map<string, { at: number; value: unknown }>();

async function remembered<V>(key: string, read: () => Promise<V>, fallback: V): Promise<V> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MINUTE) return hit.value as V;
  let value = fallback;
  try {
    value = await read();
  } catch {
    // Off until Airtable answers; not remembered, so the next request tries again.
    return fallback;
  }
  memo.set(key, { at: Date.now(), value });
  return value;
}

const torontoDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};

function termsOf(r: { id: string; fields: Record<string, unknown> }): (LiveTerms & { at: string }) | null {
  const at = r.fields[TERMS.modifiedAt];
  const on = typeof at === "string" ? torontoDay(at) : null;
  const files = Array.isArray(r.fields[TERMS.pdf]) ? (r.fields[TERMS.pdf] as { url?: unknown; type?: unknown }[]) : [];
  const pdf = files.find((f) => typeof f.url === "string" && isAirtableFile(f.url) && (f.type === "application/pdf" || f.type === undefined));
  if (!on || typeof at !== "string" || !pdf) return null;
  return { id: r.id, on, at, pdfUrl: pdf.url as string };
}

/** The Online Acceptance tick. */
export async function acceptanceSwitchedOn(): Promise<boolean> {
  return remembered(
    "switch",
    async () => {
      const rows = await listRecords(SETTINGS_TABLE, { fields: [SETTINGS.onlineAcceptance] });
      // One row is the design; should a second ever appear, any row unticked keeps it off.
      return rows.length > 0 && rows.every((r) => r.fields[SETTINGS.onlineAcceptance] === true);
    },
    false,
  );
}

/** The newest Project Expectations with a PDF, switch or no switch; null when there is none. */
export async function newestTerms(): Promise<LiveTerms | null> {
  return remembered(
    "terms",
    async () => {
      const rows = (await listRecords(TERMS_TABLE, { fields: [TERMS.modifiedAt, TERMS.pdf] })).map(termsOf).filter((t) => t !== null);
      rows.sort((a, b) => b.at.localeCompare(a.at));
      return rows.length ? { id: rows[0].id, on: rows[0].on, pdfUrl: rows[0].pdfUrl } : null;
    },
    null,
  );
}

/** What a customer agrees to today: the newest terms, only while acceptance is switched on. Null = acceptance is off. */
export async function acceptTerms(): Promise<LiveTerms | null> {
  const [on, terms] = await Promise.all([acceptanceSwitchedOn(), newestTerms()]);
  return on ? terms : null;
}

/** One version by its row: the one an accepted quote agreed to, whatever is newest now. */
export async function termsById(id: string | null | undefined): Promise<LiveTerms | null> {
  if (!id || !/^rec[A-Za-z0-9]{14}$/.test(id)) return null;
  return remembered(
    `terms:${id}`,
    async () => {
      const r = (await listByIds(TERMS_TABLE, [id], [TERMS.modifiedAt, TERMS.pdf]))[0];
      const t = r ? termsOf(r) : null;
      return t ? { id: t.id, on: t.on, pdfUrl: t.pdfUrl } : null;
    },
    null,
  );
}
