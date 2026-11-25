import "server-only";
import { appendBlocks, notionPayout } from "@/lib/notion/payoutApi";
import { logLine, memberStatus, prependLog, type LogEntry } from "./model";
import { TEAM, text, type Row } from "./rows";

/**
 * The send log on each Titan Team row (Albert, 2026-11-25: "a status in the view to show Sent Successfully vs Needs
 * Manual if it does fail", then "just put the writing into the titan teams page"; vault
 * `05_decisions/2026-11-25-project-week-send-log`). After a Send press, each person it was for gets their row's Project
 * Week Status set (Needs Manual if anything failed), Project Week Sent set to the time when everything went out, the
 * new lines put on top of the Dispatch Log column (shared with the QA dispatch, which writes it the same way), and one dated line per message added at the bottom of their page,
 * with the reason when it failed. Only ever adds lines; never edits or removes what is there. A log that fails to
 * write never stops the run: it says so in the run's notes, and the texts have already gone.
 */
export async function writeLog(entries: LogEntry[], week: { mon: string; sun: string }, pressedBy: "Send all" | "Send my week", at: Date): Promise<string | null> {
  const when = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
  const byMember = new Map<string, LogEntry[]>();
  for (const e of entries) byMember.set(e.memberId, [...(byMember.get(e.memberId) ?? []), e]);
  const failed: string[] = [];
  for (const [memberId, list] of byMember) {
    try {
      const status = memberStatus(list);
      const lines = list.map((e) => logLine(e, week, pressedBy, when));
      // The Dispatch Log column (2026-11-25): newest first, read back first so QA Dispatch lines are kept.
      const row = (await notionPayout("GET", `/pages/${memberId}`)) as Row;
      const column = prependLog(text(row.properties?.[TEAM.dispatchLog]), [...lines].reverse());
      // Project Week Sent (Albert, 2026-11-25): moves only when everything went out; a failed press leaves the last good date.
      const sent = status === "Sent Successfully" ? { [TEAM.sentDate]: { date: { start: at.toISOString() } } } : {};
      await notionPayout("PATCH", `/pages/${memberId}`, { properties: { [TEAM.sendStatus]: { select: { name: status } }, ...sent, [TEAM.dispatchLog]: { rich_text: [{ type: "text", text: { content: column } }] } } });
      await appendBlocks(
        memberId,
        list.map((e, i) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: lines[i].slice(0, 1900) }, annotations: e.status === "Needs Manual" ? { color: "red" } : {} }] } })),
      );
    } catch (err) {
      failed.push(list[0].name);
      console.error("project week send log", err instanceof Error ? err.message.slice(0, 200) : typeof err);
    }
  }
  return failed.length ? `The send log didn't save on ${failed.join(", ")}'s Titan Team row. Check the Project Week Status column exists there.` : null;
}
