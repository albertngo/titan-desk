import "server-only";
import { appendBlocks, childrenOf, notionPayout, type NotionBlock } from "@/lib/notion/payoutApi";
import { dispatchLogBlocks, isDispatchColumns, logLine, memberStatus, type LogEntry } from "./model";
import { TEAM } from "./rows";

/**
 * The send log on each Titan Team row (Albert, 2026-11-25: "a status in the view to show Sent Successfully vs Needs
 * Manual if it does fail", "just put the writing into the titan teams page", then "a dispatch log on the PAGE… a 2
 * column field where the left is the project week, and right is the QA"; vault
 * `05_decisions/2026-11-25-dispatch-log-two-columns`). After a Send press, each person it was for gets their row's
 * Project Week Status set (Needs Manual if anything failed), Project Week Sent set to the time when everything went out,
 * and one dated line per message added under "Project Week", the left column of the Dispatch Log on their page (the
 * weekly QA dispatch writes the right one). The two columns are made once, the first time either side writes. Only
 * ever adds lines; never edits or removes what is there. A log that fails to write never stops the run: it says so in
 * the run's notes, and the texts have already gone.
 */

const heading = (b: NotionBlock | undefined): string => {
  const h = b && (b[b.type] as { rich_text?: { plain_text?: string }[] } | undefined);
  return (h?.rich_text ?? []).map((r) => r.plain_text ?? "").join("").trim();
};

/** The Project Week column's id on the person's page, made with its QA Dispatch neighbour when there isn't one yet. */
async function projectWeekColumn(memberId: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const list of (await childrenOf(memberId)).filter((b) => b.type === "column_list")) {
      const cols = await childrenOf(list.id);
      const firsts: string[] = [];
      for (const c of cols) firsts.push(heading((await childrenOf(c.id))[0]));
      if (isDispatchColumns(firsts)) return cols[0].id;
    }
    if (attempt === 0) await appendBlocks(memberId, dispatchLogBlocks());
  }
  throw new Error("The Dispatch Log columns couldn't be made on the page.");
}

/**
 * Project Week Status is a Notion status (Albert, 2026-11-25): his Send my week button sets it to "Sending....." before
 * calling the app, and the app always moves it on. When a press had nothing to text (no jobs or payouts next week),
 * this sets "Nothing to Send", so the row never stays on Sending.
 */
export async function markNothingToSend(memberId: string): Promise<void> {
  try {
    await notionPayout("PATCH", `/pages/${memberId}`, { properties: { [TEAM.sendStatus]: { status: { name: "Nothing to Send" } } } });
  } catch (err) {
    console.error("project week status", err instanceof Error ? err.message.slice(0, 200) : typeof err);
  }
}

export async function writeLog(entries: LogEntry[], week: { mon: string; sun: string }, pressedBy: "Send all" | "Send my week", at: Date): Promise<string | null> {
  const when = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
  const byMember = new Map<string, LogEntry[]>();
  for (const e of entries) byMember.set(e.memberId, [...(byMember.get(e.memberId) ?? []), e]);
  const failed: string[] = [];
  for (const [memberId, list] of byMember) {
    try {
      const status = memberStatus(list);
      // Project Week Sent (Albert, 2026-11-25): moves only when everything went out; a failed press leaves the last good date.
      const sent = status === "Sent Successfully" ? { [TEAM.sentDate]: { date: { start: at.toISOString() } } } : {};
      await notionPayout("PATCH", `/pages/${memberId}`, { properties: { [TEAM.sendStatus]: { status: { name: status } }, ...sent } });
      const column = await projectWeekColumn(memberId);
      await appendBlocks(
        column,
        list.map((e) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: logLine(e, week, pressedBy, when).slice(0, 1900) }, annotations: e.status === "Needs Manual" ? { color: "red" } : {} }] } })),
      );
    } catch (err) {
      failed.push(list[0].name);
      console.error("project week send log", err instanceof Error ? err.message.slice(0, 200) : typeof err);
    }
  }
  return failed.length ? `The send log didn't save on ${failed.join(", ")}'s Titan Team row. Check the Project Week Status column exists there.` : null;
}

