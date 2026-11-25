import "server-only";
import { appendBlocks, boardsParent, childrenOf, DS, downloadNotionFile, normalId, notionPayout, NotionPayoutError, payoutNotionOn, queryAll, uploadJpeg, type NotionBlock } from "@/lib/notion/payoutApi";
import { sendDispatchMessage, dispatchConfigured } from "@/lib/make/client";
import { embedFeedFor } from "@/lib/quotes/companycam";
import { quoteScopes } from "./quoteScope";
import { boardBlocks, buildBoard, isReadyLine, membersToBuild, messagesFor, nextWeek, strayLines, torontoToday, type Board, type Job, type Member } from "./model";
import { costLineOf, COST, jobOf, memberOf, OPEN_WO_STATUSES, PROJECT, TEAM, WORK_ORDER, workOrderOf, type Row } from "./rows";

/**
 * Installer Project Week runs (Albert, 2026-11-24; vault `05_decisions/2026-11-24-installer-project-week-boards`).
 *
 * - `rebuild`: every installer's page is rewritten from Notion. Nobody is texted. Nightly, and after a card goes final.
 * - `all`: rebuild, then text every installer with a job next week (the Send Project Week button on Project Preparation).
 * - `one`: rebuild and text one installer (the Send my week button on their Titan Team row).
 * - `refresh`: rebuild one installer's page, no text (after their payout card goes final or changes).
 *
 * Texts go through the QA dispatch's Make scenario (5030370), on the installer's own Project Week Channels (Titan Team, apart from the QA dispatch's
 * Dispatch Channels; empty = no text). Until
 * QUOTE_PROJECT_WEEK_SEND is exactly `live` every text goes to QUOTE_PROJECT_WEEK_TEST_PHONE instead, marked as a test;
 * flipping it is Albert's call, as a dated vault decision.
 */

export type RunScope = { kind: "rebuild" | "all" } | { kind: "one" | "refresh"; memberId: string };
export type RunResult = {
  ok: boolean;
  week: string;
  pages: { name: string; url: string }[];
  sent: { name: string; channel: string; test: boolean }[];
  notes: string[];
};

const sendsLive = () => process.env.QUOTE_PROJECT_WEEK_SEND?.trim() === "live";
const testPhone = () => process.env.QUOTE_PROJECT_WEEK_TEST_PHONE?.trim() || null;
/**
 * Albert's switch for CompanyCam's embed feed as the scope link (2026-11-24: "Try the embed feed link"): exactly `on`
 * once a feed has been opened logged out and shows no payout photos. A pasted CCAM Share Link always wins.
 */
const embedOn = () => process.env.QUOTE_PROJECT_WEEK_EMBED?.trim() === "on";

const updatedLabel = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

/**
 * Whether a page is shared to the web, and its public address when it is. The boards sit under Contractor Boards
 * (Albert, 2026-11-24: "Why cant they be in the same pages as Contractor Boards"), which is never published itself:
 * each installer's page is published on its own, by hand, once (Share, Publish). Notion's API can't publish a page, so
 * until then the page has no public address and nothing is texted.
 */
function published(page: Record<string, unknown>): string | null {
  return typeof page.public_url === "string" && /^https:\/\//.test(page.public_url) ? page.public_url : null;
}

type BoardPage = { id: string; url: string; publicUrl: string | null };

/** The installer's page: the one on their Titan Team row if it is still under the boards page, else a new one. */
async function boardFor(member: Member, parent: string): Promise<BoardPage | null> {
  const known = normalId(member.boardUrl);
  let page: Record<string, unknown> | null = null;
  if (known) {
    try {
      const found = await notionPayout("GET", `/pages/${known}`);
      const under = normalId(String((found.parent as Record<string, unknown> | undefined)?.page_id ?? ""));
      if (under === parent && !found.archived && !found.in_trash) page = found;
    } catch (e) {
      if (!(e instanceof NotionPayoutError && (e.status === 404 || e.status === 400))) throw e;
    }
  }
  page ??= await notionPayout("POST", "/pages", {
    parent: { type: "page_id", page_id: parent },
    properties: { title: { title: [{ type: "text", text: { content: `${member.name}: Project Week`.slice(0, 200) } }] } },
  });
  const id = normalId(String(page.id ?? ""));
  if (!id) return null;
  const publicUrl = published(page);
  const url = publicUrl ?? (typeof page.url === "string" ? page.url : null);
  if (!url) return null;
  // The one field the app sets on a Titan Team row: where this person's own page is (its public address once published).
  if (url !== member.boardUrl) await notionPayout("PATCH", `/pages/${member.id}`, { properties: { [TEAM.boardUrl]: { url } } });
  return { id, url, publicUrl };
}

/** The newest payout card picture on a Project Costs line the app made. */
async function lastCardImage(lineId: string): Promise<Uint8Array | null> {
  const blocks = await childrenOf(lineId);
  const img = [...blocks].reverse().find((b) => b.type === "image") as (NotionBlock & { image?: { file?: { url?: string } } }) | undefined;
  const url = img?.image?.file?.url;
  return typeof url === "string" ? downloadNotionFile(url) : null;
}

/** Rewrites the page: the new content goes on first, then the old is taken off, so it is never empty. */
async function publish(board: Board, pageId: string, cache: Map<string, Uint8Array | null>, now: Date): Promise<void> {
  const images = new Map<string, string[]>();
  for (const j of board.jobs) {
    const ids: string[] = [];
    for (const lineId of j.cardLineIds) {
      if (!cache.has(lineId)) cache.set(lineId, await lastCardImage(lineId).catch(() => null));
      const bytes = cache.get(lineId);
      if (bytes) ids.push(await uploadJpeg(bytes, `Payout ${board.member.name}.jpg`));
    }
    images.set(j.job.id, ids);
  }
  const old = await childrenOf(pageId);
  await appendBlocks(pageId, boardBlocks(board, images, updatedLabel(now)));
  for (const b of old) await notionPayout("DELETE", `/blocks/${normalId(b.id)}`);
}

export async function runProjectWeek(scope: RunScope, now = new Date()): Promise<RunResult> {
  const today = torontoToday(now);
  const week = nextWeek(today);
  const result: RunResult = { ok: false, week: `${week.mon} to ${week.sun}`, pages: [], sent: [], notes: [] };
  if (!payoutNotionOn()) return { ...result, notes: ["Project Week isn't set up on this deployment."] };
  const parent = boardsParent();
  if (!parent) return { ...result, notes: ["Project Week has no boards page (QUOTE_PROJECT_WEEK_PARENT)."] };

  const team = (await queryAll(DS.titanTeam, undefined, 500)).map((r) => memberOf(r as Row));
  const weekJobs = (await queryAll(DS.titanProjects, { and: [{ property: PROJECT.start, date: { on_or_after: week.mon } }, { property: PROJECT.start, date: { on_or_before: week.sun } }] }, 300)).map((r) => jobOf(r as Row));
  const yearAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
  const ended = (await queryAll(DS.titanProjects, { and: [{ property: PROJECT.end, date: { on_or_before: today } }, { property: PROJECT.end, date: { on_or_after: yearAgo } }] }, 1000)).map((r) => jobOf(r as Row));
  const lines = (await queryAll(DS.projectCosts, { property: COST.paidRef, rich_text: { is_empty: true } }, 3000)).map((r) => costLineOf(r as Row));
  const workOrders = (await queryAll(DS.workOrders, { or: OPEN_WO_STATUSES.map((s) => ({ property: WORK_ORDER.status, status: { equals: s } })) }, 1000)).flatMap((r) => workOrderOf(r as Row) ?? []);

  if (embedOn()) for (const j of weekJobs) if (!j.shareLink && j.camUrl) j.shareLink = await embedFeedFor(j.camUrl);
  const scopes = await quoteScopes(weekJobs.map((j) => j.id));
  for (const j of weekJobs) j.quoteScope = scopes.get(j.id.replace(/-/g, "")) ?? null;
  const projects = new Map<string, Job>([...ended, ...weekJobs].map((j) => [j.id, j]));
  for (const s of strayLines(weekJobs, lines)) result.notes.push(`"${s.line.name}" on the ${s.job.start ?? ""} job in ${s.job.city ?? "?"} is assigned to someone who isn't in its Contractor list, so it is on nobody's page.`);

  const ready = lines.filter((l) => isReadyLine(l) && l.projectId && (projects.get(l.projectId)?.end ?? "9999") <= today);
  let members = membersToBuild(team, weekJobs, ready);
  if (scope.kind === "one" || scope.kind === "refresh") {
    const one = team.find((m) => m.id === normalId(scope.memberId));
    if (!one) return { ...result, notes: ["That Titan Team row wasn't found."] };
    members = [one];
  }

  const cache = new Map<string, Uint8Array | null>();
  const send = scope.kind === "all" || scope.kind === "one";
  if (send && !dispatchConfigured()) result.notes.push("Texts aren't switched on for this deployment; the pages were still updated.");
  for (const member of members) {
    try {
      const board = buildBoard({ member, week, today, jobs: weekJobs, projects, lines, openWorkOrders: workOrders });
      const page = await boardFor(member, parent);
      if (!page) {
        result.notes.push(`${member.name}'s page couldn't be made.`);
        continue;
      }
      await publish(board, page.id, cache, now);
      result.pages.push({ name: member.name, url: page.url });
      const wantsText = scope.kind === "one" ? board.jobs.length > 0 || board.ready.length > 0 : scope.kind === "all" && board.jobs.length > 0;
      if (!send || !wantsText || !dispatchConfigured()) continue;
      if (!page.publicUrl) {
        result.notes.push(`${member.name}'s Project Week page isn't published yet, so nothing was sent. Open it under Contractor Boards, Share, Publish, then press Send again.`);
        continue;
      }
      const messages = messagesFor(board, page.publicUrl);
      if (!messages.length) {
        result.notes.push(`${member.name} has no Project Week Channels with a phone, group or email set in Titan Team, so nothing was sent.`);
        continue;
      }
      for (const m of messages) {
        if (sendsLive()) {
          await sendDispatchMessage({ name: member.name, ...m });
          result.sent.push({ name: member.name, channel: m.channel, test: false });
        } else {
          const phone = testPhone();
          if (!phone) {
            result.notes.push("Sending is in test mode and QUOTE_PROJECT_WEEK_TEST_PHONE is empty, so no text went out.");
            break;
          }
          await sendDispatchMessage({ name: member.name, channel: "SMS", phone, whatsapp_group_id: null, text: `[Test: for ${member.name} by ${m.channel}${m.email ? ` to ${m.email}` : ""}]\n${m.text}` });
          result.sent.push({ name: member.name, channel: m.channel, test: true });
        }
      }
    } catch (e) {
      console.error("project week", member.name, e instanceof Error ? e.message.slice(0, 300) : typeof e);
      result.notes.push(`${member.name}: ${e instanceof Error ? e.message.slice(0, 160) : "failed"}`);
    }
  }
  return { ...result, ok: true };
}
