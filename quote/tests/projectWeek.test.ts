import { describe, expect, it } from "vitest";
import { boardBlocks, buildBoard, membersToBuild, messagesFor, messageText, nextWeek, payoutFor, strayLines, torontoToday, type CostLine, type Job, type Member } from "@/lib/projectWeek/model";
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
    // No payout total in the text (2026-11-25): payouts are on the page only.
    expect(messageText(a, "https://x.test/a")).not.toContain("800");
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
    expect(free.ready.map((r) => [r.label, r.amount, r.held])).toEqual([["Sam Past · 1 Test St, Oldtown · Flooring", 300, false]]);
    expect(free.readyTotal).toBe(300);
    // Finished jobs show no dollar amount, on the page or in the text (Albert, 2026-11-25).
    expect(JSON.stringify(boardBlocks(free, new Map(), "now"))).not.toContain("300");
    expect(JSON.stringify(boardBlocks(free, new Map(), "now"))).toContain("payment is on the way".replace("p", "P"));
    expect(messageText(free, "https://x.test/a")).not.toContain("300");
    expect(messageText(free, "https://x.test/a")).toContain("payment is on the way");
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

describe("the work, in the standard layout (2026-11-25)", () => {
  it("sorts items into Install, Remove and Stairs, and counts the stairs", async () => {
    const { workFromItems, workLines, workKind } = await import("@/lib/projectWeek/work");
    const w = workFromItems([
      { section: "Install", description: "Engineered hardwood", qty: 650, uom: "sf" },
      { section: "Install", description: "Vinyl plank", qty: 120, uom: "sf" },
      { section: "Removal", description: "Carpet", qty: 400, uom: "sf" },
      { section: "Prep", description: "Floor levelling", qty: 200, uom: "sf" },
      { section: "Stairs", description: "Oak tread cap", qty: 14, uom: "steps" },
      { section: "Stairs", description: "Oak riser", qty: 16, uom: "steps" },
      { section: "Stairs", description: "Vinyl riser wrap", qty: 16, uom: "pcs" },
      { section: "Stairs", description: "Refinish handrail", qty: 12, uom: "ft" },
      { section: "Stairs", description: "Iron spindles", qty: 20, uom: "pcs" },
      { section: "Stairs", description: "Newel post", qty: 2, uom: "pcs" },
      { section: "Stairs", description: "Stair nosing", qty: 14, uom: "ft" },
      { section: "Disposal", description: "Bin", qty: 1, uom: null },
    ])!;
    expect(workLines(w)).toEqual([
      { label: "Install", text: "650sf Engineered hardwood" },
      { label: "Install", text: "120sf Vinyl plank" },
      { label: "Remove", text: "400sf Carpet" },
      { label: "Prep", text: "200sf Floor levelling" },
      { label: "Stairs", text: "New Steps, Refinish - 14 steps | 20 spindles | 2 posts | 12ft handrails | 14ft nosings" },
    ]);
    expect(workKind(w, "Both")).toBe("Flooring & Stairs");
    expect(workKind(w, null)).toBe("Flooring & Stairs");
    expect(workKind({ ...w, install: [], remove: [], prep: [] }, null)).toBe("Stairs Only");
  });

  it("a payout card's ticked lines round-trip through the Project Costs Notes", async () => {
    const { cardScope } = await import("@/lib/payout/cards");
    const { workOf } = await import("@/lib/projectWeek/rows");
    const { parseWork, workLines } = await import("@/lib/projectWeek/work");
    const l = (section: string, description: string, qty: number | null, uom: string, on = true) => ({ id: description, ref: null, option: null, section, description, area: "", uom, qty, rate: 1, cardRate: null, on });
    const stored = cardScope({ lines: [l("Install", "Install engineered", 650, "sf"), l("Removal", "Remove carpet", 400, "sf", false)] });
    const notes = `${cardMark("recAAAAAAAAAAAAAA", "c1")} Work: ${stored}. Made by the quote app from the payout card. Change the card in the quote app, not this line.`;
    expect(workLines(parseWork(workOf(notes))!)).toEqual([{ label: "Install", text: "650sf Install engineered" }]);
    expect(workOf("typed by hand")).toBeNull();
  });

  it("the accepted quote's sections give the same shape, never a price", async () => {
    const { scopeFromCopy } = await import("@/lib/projectWeek/scope");
    const { workLines } = await import("@/lib/projectWeek/work");
    const item = (description: string, qty: number | null, uom: string | null, optional = false) => ({ kind: "item" as const, n: 1, description, note: null, qty, uom, wastePct: null, unitPrice: 9.99, minimum: false, amount: 1234.56, optional });
    const copy = { options: [{ name: "Option 1", sections: [{ name: "Install", total: 9, lines: [item("Engineered hardwood", 650, "sf"), item("Upgrade underpad", 650, "sf", true)] }, { name: "Discounts", total: -1, lines: [item("Loyalty", 1, null)] }] }] } as unknown as import("@/lib/send/copy").CustomerCopy;
    const lines = workLines(scopeFromCopy(copy)!);
    expect(lines).toEqual([{ label: "Install", text: "650sf Engineered hardwood" }]);
    expect(JSON.stringify(lines)).not.toMatch(/9\.99|1234/);
  });

  it("on the page: the installer's own card work wins over the quote, another installer's never shows", async () => {
    const { serializeWork } = await import("@/lib/projectWeek/work");
    const mine = serializeWork({ install: ["650 sf Install engineered"], remove: [], stairTypes: [], stairs: { steps: 0, spindles: 0, posts: 0, handrails: 0, nosings: 0 } });
    const theirs = serializeWork({ install: [], remove: [], stairTypes: ["Refinish"], stairs: { steps: 14, spindles: 0, posts: 0, handrails: 0, nosings: 0 } });
    const quote = { install: ["700 sf From the quote"], remove: [], stairTypes: [], stairs: { steps: 0, spindles: 0, posts: 0, handrails: 0, nosings: 0 } };
    const j = job(J1, "2026-12-01", [A, B], { type: "Both", quoteScope: quote });
    const withCard = buildBoard({ member: member(A, "Alex One"), week, today, jobs: [j], projects: new Map(), lines: [line(J1, [A], 800, { work: mine }), line(J1, [B], 300, { work: theirs })], openWorkOrders: [] });
    const text = JSON.stringify(boardBlocks(withCard, new Map(), "now"));
    expect(text).toContain("Flooring & Stairs");
    expect(text).toContain("650 sf Install engineered");
    expect(text).not.toContain("Refinish");
    expect(text).not.toContain("From the quote");
    const noCard = buildBoard({ member: member(A, "Alex One"), week, today, jobs: [j], projects: new Map(), lines: [], openWorkOrders: [] });
    expect(JSON.stringify(boardBlocks(noCard, new Map(), "now"))).toContain("700 sf From the quote");
  });
});

describe("the send log on a Titan Team row (2026-11-25)", () => {
  it("says Needs Manual if anything failed, with the reason on the line", async () => {
    const { logLine, memberStatus } = await import("@/lib/projectWeek/model");
    const ok = { memberId: "m", name: "Alex One", status: "Sent Successfully" as const, channel: "SMS", test: true, jobs: 2, reason: null };
    const bad = { ...ok, status: "Needs Manual" as const, channel: "None", reason: "No Project Week Channels set." };
    expect(memberStatus([ok])).toBe("Sent Successfully");
    expect(memberStatus([ok, bad])).toBe("Needs Manual");
    const week = { mon: "2026-11-30", sun: "2026-12-06" };
    expect(logLine(ok, week, "Send my week", "Nov 25, 2026, 4:12 p.m.")).toMatch(/^Nov 25, 2026, 4:12 p\.m\.: Sent Successfully\. Project Week .+, 2 jobs \(SMS, Test, Send my week\)\.$/);
    expect(logLine(bad, week, "Send all", "now")).toMatch(/: Needs Manual\. .+ \(Test, Send all\)\. No Project Week Channels set\.$/);
  });
});

describe("the Dispatch Log columns on a Titan Team page (2026-11-25)", () => {
  it("are Project Week on the left and QA Dispatch on the right, found by their headings", async () => {
    const { dispatchLogBlocks, isDispatchColumns } = await import("@/lib/projectWeek/model");
    const json = JSON.stringify(dispatchLogBlocks());
    expect(json.indexOf("Project Week")).toBeLessThan(json.indexOf("QA Dispatch"));
    expect(json).toContain('"type":"column_list"');
    expect(isDispatchColumns(["Project Week", "QA Dispatch"])).toBe(true);
    expect(isDispatchColumns(["QA Dispatch", "Project Week"])).toBe(false);
    expect(isDispatchColumns(["Project Week"])).toBe(false);
  });
});

describe("every upcoming job (2026-11-25)", () => {
  it("takes jobs starting today or later, and ones still running, grouped by week on the page", async () => {
    const { jobInWindow, upcoming, mondayOf, periodLabel } = await import("@/lib/projectWeek/model");
    const w = upcoming("2026-11-25");
    expect(jobInWindow({ start: "2027-03-01", end: null }, w)).toBe(true);
    expect(jobInWindow({ start: "2026-11-20", end: "2026-11-26" }, w)).toBe(true);
    expect(jobInWindow({ start: "2026-11-20", end: "2026-11-24" }, w)).toBe(false);
    expect(jobInWindow({ start: null, end: null }, w)).toBe(false);
    expect(mondayOf("2026-12-03")).toBe("2026-11-30");
    expect(mondayOf("2026-11-30")).toBe("2026-11-30");
    expect(periodLabel(w)).toBe("Wed Nov 25 on");
  });
});

describe("the card pictures fold under Your payout (2026-11-25)", () => {
  it("is a toggle holding the pictures when there are any, a plain line when not", async () => {
    const { boardBlocks } = await import("@/lib/projectWeek/model");
    const job = { id: "j1", customer: "Sam Test", street: "1 Test St", city: "Testville", phone: null, type: "Flooring", start: "2026-12-01", end: null, contractors: ["m1"], shareLink: null, camUrl: null };
    const board = { member: { id: "m1", name: "Alex One", phone: null, channels: [], groupId: null, email: null, boardUrl: null }, week: { mon: "2026-11-25", sun: "9999-12-31" }, jobs: [{ job, payout: { kind: "final", amount: 500 }, cardLineIds: [], work: null }], ready: [], weekTotal: 500, pending: 0, readyTotal: 0 } as unknown as Parameters<typeof boardBlocks>[0];
    const withPics = boardBlocks(board, new Map([["j1", ["up1", "up2"]]]), "now") as { type: string; toggle?: { children: { type: string }[] } }[];
    const t = withPics.find((b) => b.type === "toggle")!;
    expect(t.toggle!.children.map((c) => c.type)).toEqual(["image", "image"]);
    expect(withPics.filter((b) => b.type === "image")).toEqual([]);
    const none = boardBlocks(board, new Map(), "now") as { type: string }[];
    expect(none.some((b) => b.type === "toggle")).toBe(false);
  });
});

describe("what changed since the last text (2026-11-25)", () => {
  it("names only what changed, in a fixed order, and says so when nothing did", async () => {
    const { changesSince } = await import("@/lib/projectWeek/changes");
    const prev = { v: 1 as const, j: { a1: ["2026-12-01", "", "h1", "w1", "p1", 0] as [string, string, string, string, string, 0 | 1], b2: ["2026-12-03", "", "h2", "w2", "p2", 1] as [string, string, string, string, string, 0 | 1] }, r: [] };
    expect(changesSince(prev, prev, "2026-11-25")).toEqual([]);
    const now = { v: 1 as const, j: { a1: ["2026-12-02", "", "h1", "w9", "p9", 1] as [string, string, string, string, string, 0 | 1], c3: ["2026-12-09", "", "h3", "", "p3", 0] as [string, string, string, string, string, 0 | 1] }, r: ["l1"] };
    expect(changesSince(prev, now, "2026-11-25")).toEqual(["Extra job", "Job removed", "Some dates changed", "Scope changed", "Payout updated", "Photos added", "Payment on the way"]);
    // A job that dropped off because it ended isn't "removed".
    expect(changesSince(prev, { ...prev, j: { a1: prev.j.a1 } }, "2026-12-05")).toEqual([]);
  });

  it("the text carries the phrases, no dollar amount, and nothing extra on a first text", async () => {
    const { messageText, buildBoard } = await import("@/lib/projectWeek/model");
    const board = buildBoard({ member: { id: "m1", name: "Alex One", phone: null, channels: [], groupId: null, boardUrl: null }, week: { mon: "2026-11-25", sun: "9999-12-31" }, today: "2026-11-25", jobs: [], projects: new Map(), lines: [], openWorkOrders: [] });
    expect(messageText({ ...board, changes: null }, "https://x.test/a")).not.toMatch(/What's new|No changes/);
    expect(messageText({ ...board, changes: [] }, "https://x.test/a")).toContain("No changes since your last update.");
    expect(messageText({ ...board, changes: ["Extra job", "Some dates changed"] }, "https://x.test/a")).toContain("What's new: Extra job, Some dates changed.");
  });
});
