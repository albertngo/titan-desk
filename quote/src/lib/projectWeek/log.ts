import "server-only";
import { appendBlocks, notionPayout } from "@/lib/notion/payoutApi";
import { logLine, memberStatus, type LogEntry } from "./model";
import { TEAM } from "./rows";

/**
 * The send log on each Titan Team row (Albert, 2026-11-25: "a status in the view to show Sent Successfully vs Needs
 * Manual if it does fail", then "just put the writing into the titan teams page"; vault
 * `05_decisions/2026-11-25-project-week-send-log`). After a Send press, each person it was for gets their row's Project
 * Week Status set (Needs Manual if anything failed) and one dated line per message added at the bottom of their page,
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
      await notionPayout("PATCH", `/pages/${memberId}`, { properties: { [TEAM.sendStatus]: { select: { name: memberStatus(list) } } } });
      await appendBlocks(
        memberId,
        list.map((e) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: logLine(e, week, pressedBy, when).slice(0, 1900) }, annotations: e.status === "Needs Manual" ? { color: "red" } : {} }] } })),
      );
    } catch (err) {
      failed.push(list[0].name);
      console.error("project week send log", err instanceof Error ? err.message.slice(0, 200) : typeof err);
    }
  }
  return failed.length ? `The send log didn't save on ${failed.join(", ")}'s Titan Team row. Check the Project Week Status column exists there.` : null;
}
