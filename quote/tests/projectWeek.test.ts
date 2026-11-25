import { describe, expect, it } from "vitest";
import { boardBlocks, buildBoard, weekDays, weekGrid, membersToBuild, messagesFor, messageText, nextWeek, payoutFor, strayLines, torontoToday, type CostLine, type Job, type Member } from "@/lib/projectWeek/model";
import { cardMark, cleanGroupId, costLineOf, jobOf, matchRateCardName, memberOf } from "@/lib/projectWeek/rows";

/** Installer Project Week (Albert, 2026-11-24). Invented people, jobs and amounts only. */

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const J1 = "11111111-1111-1111-1111-111111111111";
const J2 = "22222222-2222-2222-2222-222222222222";
const OLD = "33333333-3333-3333-3333-333333333333";

const member = (id: string, name: string, extra: Partial<Member> = {}): Member => ({ id, name, phone: "+15550000000", channels: ["SMS"], groupId: null, boardUrl: null, ...extra });
const job = (id: string, start: string | null, contractors: string[], extra: Partial<Job> = {}): Job => ({
  id,
  customer: "Pat Example",
  street: "1 Test St",
  city: "Testville",
  phone: "+15551112222",
  type: "Flooring",
  start,
  end: null,
  contractors,
  shareLink: "https://app.companycam.com/galleries/test",
  ...extra,
});
let n = 0;
const line = (projectId: string, assignedTo: string[], cost: number | null, extra: Partial<CostLine> = {}): CostLine => ({
  id: `0000000${++n}`.slice(-8) + "-0000-0000-0000-000000000000",
  name: "Labour",
  projectId,
  assignedTo,
  cost,
  calculated: true,
  paid: false,
  fromCard: true,
  ...extra,
});

// Wednesday 2026-11-25: the next week is Mon Nov 30 to Sun Dec 6.
const today = "2026-11-25";
const week = nextWeek(today);

describe("the week", () => {
  it("is the next Monday to Sunday, a full week ahead on a Monday", () => {
    expect(nextWeek("2026-11-25")).toEqual({ mon: "2026-11-30", sun: "2026-12-06" });
    expect(nextWeek("2026-11-30")).toEqual({ mon: "2026-12-07", sun: "2026-12-13" });
    expect(nextWeek("2026-11-29")).toEqual({ mon: "2026-11-30", sun: "2026-12-06" });
  });
  it("uses Toronto's date", () => {
    expect(torontoToday(new Date("2026-11-26T03:30:00Z"))).toBe("2026-11-25");
  });
});

describe("two installers on one job", () => {
  const jobs = [job(J1, "2026-12-01", [A, B])];
  const lines = [line(J1, [A], 800), line(J1, [B], 450)];
  const a = buildBoard({ member: member(A, "Alex One"), week, today, jobs, projects: new Map(), lines, openWorkOrders: [] });
  const b = buildBoard({ member: member(B, "Bo Two"), week, today, jobs, projects: new Map(), lines, openWorkOrders: [] });

  it("each sees only their own amount", () => {
    expect(a.jobs[0].payout).toEqual({ kind: "final", amount: 800 });
    expect(b.jobs[0].payout).toEqual({ kind: "final", amount: 450 });
    expect(JSON.stringify(boardBlocks(a, new Map(), "now"))).not.toContain("450");
    expect(JSON.stringify(boardBlocks(b, new Map(), "now"))).not.toContain("800");
  });

  it("each page carries only that installer's card pictures", () => {
    expect(a.jobs[0].cardLineIds).toEqual([lines[0].id]);
    expect(b.jobs[0].cardLineIds).toEqual([lines[1].id]);
  });

  it("each text names only them and their total", () => {
    expect(messageText(a, "https://x.test/a")).toContain("Hello Alex.");
    expect(messageText(a, "https://x.test/a")).toContain("$800 confirmed");
    expect(messageText(a, "https://x.test/a")).not.toContain("450");
  });
});

describe("what a page holds", () => {
  it("only jobs the installer is on, in the week", () => {
    const jobs = [job(J1, "2026-12-01", [A]), job(J2, "2026-12-02", [B]), job(OLD, "2026-12-08", [A])];
    const board = buildBoard({ member: member(A, "Alex One"), week, today, jobs, projects: new Map(), lines: [], openWorkOrders: [] });
    expect(board.jobs.map((j) => j.job.id)).toEqual([J1]);
  });

  it("a job without a calculated line reads pending, and that never blocks it", () => {
    const jobs = [job(J1, "2026-12-01", [A])];
    expect(payoutFor(J1, A, [])).toEqual({ kind: "pending" });
    expect(payoutFor(J1, A, [line(J1, [A], 500, { calculated: false })])).toEqual({ kind: "pending" });
    expect(payoutFor(J1, A, [line(J1, [A], 500), line(J1, [A], 100, { calculated: false })])).toEqual({ kind: "partial", amount: 500 });
    const board = buildBoard({ member: member(A, "Alex One"), week, today, jobs, projects: new Map(), lines: [], openWorkOrders: [] });
    expect(board.pending).toBe(1);
    expect(JSON.stringify(boardBlocks(board, new Map(), "now"))).toContain("Pending, your project manager will confirm");
  });

  it("paid lines don't count", () => {
    expect(payoutFor(J1, A, [line(J1, [A], 500, { paid: true })])).toEqual({ kind: "pending" });
  });

  it("ready to be paid: calculated, unpaid, ended, and on hold while their own work order there is open", () => {
    const ended = job(OLD, "2026-11-01", [A], { end: "2026-11-10", customer: "Sam Past", city: "Oldtown" });
    const lines = [line(OLD, [A], 300), line(OLD, [B], 999)];
    const projects = new Map([[OLD, ended]]);
    const free = buildBoard({ member: member(A, "Alex One"), week, today, jobs: [], projects, lines, openWorkOrders: [] });
    expect(free.ready.map((r) => [r.label, r.amount, r.held])).toEqual([["Sam, Oldtown", 300, false]]);
    expect(free.readyTotal).toBe(300);
    const held = buildBoard({ member: member(A, "Alex One"), week, today, jobs: [], projects, lines, openWorkOrders: [{ projectId: OLD, contractorIds: [A] }] });
    expect(held.ready[0].held).toBe(true);
    expect(held.readyTotal).toBe(0);
    // Someone else's open work order doesn't hold Alex's pay.
    const other = buildBoard({ member: member(A, "Alex One"), week, today, jobs: [], projects, lines, openWorkOrders: [{ projectId: OLD, contractorIds: [B] }] });
    expect(other.ready[0].held).toBe(false);
  });

  it("a project that hasn't ended isn't ready to be paid", () => {
    const running = job(OLD, "2026-11-20", [A], { end: "2026-12-01" });
    const board = buildBoard({ member: member(A, "Alex One"), week, today, jobs: [], projects: new Map([[OLD, running]]), lines: [line(OLD, [A], 300)], openWorkOrders: [] });
    expect(board.ready).toEqual([]);
  });

  it("a line assigned to someone not on the job is on nobody's page, and reported", () => {
    const jobs = [job(J1, "2026-12-01", [A])];
    const stray = line(J1, [B], 777);
    expect(strayLines(jobs, [stray]).map((s) => s.line.id)).toEqual([stray.id]);
    const a = buildBoard({ member: member(A, "Alex One"), week, today, jobs, projects: new Map(), lines: [stray], openWorkOrders: [] });
    const b = buildBoard({ member: member(B, "Bo Two"), week, today, jobs, projects: new Map(), lines: [stray], openWorkOrders: [] });
    expect(JSON.stringify(boardBlocks(a, new Map(), "now"))).not.toContain("777");
    expect(b.jobs).toEqual([]);
    expect(b.ready).toEqual([]);
  });

  it("a missing share link says so", () => {
    const board = buildBoard({ member: member(A, "Alex One"), week, today, jobs: [job(J1, "2026-12-01", [A], { shareLink: null })], projects: new Map(), lines: [], openWorkOrders: [] });
    expect(JSON.stringify(boardBlocks(board, new Map(), "now"))).toContain("Scope link coming");
  });

  it("pages are built for everyone on a week job or with something ready", () => {
    const team = [member(A, "Alex One"), member(B, "Bo Two"), member(OLD, "Cy Three")];
    expect(membersToBuild(team, [job(J1, "2026-12-01", [A])], [line(OLD, [B], 10)]).map((m) => m.id)).toEqual([A, B]);
  });
});

describe("texts", () => {
  const board = buildBoard({ member: member(A, "Alex One", { channels: ["SMS", "WhatsApp Group", "Email"], groupId: "120363000000000000@g.us" }), week, today, jobs: [job(J1, "2026-12-01", [A])], projects: new Map(), lines: [line(J1, [A], 800)], openWorkOrders: [] });

  it("one per selected channel (Email only with an address), each to that installer's own number or group", () => {
    const m = messagesFor(board, "https://x.test/a");
    expect(m.map((x) => [x.channel, x.phone, x.whatsapp_group_id])).toEqual([
      ["SMS", "+15550000000", null],
      ["WhatsApp Group", null, "120363000000000000@g.us"],
    ]);
  });

  it("email goes to their Titan Team Email with a subject, only when Email is ticked", () => {
    const withEmail = { ...board, member: { ...board.member, channels: ["Email"], email: "alex@example.test" } };
    expect(messagesFor(withEmail, "https://x.test/a")).toEqual([
      { channel: "Email", phone: null, whatsapp_group_id: null, email: "alex@example.test", subject: "Your project week, Mon Nov 30 to Sun Dec 6", text: messageText(withEmail, "https://x.test/a") },
    ]);
    expect(messagesFor({ ...withEmail, member: { ...withEmail.member, email: "not-an-email" } }, "https://x.test/a")).toEqual([]);
    expect(messagesFor({ ...withEmail, member: { ...withEmail.member, channels: ["SMS"], phone: null } }, "https://x.test/a")).toEqual([]);
  });

  it("a channel without its contact is skipped, never swapped", () => {
    const noPhone = { ...board, member: { ...board.member, phone: null } };
    expect(messagesFor(noPhone, "https://x.test/a").map((x) => x.channel)).toEqual(["WhatsApp Group"]);
  });

  it("opens like the QA dispatch and carries no em dash", () => {
    const t = messageText(board, "https://x.test/a");
    expect(t.startsWith("[Automated] Hello Alex. This is Titan Flooring.")).toBe(true);
    expect(t).toContain("Mon Nov 30 to Sun Dec 6");
    expect(t).not.toMatch(/[—–]/);
    expect(JSON.stringify(boardBlocks(board, new Map(), "now"))).not.toMatch(/[—–]/);
  });
});

describe("reading Notion rows", () => {
  it("reads a Titan Team row, its group id bare", () => {
    const m = memberOf({
      id: A.replace(/-/g, ""),
      properties: {
        Name: { title: [{ plain_text: "Alex One" }] },
        Phone: { phone_number: "+15550000000" },
        "Dispatch Channels": { multi_select: [{ name: "Email" }] },
        "Project Week Channels": { multi_select: [{ name: "WhatsApp" }] },
        "WhatsApp Group ID": { rich_text: [{ plain_text: "[120363000000000000@g.us](mailto:120363000000000000@g.us)" }] },
        "Rate Card Name": { rich_text: [{ plain_text: "Crew A" }] },
        "Project Week Link": { url: "https://example.notion.site/abc" },
      },
    });
    expect(m.channels).toEqual(["WhatsApp"]); // its own column, never the QA dispatch's
    expect(m).toMatchObject({ id: A, name: "Alex One", groupId: "120363000000000000@g.us", rateCardName: "Crew A", boardUrl: "https://example.notion.site/abc" });
    expect(cleanGroupId(null)).toBeNull();
  });

  it("reads a project, keeping only an https share link", () => {
    const j = jobOf({
      id: J1,
      properties: {
        Name: { rich_text: [{ plain_text: "Pat Example" }] },
        "Confirmed Start Date": { date: { start: "2026-12-01T08:00:00.000-05:00" } },
        Contractor: { relation: [{ id: A }, { id: B }] },
        "CCAM Share Link": { url: "javascript:alert(1)" },
      },
    });
    expect(j.start).toBe("2026-12-01");
    expect(j.contractors).toEqual([A, B]);
    expect(j.shareLink).toBeNull();
  });

  it("reads a cost line: paid is a Paid Reference, the app's own lines carry the mark", () => {
    const l = costLineOf({
      id: J2,
      properties: {
        Project: { relation: [{ id: J1 }] },
        "Assigned To": { relation: [{ id: A }] },
        Cost: { number: 800 },
        "Calculated (1/3)": { checkbox: true },
        "Paid Reference (3/3)": { rich_text: [] },
        Notes: { rich_text: [{ plain_text: `${cardMark("recAAAAAAAAAAAAAA", "c1")} Made by the quote app.` }] },
      },
    });
    expect(l).toMatchObject({ projectId: J1, assignedTo: [A], cost: 800, calculated: true, paid: false, fromCard: true });
  });

  it("matches a card's contractor to exactly the Rate Card Name, case and spacing aside", () => {
    const team = [{ id: A, rateCardName: "Crew  A" }, { id: B, rateCardName: "Crew AB" }];
    expect(matchRateCardName(team, "crew a").map((m) => m.id)).toEqual([A]);
    expect(matchRateCardName(team, "Crew")).toEqual([]);
    expect(matchRateCardName(team, "  ")).toEqual([]);
  });
});

describe("the page layout (2026-11-24: week grid and day cards)", () => {
  const jobs = [job(J1, "2026-11-30", [A], { city: "Bolton", type: "Flooring" }), job(J2, "2026-11-30", [A], { city: "Milton", type: "Stairs" }), job(OLD, "2026-12-02", [A], { city: "Oakville", type: null })];
  const board = buildBoard({ member: member(A, "Alex One"), week, today, jobs, projects: new Map(), lines: [line(J1, [A], 800)], openWorkOrders: [] });

  it("the grid has a column per day, stacks two jobs on one day, and says Free on empty days", () => {
    expect(weekDays(week)).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
    const grid = weekGrid(board) as { table: { table_width: number; children: { table_row: { cells: { text: { content: string } }[][] } }[] } };
    expect(grid.table.table_width).toBe(7);
    const rows = grid.table.children.map((r) => r.table_row.cells.map((c) => c[0].text.content));
    expect(rows[0][0]).toBe("Mon Nov 30");
    expect(rows[1]).toEqual(["Bolton, Flooring", "Free", "Oakville", "Free", "Free", "Free", "Free"]);
    expect(rows[2]).toEqual(["Milton, Stairs", "", "", "", "", "", ""]);
  });

  it("no jobs, no grid", () => {
    expect(weekGrid({ ...board, jobs: [] })).toBeNull();
  });

  it("each job is a card, blue when its payout is final and yellow while pending", () => {
    const cards = boardBlocks(board, new Map(), "now").filter((b) => (b as { type: string }).type === "callout") as { callout: { color: string; rich_text: { text: { content: string } }[] } }[];
    expect(cards.map((c) => [c.callout.rich_text[0].text.content, c.callout.color])).toEqual([
      ["Mon Nov 30 · Bolton · Flooring", "blue_background"],
      ["Mon Nov 30 · Milton · Stairs", "yellow_background"],
      ["Wed Dec 2 · Oakville", "yellow_background"],
      ["Week total, confirmed: $800 (plus 2 pending)", "green_background"],
    ]);
  });
});
