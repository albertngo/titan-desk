/**
 * The Send card's optional staff note (Albert, 2026-11-20). Pure and tiny, so the Send card can import the limit
 * without the history's diff code. Kept at the end of the send's Edit Log line; see src/lib/quotes/sendHistory.ts.
 */

/** A note is one short line. */
export const STAFF_NOTE_MAX = 140;

/** How a note sits at the end of a send's Edit Log line: "sent by email · note: Customer asked to drop the stairs". */
export const NOTE_MARK = " · note: ";

/** What staff typed, as it is kept: one line, trimmed, at most STAFF_NOTE_MAX characters; null when empty. */
export function cleanStaffNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const one = raw.replace(/\s+/g, " ").trim();
  return one ? one.slice(0, STAFF_NOTE_MAX).trim() : null;
}

/** A send's Edit Log words with the note on the end, when there is one. */
export function withNote(how: string, note: string | null): string {
  return note ? `${how}${NOTE_MARK}${note}` : how;
}

/** A log line's words split into what happened and the note. */
export function splitNote(what: string): { what: string; note: string | null } {
  const at = what.indexOf(NOTE_MARK);
  return at < 0 ? { what, note: null } : { what: what.slice(0, at), note: what.slice(at + NOTE_MARK.length).trim() || null };
}
