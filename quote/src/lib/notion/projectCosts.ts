import "server-only";
import { cardMark, COST, jobOf, matchRateCardName, memberOf, TEAM, type Row } from "@/lib/projectWeek/rows";
import { money } from "@/lib/projectWeek/model";
import { appendBlocks, DS, normalId, notionPayout, NotionPayoutError, payoutNotionOn, queryAll, uploadJpeg } from "./payoutApi";

/**
 * A final payout card into Notion Project Costs (Albert, 2026-11-24: "Yes on final and update own line. It should post
 * the screenshot of the payout card to the page. And append only if it gets updated for a log of the history"; vault
 * `05_decisions/2026-11-24-installer-project-week-boards`). The only file that writes Project Costs.
 *
 * - One line per card, found by the card's mark in Notes (`quote-card:<quote>/<card>`). A line without the mark (typed
 *   by hand) is never read for writing, changed or removed.
 * - First time: a Labor line, Assigned To the Titan Team person whose Rate Card Name is the card's contractor (exactly
 *   one, or nothing is written), Calculated (1/3) ticked, the card's picture on the page.
 * - Again: the line's Cost, Assigned To and Name are updated, and a dated entry (old to new amount, the new picture) is
 *   added under the earlier ones, which are never edited.
 * - Refused once the line has a Paid Out Date (2/3) or a Paid Reference (3/3), or points at another project.
 */

export type CardSync =
  | { ok: true; pageId: string; memberId: string; warning: string | null }
  | { ok: false; message: string };

export type CardSyncInput = {
  quoteRecordId: string;
  cardId: string;
  contractor: string;
  total: number;
  /** "PP-123" or the quote number. */
  ref: string | null;
  projectUrl: string | null;
  by: string;
  jpeg: Uint8Array;
  filename: string;
  /** The card in one line, for the entry. */
  summary: string;
  /** The work on the card (cardScope), shown on the installer's Project Week page. */
  scope: string;
};

const when = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

const rt = (content: string) => [{ type: "text", text: { content: content.slice(0, 1900) } }];
/** Notes on a card's line: the mark first (how the app finds it), then the work, read back by the Project Week page. */
const notesFor = (mark: string, scope: string) => `${mark} Work: ${scope.replace(/\. Made by/g, ", made by") || "see the card"}. Made by the quote app from the payout card. Change the card in the quote app, not this line.`;

export async function syncCardToProjectCosts(c: CardSyncInput): Promise<CardSync> {
  if (!payoutNotionOn()) return { ok: false, message: "Project Costs isn't connected on this app yet." };
  const projectId = normalId(c.projectUrl);
  if (!projectId) return { ok: false, message: "This quote has no Notion project yet. It's filled in once the job is won; mark the card final after that." };
  try {
    const team = (await queryAll(DS.titanTeam, { property: TEAM.rateCardName, rich_text: { is_not_empty: true } })).map((r) => memberOf(r as Row));
    const hits = matchRateCardName(team, c.contractor);
    if (hits.length !== 1) {
      return {
        ok: false,
        message: hits.length
          ? `More than one person in Notion Titan Team has the Rate Card Name "${c.contractor.trim()}". Fix that first, so the payout goes to the right person.`
          : `Nobody in Notion Titan Team has the Rate Card Name "${c.contractor.trim()}". Add it to their row first, so the payout goes to the right person.`,
      };
    }
    const member = hits[0];
    const project = jobOf((await notionPayout("GET", `/pages/${projectId}`)) as Row);
    const warning = project.contractors.includes(member.id)
      ? null
      : `${member.name} isn't in this project's Contractor list in Notion, so the payout won't show on their Project Week page until they're added.`;

    const mark = cardMark(c.quoteRecordId, c.cardId);
    const existing = await queryAll(DS.projectCosts, { property: COST.notes, rich_text: { contains: mark } }, 5);
    if (existing.length > 1) return { ok: false, message: "Project Costs has two lines for this card. Delete the extra one in Notion, then mark it final again." };

    const now = new Date();
    const name = `Labour: ${c.contractor.trim()}${c.ref ? ` (${c.ref})` : ""}`.slice(0, 200);
    const upload = await uploadJpeg(c.jpeg, c.filename);
    const image = { object: "block", type: "image", image: { type: "file_upload", file_upload: { id: upload } } };

    if (!existing.length) {
      const page = await notionPayout("POST", "/pages", {
        parent: { type: "data_source_id", data_source_id: DS.projectCosts },
        properties: {
          [COST.name]: { title: rt(name) },
          [COST.category]: { select: { name: "Labor" } },
          [COST.project]: { relation: [{ id: projectId }] },
          [COST.assignedTo]: { relation: [{ id: member.id }] },
          [COST.cost]: { number: c.total },
          [COST.calculated]: { checkbox: true },
          [COST.source]: { select: { name: "Quote" } },
          [COST.notes]: { rich_text: rt(notesFor(mark, c.scope)) },
        },
        children: [
          { object: "block", type: "heading_3", heading_3: { rich_text: rt(`${when(now)}: marked final by ${c.by}, ${money(c.total)}`) } },
          { object: "block", type: "paragraph", paragraph: { rich_text: rt(c.summary) } },
          image,
        ],
      });
      const id = normalId(String(page.id ?? ""));
      if (!id) return { ok: false, message: "Notion made the line but gave no id. Check Project Costs before trying again." };
      return { ok: true, pageId: id, memberId: member.id, warning };
    }

    const line = existing[0];
    const id = normalId(line.id)!;
    const p = line.properties ?? {};
    const paidOut = (p[COST.paidOut]?.date as { start?: string } | null | undefined)?.start;
    const paidRef = ((p[COST.paidRef]?.rich_text as { plain_text?: string }[] | undefined) ?? []).map((r) => r.plain_text ?? "").join("").trim();
    if (paidOut || paidRef) return { ok: false, message: "This payout has already been paid out in Notion, so it can't change. Add a new line in Project Costs for anything extra." };
    const linked = ((p[COST.project]?.relation as { id?: string }[] | undefined) ?? []).map((r) => normalId(r.id ?? ""));
    if (linked.length && !linked.includes(projectId)) return { ok: false, message: "This card's Project Costs line points at a different project. Check it in Notion first." };
    const before = typeof p[COST.cost]?.number === "number" ? (p[COST.cost].number as number) : null;

    await notionPayout("PATCH", `/pages/${id}`, {
      properties: {
        [COST.name]: { title: rt(name) },
        [COST.cost]: { number: c.total },
        [COST.assignedTo]: { relation: [{ id: member.id }] },
        [COST.calculated]: { checkbox: true },
        [COST.notes]: { rich_text: rt(notesFor(mark, c.scope)) },
      },
    });
    const change = before === null ? money(c.total) : before === c.total ? `${money(c.total)}, amount unchanged` : `${money(before)} to ${money(c.total)}`;
    await appendBlocks(id, [
      { object: "block", type: "divider", divider: {} },
      { object: "block", type: "heading_3", heading_3: { rich_text: rt(`${when(now)}: changed by ${c.by}, ${change}`) } },
      { object: "block", type: "paragraph", paragraph: { rich_text: rt(c.summary) } },
      image,
    ]);
    return { ok: true, pageId: id, memberId: member.id, warning };
  } catch (e) {
    console.error("project costs sync", e instanceof Error ? e.message.slice(0, 300) : typeof e);
    const m = e instanceof NotionPayoutError ? e.message : "Notion didn't answer";
    return { ok: false, message: `The payout didn't reach Project Costs (${m.slice(0, 160)}). Try again.` };
  }
}
