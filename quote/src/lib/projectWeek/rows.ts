import type { CostLine, Job, Member, OpenWorkOrder } from "./model";

/**
 * Reading Notion rows for Project Week (2026-11-24). Pure; the requests are in src/lib/notion/payoutApi.ts. Property
 * names are Titan's Notion names; the four new ones (Rate Card Name, Project Week Link and Project Week Channels on Titan
 * Team, CCAM Share Link on Titan Projects) are made by hand in Notion.
 */

type Props = Record<string, Record<string, unknown>>;
export type Row = { id: string; properties?: Props };

/** What the quote app writes into a Project Costs line's Notes so it only ever touches its own lines. */
export const CARD_MARK = "quote-card:";
export const cardMark = (quoteRecordId: string, cardId: string) => `${CARD_MARK}${quoteRecordId}/${cardId}`;

export const TEAM = { name: "Name", phone: "Phone", channels: "Project Week Channels", groupId: "WhatsApp Group ID", rateCardName: "Rate Card Name", boardUrl: "Project Week Link", email: "Email", sendStatus: "Project Week Status" } as const;
export const PROJECT = { customer: "Name", street: "Street Address", city: "City", phone: "Contact", type: "Project Type", start: "Confirmed Start Date", end: "Project End Date", contractors: "Contractor", shareLink: "CCAM Share Link", camUrl: "CompanyCam Link" } as const;
export const COST = { name: "Name", category: "Category", project: "Project", assignedTo: "Assigned To", cost: "Cost", calculated: "Calculated (1/3)", paidOut: "Paid Out Date (2/3)", paidRef: "Paid Reference (3/3)", notes: "Notes", source: "Cost Source" } as const;
export const WORK_ORDER = { status: "Status", contractor: "Contractor To Fix", project: "Project" } as const;
/** The QA dispatch's active statuses (Sending.... has four dots). */
export const OPEN_WO_STATUSES = ["Sending....", "Notified Contractor", "Sent to Projects"];

const dashed = (id: string) => {
  const h = id.replace(/-/g, "").toLowerCase();
  return h.length === 32 ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : id.toLowerCase();
};

export function text(p: Record<string, unknown> | undefined): string | null {
  if (!p) return null;
  const rich = (p.rich_text ?? p.title) as { plain_text?: string }[] | undefined;
  if (Array.isArray(rich)) return rich.map((r) => r.plain_text ?? "").join("").trim() || null;
  for (const k of ["phone_number", "url", "email"]) if (typeof p[k] === "string" && (p[k] as string).trim()) return (p[k] as string).trim();
  const sel = (p.select ?? p.status) as { name?: string } | null | undefined;
  if (sel && typeof sel.name === "string") return sel.name;
  return null;
}

export const relation = (p: Record<string, unknown> | undefined): string[] =>
  Array.isArray(p?.relation) ? (p!.relation as { id?: string }[]).flatMap((r) => (typeof r.id === "string" ? [dashed(r.id)] : [])) : [];

export const multi = (p: Record<string, unknown> | undefined): string[] =>
  Array.isArray(p?.multi_select) ? (p!.multi_select as { name?: string }[]).flatMap((r) => (typeof r.name === "string" ? [r.name] : [])) : [];

export const dateStart = (p: Record<string, unknown> | undefined): string | null => {
  const s = (p?.date as { start?: unknown } | null | undefined)?.start;
  return typeof s === "string" ? s.slice(0, 10) : null;
};

const num = (p: Record<string, unknown> | undefined): number | null => (typeof p?.number === "number" ? (p.number as number) : null);
const check = (p: Record<string, unknown> | undefined): boolean => p?.checkbox === true;

/** A WhatsApp group id pasted as a link ("[1203...@g.us](mailto:...)") read bare, as the QA dispatch does. */
export function cleanGroupId(v: string | null): string | null {
  if (!v) return null;
  return v.match(/\d{8,}(?:-\d+)?@g\.us/)?.[0] ?? (v.trim() || null);
}

export function memberOf(r: Row): Member & { rateCardName: string | null } {
  const p = r.properties ?? {};
  return {
    id: dashed(r.id),
    name: text(p[TEAM.name]) ?? "",
    phone: text(p[TEAM.phone]),
    channels: multi(p[TEAM.channels]),
    groupId: cleanGroupId(text(p[TEAM.groupId])),
    email: text(p[TEAM.email]),
    boardUrl: text(p[TEAM.boardUrl]),
    rateCardName: text(p[TEAM.rateCardName]),
  };
}

export function jobOf(r: Row): Job {
  const p = r.properties ?? {};
  const link = text(p[PROJECT.shareLink]);
  return {
    id: dashed(r.id),
    customer: text(p[PROJECT.customer]),
    street: text(p[PROJECT.street]),
    city: text(p[PROJECT.city]),
    phone: text(p[PROJECT.phone]),
    type: text(p[PROJECT.type]),
    start: dateStart(p[PROJECT.start]),
    end: dateStart(p[PROJECT.end]),
    contractors: relation(p[PROJECT.contractors]),
    shareLink: link && /^https:\/\//.test(link) ? link : null,
    camUrl: text(p[PROJECT.camUrl]),
  };
}

/** The work a card-made line's Notes carry ("... Work: <scope>. Made by the quote app ..."), or null. */
export function workOf(notes: string | null): string | null {
  if (!notes || !notes.includes(CARD_MARK)) return null;
  const m = notes.match(/Work: (.*?)\. Made by the quote app/);
  return m && m[1].trim() && m[1].trim() !== "see the card" ? m[1].trim() : null;
}

export function costLineOf(r: Row): CostLine {
  const p = r.properties ?? {};
  return {
    id: dashed(r.id),
    name: text(p[COST.name]) ?? "",
    projectId: relation(p[COST.project])[0] ?? null,
    assignedTo: relation(p[COST.assignedTo]),
    cost: num(p[COST.cost]),
    calculated: check(p[COST.calculated]),
    paid: Boolean(text(p[COST.paidRef])),
    fromCard: (text(p[COST.notes]) ?? "").includes(CARD_MARK),
    work: workOf(text(p[COST.notes])),
  };
}

export function workOrderOf(r: Row): OpenWorkOrder | null {
  const p = r.properties ?? {};
  const project = relation(p[WORK_ORDER.project])[0];
  return project ? { projectId: project, contractorIds: relation(p[WORK_ORDER.contractor]) } : null;
}

/** The Titan Team rows whose Rate Card Name is exactly a card's contractor (case and spacing aside). */
export function matchRateCardName<T extends { rateCardName: string | null }>(members: T[], contractor: string): T[] {
  const key = contractor.trim().replace(/\s+/g, " ").toLowerCase();
  if (!key) return [];
  return members.filter((m) => (m.rateCardName ?? "").trim().replace(/\s+/g, " ").toLowerCase() === key);
}
